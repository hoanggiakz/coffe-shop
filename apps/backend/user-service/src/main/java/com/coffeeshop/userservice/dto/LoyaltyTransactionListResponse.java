package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@AllArgsConstructor
public class LoyaltyTransactionListResponse {
    private Integer currentPoints;
    private List<LoyaltyTransactionItemResponse> data;
    private Map<String, Object> meta;
}

