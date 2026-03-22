package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class CustomerOffersResponse {
    private String tier;
    private Integer loyaltyPoints;
    private List<String> offers;
}
