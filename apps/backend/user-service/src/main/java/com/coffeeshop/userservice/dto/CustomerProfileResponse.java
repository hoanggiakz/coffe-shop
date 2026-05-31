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
    private String dateOfBirth;
    private Integer loyaltyPoints;
    private Long totalSpent;
    private String membershipTier;
    private String nextTier;
    private Long amountToNextTier;
    private String createdAt;

    public static CustomerProfileResponse from(User user) {
        long totalSpent = user.getTotalSpent() == null ? 0L : user.getTotalSpent();
        String tier = user.getMemberTier() == null ? "BRONZE" : user.getMemberTier().name();
        String nextTier = switch (tier) {
            case "BRONZE", "STANDARD" -> "SILVER";
            case "SILVER" -> "GOLD";
            case "GOLD" -> "PLATINUM";
            default -> "PLATINUM";
        };
        long nextMilestone = switch (tier) {
            case "BRONZE", "STANDARD" -> 1_000_000L;
            case "SILVER" -> 5_000_000L;
            case "GOLD" -> 10_000_000L;
            default -> 10_000_000L;
        };
        return new CustomerProfileResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getPhone(),
                user.getAvatarUrl(),
                user.getDateOfBirth() == null ? null : user.getDateOfBirth().toString(),
                user.getLoyaltyPoints() == null ? 0 : user.getLoyaltyPoints(),
                totalSpent,
                tier,
                nextTier,
                Math.max(0L, nextMilestone - totalSpent),
                user.getCreatedAt() == null ? null : user.getCreatedAt().toString()
        );
    }
}
