package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class AuthResponse {
    private String accessToken;
    private String refreshToken;
    private Long expiresIn;
    private UserProfile user;

    public AuthResponse(String accessToken, UserProfile user) {
        this.accessToken = accessToken;
        this.user = user;
    }

    public AuthResponse(String accessToken, String refreshToken, Long expiresIn, UserProfile user) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.expiresIn = expiresIn;
        this.user = user;
    }
}
