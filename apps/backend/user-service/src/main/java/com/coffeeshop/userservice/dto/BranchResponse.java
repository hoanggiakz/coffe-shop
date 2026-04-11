package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.Branch;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@AllArgsConstructor
public class BranchResponse {
    private String id;
    private String name;
    private String address;
    private String phone;
    private String managerId;
    private String managerName;
    private Boolean isActive;
    private Long staffCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static BranchResponse from(Branch branch, String managerName, long staffCount) {
        return new BranchResponse(
                branch.getId(),
                branch.getName(),
                branch.getAddress(),
                branch.getPhone(),
                branch.getManagerId(),
                managerName,
                branch.getIsActive(),
                staffCount,
                branch.getCreatedAt(),
                branch.getUpdatedAt()
        );
    }
}
