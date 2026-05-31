package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class CustomerAuthResponse {
    private String accessToken;
    private String refreshToken;
    private Long expiresIn;
    private UserProfile user;
    private Boolean isNewUser;
}

