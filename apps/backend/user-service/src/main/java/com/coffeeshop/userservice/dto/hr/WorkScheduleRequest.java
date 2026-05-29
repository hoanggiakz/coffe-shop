package com.coffeeshop.userservice.dto.hr;

import lombok.Data;

@Data
public class WorkScheduleRequest {
    private String userId;
    private String shiftId;
    private String date;
    private String notes;
}

