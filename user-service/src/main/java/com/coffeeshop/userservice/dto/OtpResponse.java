package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class OtpResponse {
    private String message;
    private String otp;
    private long expiresInSeconds;
}
