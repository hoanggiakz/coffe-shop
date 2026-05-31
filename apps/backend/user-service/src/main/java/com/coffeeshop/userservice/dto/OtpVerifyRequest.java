package com.coffeeshop.userservice.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class OtpVerifyRequest {
    @NotBlank
    private String phone;

    @NotBlank
    private String otp;

    @NotBlank
    private String purpose;

    private String name;
    private String email;
}

