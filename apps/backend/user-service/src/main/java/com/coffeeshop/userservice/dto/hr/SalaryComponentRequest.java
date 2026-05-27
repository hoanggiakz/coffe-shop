package com.coffeeshop.userservice.dto.hr;

import lombok.Data;

@Data
public class SalaryComponentRequest {
    private String branchId;
    private String name;
    private String type;
    private String calculationType;
    private Double amount;
    private String appliesToRoles;
    private Boolean isActive;
}

