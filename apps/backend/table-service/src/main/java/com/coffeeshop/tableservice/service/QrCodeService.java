package com.coffeeshop.tableservice.service;

import com.coffeeshop.tableservice.entity.CoffeeTable;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Service
public class QrCodeService {

    @Value("${app.base-url}")
    private String configuredBaseUrl;

    /**
     * Tạo URL menu cho bàn và trả về ảnh QR dưới dạng base64.
     */
    public String generateQrBase64(CoffeeTable table) {
        return generateQrBase64(table, null);
    }

    public String generateQrBase64(CoffeeTable table, String baseUrlOverride) {
        String effectiveBaseUrl = sanitizeBaseUrl(baseUrlOverride);
        StringBuilder menuUrl = new StringBuilder(effectiveBaseUrl)
                .append("/menu?tableId=")
                .append(urlEncode(table.getId()));

        if (table.getBranchId() != null && !table.getBranchId().isBlank()) {
            menuUrl.append("&branchId=").append(urlEncode(table.getBranchId()));
        }
        if (table.getNumber() != null) {
            menuUrl.append("&tableNumber=").append(table.getNumber());
        }

        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(menuUrl.toString(), BarcodeFormat.QR_CODE, 300, 300);
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", outputStream);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(outputStream.toByteArray());
        } catch (WriterException | IOException e) {
            throw new RuntimeException("Không thể tạo mã QR", e);
        }
    }

    private String urlEncode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String sanitizeBaseUrl(String baseUrlOverride) {
        String source = (baseUrlOverride != null && !baseUrlOverride.isBlank()) ? baseUrlOverride : configuredBaseUrl;
        String candidate = source == null ? "" : source.trim();
        if (candidate.endsWith("/")) {
            return candidate.substring(0, candidate.length() - 1);
        }
        return candidate;
    }
}
