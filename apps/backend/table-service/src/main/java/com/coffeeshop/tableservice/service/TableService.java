package com.coffeeshop.tableservice.service;

import com.coffeeshop.tableservice.dto.CallStaffRequest;
import com.coffeeshop.tableservice.dto.CreateTableRequest;
import com.coffeeshop.tableservice.dto.UpdateTableRequest;
import com.coffeeshop.tableservice.entity.CoffeeTable;
import com.coffeeshop.tableservice.repository.TableRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

@Service
@RequiredArgsConstructor
public class TableService {
    private static final Logger log = LoggerFactory.getLogger(TableService.class);

    private final TableRepository tableRepository;
    private final QrCodeService qrCodeService;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${app.chat-service-url:http://chat-service:3007/api/chats}")
    private String chatServiceUrl;

    @Value("${app.order-service-url:http://order-service:3001/api/orders}")
    private String orderServiceUrl;

    public List<CoffeeTable> findAll(String branchId) {
        if (branchId != null && !branchId.isEmpty()) {
            return tableRepository.findByBranchId(branchId);
        }
        return tableRepository.findAll();
    }

    public CoffeeTable findById(String id) {
        return tableRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bàn"));
    }

    public CoffeeTable create(CreateTableRequest req) {
        if (tableRepository.existsByNumber(req.getNumber())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Số bàn đã tồn tại");
        }

        CoffeeTable table = CoffeeTable.builder()
                .number(req.getNumber())
                .area(req.getArea())
                .capacity(req.getCapacity())
                .branchId(req.getBranchId())
                .status(CoffeeTable.TableStatus.AVAILABLE)
                .build();

        table = tableRepository.save(table);

        // Sinh mã QR sau khi có ID
        String qrBase64 = qrCodeService.generateQrBase64(table);
        table.setQrCode(qrBase64);
        return tableRepository.save(table);
    }

    public CoffeeTable update(String id, UpdateTableRequest req) {
        CoffeeTable table = findById(id);

        boolean shouldRegenerateQr = false;

        if (req.getNumber() != null && !req.getNumber().equals(table.getNumber())) {
            if (tableRepository.existsByNumberAndIdNot(req.getNumber(), id)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Số bàn đã tồn tại");
            }
            table.setNumber(req.getNumber());
            shouldRegenerateQr = true;
        }

        if (req.getArea() != null) {
            table.setArea(req.getArea().trim());
        }

        if (req.getCapacity() != null) {
            if (req.getCapacity() < 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sức chứa phải lớn hơn 0");
            }
            table.setCapacity(req.getCapacity());
        }

        if (req.getBranchId() != null) {
            String oldBranch = table.getBranchId();
            String nextBranch = req.getBranchId().trim();
            table.setBranchId(nextBranch.isBlank() ? null : nextBranch);
            if ((oldBranch == null && table.getBranchId() != null) ||
                    (oldBranch != null && !oldBranch.equals(table.getBranchId()))) {
                shouldRegenerateQr = true;
            }
        }

        if (req.getStatus() != null) {
            table.setStatus(req.getStatus());
        }

        if (shouldRegenerateQr) {
            table.setQrCode(qrCodeService.generateQrBase64(table));
        }

        return tableRepository.save(table);
    }

    public Map<String, Object> delete(String id) {
        CoffeeTable table = findById(id);
        if (table.getStatus() == CoffeeTable.TableStatus.OCCUPIED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Không thể xóa bàn đang có khách");
        }
        if (hasActiveOrders(id)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Không thể xóa bàn đang có đơn xử lý");
        }
        tableRepository.deleteById(id);
        return Map.of("id", id, "deleted", true);
    }

    public CoffeeTable updateStatus(String id, CoffeeTable.TableStatus status) {
        CoffeeTable table = findById(id);
        table.setStatus(status);
        return tableRepository.save(table);
    }

    public String getQrCode(String id) {
        return getQrCode(id, null);
    }

    public String getQrCode(String id, String baseUrlOverride) {
        CoffeeTable table = findById(id);
        String qr = qrCodeService.generateQrBase64(table, baseUrlOverride);
        table.setQrCode(qr);
        tableRepository.save(table);
        return qr;
    }

    public List<Map<String, String>> getQrBatch(List<String> tableIds) {
        return getQrBatch(tableIds, null);
    }

    public List<Map<String, String>> getQrBatch(List<String> tableIds, String baseUrlOverride) {
        List<CoffeeTable> tables;
        if (tableIds == null || tableIds.isEmpty()) {
            tables = tableRepository.findAll();
        } else {
            Set<String> uniqueIds = new HashSet<>(tableIds);
            tables = tableRepository.findAllById(uniqueIds);
        }

        List<CoffeeTable> sortedTables = new ArrayList<>(tables);
        sortedTables.sort(Comparator.comparing(CoffeeTable::getNumber));

        List<Map<String, String>> payload = new ArrayList<>();
        for (CoffeeTable table : sortedTables) {
            String qrCode = qrCodeService.generateQrBase64(table, baseUrlOverride);
            table.setQrCode(qrCode);
            tableRepository.save(table);
            payload.add(Map.of(
                    "id", table.getId(),
                    "number", String.valueOf(table.getNumber()),
                    "qrCode", qrCode
            ));
        }
        return payload;
    }

    public Map<String, String> callStaff(String id, CallStaffRequest req) {
        CoffeeTable table = findById(id);
        String reason = normalizeReason(req);
        String senderName = "Bàn " + table.getNumber();
        String content = "[CALL_STAFF] " + reason;

        try {
            String chatId = getOrCreateOpenChat(table, senderName);
            Map<String, Object> messagePayload = new HashMap<>();
            messagePayload.put("senderType", "CUSTOMER");
            messagePayload.put("senderName", senderName);
            messagePayload.put("content", content);
            executeWithRetry(
                    () -> restTemplate.postForEntity(chatServiceUrl + "/" + chatId + "/messages", messagePayload, Map.class),
                    "gui thong bao goi nhan vien"
            );
        } catch (Exception ex) {
            log.error("Không thể gửi thông báo gọi nhân viên cho bàn {}", table.getNumber(), ex);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Không thể gọi nhân viên lúc này");
        }

        return Map.of(
                "message", "Đã gửi yêu cầu gọi nhân viên",
                "tableId", table.getId(),
                "reason", reason
        );
    }

    private String getOrCreateOpenChat(CoffeeTable table, String senderName) {
        String queryUrl = chatServiceUrl + "?tableId=" + URLEncoder.encode(table.getId(), StandardCharsets.UTF_8);
        ResponseEntity<List> response = executeWithRetry(
                () -> restTemplate.getForEntity(queryUrl, List.class),
                "lay danh sach chat dang mo"
        );
        List<?> chats = response.getBody();

        if (chats != null) {
            for (Object entry : chats) {
                if (entry instanceof Map<?, ?> chat) {
                    Object status = chat.get("status");
                    Object id = chat.get("id");
                    if ("OPEN".equals(String.valueOf(status)) && id != null) {
                        return String.valueOf(id);
                    }
                }
            }
        }

        Map<String, Object> createPayload = new HashMap<>();
        createPayload.put("tableId", table.getId());
        createPayload.put("customerName", senderName);

        ResponseEntity<Map> created = executeWithRetry(
                () -> restTemplate.postForEntity(chatServiceUrl, createPayload, Map.class),
                "tao chat moi cho ban"
        );
        Map<?, ?> body = created.getBody();
        if (body == null || body.get("id") == null) {
            throw new IllegalStateException("Không tạo được phiên chat để gọi nhân viên");
        }
        return String.valueOf(body.get("id"));
    }

    private String normalizeReason(CallStaffRequest req) {
        if (req == null || req.getReason() == null || req.getReason().isBlank()) {
            return "Cần hỗ trợ tại bàn";
        }
        return req.getReason().trim();
    }

    private boolean hasActiveOrders(String tableId) {
        try {
            String url = orderServiceUrl + "?tableId=" + URLEncoder.encode(tableId, StandardCharsets.UTF_8);
            ResponseEntity<List> response = executeWithRetry(
                    () -> restTemplate.getForEntity(url, List.class),
                    "kiem tra don hang dang xu ly"
            );
            List<?> orders = response.getBody();
            if (orders == null || orders.isEmpty()) {
                return false;
            }

            Set<String> activeStatuses = Set.of("PENDING", "CONFIRMED", "PREPARING", "READY");
            for (Object item : orders) {
                if (item instanceof Map<?, ?> order) {
                    Object status = order.get("status");
                    if (status != null && activeStatuses.contains(String.valueOf(status))) {
                        return true;
                    }
                }
            }
            return false;
        } catch (Exception ex) {
            log.warn("Không kiểm tra được trạng thái đơn khi xóa bàn {}, mặc định chặn xóa", tableId, ex);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Không thể kiểm tra trạng thái đơn của bàn");
        }
    }

    private <T> ResponseEntity<T> executeWithRetry(Supplier<ResponseEntity<T>> action, String description) {
        RuntimeException lastError = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                return action.get();
            } catch (RuntimeException ex) {
                lastError = ex;
                if (attempt >= 3) {
                    break;
                }
                log.warn("Retry {}/2 khi {}", attempt, description, ex);
                sleepQuietly(250L * attempt);
            }
        }
        throw lastError != null ? lastError : new IllegalStateException("Request that bai: " + description);
    }

    private void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Retry bi gian doan", ex);
        }
    }
}
