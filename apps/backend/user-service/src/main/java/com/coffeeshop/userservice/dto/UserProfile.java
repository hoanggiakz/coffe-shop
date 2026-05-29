package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.User;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class UserProfile {
    private String id;
    private String email;
    private String name;
    private String role;
    private String phone;
    private String branchId;
    private String employeeCode;
    private String avatarUrl;
    private Integer loyaltyPoints;
    private String memberTier;
    private Long totalSpent;

    public static UserProfile from(User user) {
        return new UserProfile(
            user.getId(),
            user.getEmail(),
            user.getName(),
            user.getRole().name(),
            user.getPhone(),
            user.getBranchId(),
            user.getEmployeeCode(),
            user.getAvatarUrl(),
            user.getLoyaltyPoints(),
            user.getMemberTier().name(),
            user.getTotalSpent()
        );
    }
}
