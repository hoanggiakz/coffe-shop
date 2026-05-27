package com.coffeeshop.userservice.dto.hr;

import lombok.Data;

@Data
public class EmployeeSalaryComponentAssignRequest {
    private String userId;
    private String salaryComponentId;
    private String effectiveFrom;
    private String effectiveTo;
    private Double customAmount;
}

