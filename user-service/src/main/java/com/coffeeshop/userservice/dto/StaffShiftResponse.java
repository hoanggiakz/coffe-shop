package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.StaffShift;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@AllArgsConstructor
public class StaffShiftResponse {
    private String id;
    private String staffId;
    private String staffName;
    private LocalDate shiftDate;
    private String shiftType;
    private String note;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static StaffShiftResponse from(StaffShift shift) {
        return new StaffShiftResponse(
                shift.getId(),
                shift.getStaffId(),
                shift.getStaffName(),
                shift.getShiftDate(),
                shift.getShiftType().name(),
                shift.getNote(),
                shift.getCreatedAt(),
                shift.getUpdatedAt()
        );
    }
}
