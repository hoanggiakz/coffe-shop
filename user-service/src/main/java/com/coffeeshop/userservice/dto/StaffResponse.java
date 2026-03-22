package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.User;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
public class StaffResponse {
    private String id;
    private String name;
    private String email;
    private String phone;
    private String role;
    private String employeeCode;
    private String personalQrCode;
    private String preferredShift;
    private String branchId;
    private String branchName;
    private Boolean isActive;
    private LocalDateTime createdAt;

    public static StaffResponse from(User user) {
        return from(user, null);
    }

    public static StaffResponse from(User user, String branchName) {
        return new StaffResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getPhone(),
                user.getRole().name(),
                user.getEmployeeCode(),
                user.getPersonalQrCode(),
                user.getPreferredShift() != null ? user.getPreferredShift().name() : null,
                user.getBranchId(),
                branchName,
                user.getIsActive(),
                user.getCreatedAt()
        );
    }
}
