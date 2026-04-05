package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class PayrollItemResponse {
    private String staffId;
    private String staffName;
    private String employeeCode;
    private String role;
    private String branchId;
    private String branchName;
    private Long hourlyRate;
    private Long totalWorkingMinutes;
    private Double totalWorkingHours;
    private Integer attendanceDays;
    private Integer completedShifts;
    private Long estimatedPay;
}
