package com.coffeeshop.tableservice.controller;

import com.coffeeshop.tableservice.dto.CallStaffRequest;
import com.coffeeshop.tableservice.dto.BatchQrRequest;
import com.coffeeshop.tableservice.dto.CreateTableRequest;
import com.coffeeshop.tableservice.dto.UpdateTableRequest;
import com.coffeeshop.tableservice.dto.UpdateStatusRequest;
import com.coffeeshop.tableservice.entity.CoffeeTable;
import com.coffeeshop.tableservice.service.TableService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/tables")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class TableController {

    private final TableService tableService;

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of(
                "service", "table-service",
                "status", "ok",
                "timestamp", java.time.Instant.now().toString()
        ));
    }

    @GetMapping
    public ResponseEntity<List<CoffeeTable>> findAll(@RequestParam(required = false) String branchId) {
        return ResponseEntity.ok(tableService.findAll(branchId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CoffeeTable> findById(@PathVariable String id) {
        return ResponseEntity.ok(tableService.findById(id));
    }

    @PostMapping
    public ResponseEntity<CoffeeTable> create(@Valid @RequestBody CreateTableRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(tableService.create(request));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<CoffeeTable> update(
            @PathVariable String id,
            @Valid @RequestBody UpdateTableRequest request) {
        return ResponseEntity.ok(tableService.update(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable String id) {
        return ResponseEntity.ok(tableService.delete(id));
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<CoffeeTable> updateStatus(
            @PathVariable String id,
            @Valid @RequestBody UpdateStatusRequest request) {
        return ResponseEntity.ok(tableService.updateStatus(id, request.getStatus()));
    }

    @GetMapping("/{id}/qr")
    public ResponseEntity<Map<String, String>> getQrCode(@PathVariable String id) {
        String qr = tableService.getQrCode(id);
        return ResponseEntity.ok(Map.of("qrCode", qr));
    }

    @PostMapping("/qr/batch")
    public ResponseEntity<List<Map<String, String>>> getQrCodesBatch(@RequestBody(required = false) BatchQrRequest request) {
        List<String> tableIds = request != null ? request.getTableIds() : null;
        return ResponseEntity.ok(tableService.getQrBatch(tableIds));
    }

    @PostMapping("/{id}/call-staff")
    public ResponseEntity<Map<String, String>> callStaff(
            @PathVariable String id,
            @RequestBody(required = false) CallStaffRequest request) {
        return ResponseEntity.ok(tableService.callStaff(id, request));
    }
}
