package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
@AllArgsConstructor
public class PayrollSummaryResponse {
    private LocalDate dateFrom;
    private LocalDate dateTo;
    private Long totalWorkingMinutes;
    private Double totalWorkingHours;
    private Integer completedShifts;
    private Long totalEstimatedPay;
    private List<PayrollItemResponse> items;
}
