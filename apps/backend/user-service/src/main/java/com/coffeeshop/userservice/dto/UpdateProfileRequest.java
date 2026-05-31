package com.coffeeshop.userservice.dto;

import lombok.Data;

@Data
public class UpdateProfileRequest {
    private String name;
    private String email;
    private String phone;
    private String avatarUrl;
    private String dateOfBirth;
    private String verifyOtp;
    private String verifyPurpose;
}
