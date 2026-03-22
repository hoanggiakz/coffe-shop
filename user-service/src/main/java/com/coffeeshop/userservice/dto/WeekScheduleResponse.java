package com.coffeeshop.userservice.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
@AllArgsConstructor
public class WeekScheduleResponse {
    private LocalDate weekStart;
    private LocalDate weekEnd;
    private List<StaffShiftResponse> shifts;
}
