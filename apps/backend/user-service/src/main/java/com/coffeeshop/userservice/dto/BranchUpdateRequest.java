package com.coffeeshop.userservice.dto;

import lombok.Data;

@Data
public class BranchUpdateRequest {
    private String name;
    private String address;
    private String phone;
    private String managerId;
    private Boolean isActive;
}
