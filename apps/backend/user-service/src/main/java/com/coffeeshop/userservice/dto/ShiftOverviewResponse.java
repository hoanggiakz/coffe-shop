package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
@AllArgsConstructor
public class ShiftOverviewResponse {
    private LocalDate date;
    private String staffId;
    private String staffName;
    private String branchId;
    private String branchName;
    private String selectedShiftType;
    private List<StaffShiftResponse> assignedShifts;
    private List<ShiftCoworkerResponse> sameShiftStaffs;
}
