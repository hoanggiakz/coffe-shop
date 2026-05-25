package com.coffeeshop.userservice.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class BranchCreateRequest {
    @NotBlank
    private String name;

    @NotBlank
    private String code;

    private String address;
    private String phone;
    private String managerId;
    private Boolean isActive;
}
