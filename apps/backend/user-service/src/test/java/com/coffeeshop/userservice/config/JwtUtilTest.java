package com.coffeeshop.userservice.config;

import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtUtilTest {

    private JwtUtil jwtUtil;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil();
        ReflectionTestUtils.setField(jwtUtil, "secret", "jwt-secret-for-test-0123456789");
        ReflectionTestUtils.setField(jwtUtil, "expiration", 86_400_000L);
    }

    @Test
    void generateAndParseToken_ShouldContainClaims() {
        String token = jwtUtil.generateToken("user-1", "user1@coffee.local", "MANAGER", "branch-1");

        Claims claims = jwtUtil.parseToken(token);
        assertEquals("user-1", claims.getSubject());
        assertEquals("user1@coffee.local", claims.get("email", String.class));
        assertEquals("MANAGER", claims.get("role", String.class));
        assertEquals("branch-1", claims.get("branchId", String.class));
    }

    @Test
    void getUserIdFromToken_ShouldReturnSubject() {
        String token = jwtUtil.generateToken("user-2", "user2@coffee.local", "STAFF", "branch-2");
        assertEquals("user-2", jwtUtil.getUserIdFromToken(token));
    }

    @Test
    void validateToken_ShouldReturnTrueForValidToken() {
        String token = jwtUtil.generateToken("user-3", "user3@coffee.local", "ADMIN", null);
        assertTrue(jwtUtil.validateToken(token));
    }

    @Test
    void validateToken_ShouldReturnFalseForInvalidToken() {
        assertFalse(jwtUtil.validateToken("invalid.token.value"));
    }
}
