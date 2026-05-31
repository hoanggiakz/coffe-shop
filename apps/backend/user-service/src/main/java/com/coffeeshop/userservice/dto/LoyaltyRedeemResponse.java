package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LoyaltyRedeemResponse {
    private Boolean success;
    private Long discountAmount;
    private Integer pointsRedeemed;
    private Integer remainingPoints;
    private String message;
}

