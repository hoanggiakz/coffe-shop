package com.coffeeshop.userservice.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CustomerOtpLoginRequest {
    @NotBlank
    private String phone;

    @NotBlank
    private String otp;
}
