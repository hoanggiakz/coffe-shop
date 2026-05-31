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

    @Min(0)
    private Long subtotalAmount;

    @Min(0)
    private Long discountAmount;

    @Min(0)
    private Long loyaltyRedeemAmount;
}
