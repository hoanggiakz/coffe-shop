package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.User;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class CustomerProfileResponse {
    private String id;
    private String name;
    private String email;
    private String phone;
    private String avatarUrl;
    private Integer loyaltyPoints;
    private Long totalSpent;
    private String membershipTier;
    private String nextTier;
    private Long amountToNextTier;
    private String createdAt;

    public static CustomerProfileResponse from(User user) {
        long totalSpent = user.getTotalSpent() == null ? 0L : user.getTotalSpent();
        String tier = user.getMemberTier() == null ? "STANDARD" : user.getMemberTier().name();
        String nextTier = switch (tier) {
            case "STANDARD" -> "SILVER";
            case "SILVER" -> "GOLD";
            default -> "GOLD";
        };
        long nextMilestone = switch (tier) {
            case "STANDARD" -> 3_000_000L;
            case "SILVER" -> 10_000_000L;
            default -> 10_000_000L;
        };
        return new CustomerProfileResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getPhone(),
                user.getAvatarUrl(),
                user.getLoyaltyPoints() == null ? 0 : user.getLoyaltyPoints(),
                totalSpent,
                tier,
                nextTier,
                Math.max(0L, nextMilestone - totalSpent),
                user.getCreatedAt() == null ? null : user.getCreatedAt().toString()
        );
    }
}

