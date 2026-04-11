package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.ShiftType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class StaffShiftRequest {
    @NotBlank
    private String staffId;

    @NotNull
    private LocalDate shiftDate;

    @NotNull
    private ShiftType shiftType;

    private String note;
}
