package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.LoyaltyTransaction;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LoyaltyTransactionItemResponse {
    private String type;
    private Integer points;
    private Integer balanceAfter;
    private String description;
    private String createdAt;

    public static LoyaltyTransactionItemResponse from(LoyaltyTransaction tx) {
        return new LoyaltyTransactionItemResponse(
                tx.getType().name(),
                tx.getPoints(),
                tx.getBalanceAfter(),
                tx.getDescription(),
                tx.getCreatedAt() == null ? null : tx.getCreatedAt().toString()
        );
    }
}

