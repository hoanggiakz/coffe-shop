package com.coffeeshop.userservice.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LoyaltyRedeemRequest {
    @NotBlank
    private String orderId;

    @Min(100)
    private Integer pointsToRedeem;
}

