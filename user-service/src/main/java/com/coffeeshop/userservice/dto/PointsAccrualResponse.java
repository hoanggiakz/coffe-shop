package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class PointsAccrualResponse {
    private String customerId;
    private String orderId;
    private Integer pointsEarned;
    private Integer totalPoints;
    private String memberTier;
}
