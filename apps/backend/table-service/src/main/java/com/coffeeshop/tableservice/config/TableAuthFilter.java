package com.coffeeshop.tableservice.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HashSet;
import java.util.Set;

@Component
@Order(1)
public class TableAuthFilter extends OncePerRequestFilter {

    private static final Set<String> TABLE_WRITE_ROLES = Set.of("ADMIN", "MANAGER", "WAITER", "STAFF");

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${jwt.secret:}")
    private String jwtSecret;

    @Value("${app.internal-service-token:}")
    private String internalServiceToken;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if (!requiresTableWriteAuth(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = bearerToken(request);
        if (token == null || token.isBlank()) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "Missing bearer token");
            return;
        }

        if (!internalServiceToken.isBlank() && internalServiceToken.equals(token)) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            Set<String> roles = rolesFromJwt(token);
            if (roles.stream().noneMatch(TABLE_WRITE_ROLES::contains)) {
                writeError(response, HttpServletResponse.SC_FORBIDDEN, "FORBIDDEN_ROLE");
                return;
            }
        } catch (Exception ex) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "Invalid bearer token");
            return;
        }

        filterChain.doFilter(request, response);
    }

    private boolean requiresTableWriteAuth(HttpServletRequest request) {
        String method = request.getMethod().toUpperCase();
        String path = request.getRequestURI();
        if (!path.startsWith("/api/tables")) return false;
        if ("OPTIONS".equals(method)) return false;
        if ("GET".equals(method)) return false;
        if ("POST".equals(method) && path.matches("^/api/tables/[^/]+/call-(staff|waiter)$")) return false;
        return true;
    }

    private String bearerToken(HttpServletRequest request) {
        String auth = request.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) return null;
        return auth.substring("Bearer ".length()).trim();
    }

    private Set<String> rolesFromJwt(String token) throws Exception {
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            throw new IllegalArgumentException("Invalid JWT format");
        }
        String signedContent = parts[0] + "." + parts[1];
        String expectedSignature = hmacSha256Base64Url(signedContent, signingKey());
        if (!constantTimeEquals(expectedSignature, parts[2])) {
            throw new IllegalArgumentException("Invalid JWT signature");
        }

        JsonNode payload = objectMapper.readTree(Base64.getUrlDecoder().decode(parts[1]));
        JsonNode exp = payload.get("exp");
        if (exp != null && exp.isNumber() && Instant.now().getEpochSecond() >= exp.asLong()) {
            throw new IllegalArgumentException("JWT expired");
        }

        Set<String> roles = new HashSet<>();
        JsonNode role = payload.get("role");
        if (role != null && role.isTextual()) {
            roles.add(normalizeRole(role.asText()));
        }
        JsonNode roleList = payload.get("roles");
        if (roleList != null && roleList.isArray()) {
            roleList.forEach(item -> roles.add(normalizeRole(item.asText(""))));
        }
        roles.remove("");
        return roles;
    }

    private byte[] signingKey() {
        byte[] key = jwtSecret.getBytes(StandardCharsets.UTF_8);
        if (key.length >= 32) return key;
        byte[] padded = new byte[32];
        System.arraycopy(key, 0, padded, 0, key.length);
        return padded;
    }

    private String hmacSha256Base64Url(String value, byte[] key) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    private boolean constantTimeEquals(String expected, String actual) {
        byte[] expectedBytes = expected.getBytes(StandardCharsets.UTF_8);
        byte[] actualBytes = actual.getBytes(StandardCharsets.UTF_8);
        if (expectedBytes.length != actualBytes.length) return false;
        int result = 0;
        for (int i = 0; i < expectedBytes.length; i += 1) {
            result |= expectedBytes[i] ^ actualBytes[i];
        }
        return result == 0;
    }

    private String normalizeRole(String role) {
        return role == null ? "" : role.trim().toUpperCase();
    }

    private void writeError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"statusCode\":" + status + ",\"message\":\"" + message + "\"}");
    }
}
