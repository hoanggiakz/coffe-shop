package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.User;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class ShiftCoworkerResponse {
    private String staffId;
    private String staffName;
    private String role;
    private String employeeCode;
    private String branchId;
    private String branchName;

    public static ShiftCoworkerResponse from(User user, String branchName) {
        return new ShiftCoworkerResponse(
                user.getId(),
                user.getName(),
                user.getRole() != null ? user.getRole().name() : null,
                user.getEmployeeCode(),
                user.getBranchId(),
                branchName
        );
    }
}
