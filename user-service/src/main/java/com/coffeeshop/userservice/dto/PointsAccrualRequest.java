package com.coffeeshop.userservice.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class PointsAccrualRequest {
    @NotBlank
    private String customerId;

    @NotBlank
    private String orderId;

    @Min(0)
    private long amount;
}
