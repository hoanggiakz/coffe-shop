package com.coffeeshop.userservice.dto.hr;

import lombok.Data;

@Data
public class HrShiftRequest {
    private String name;
    private String startTime;
    private String endTime;
    private Integer breakMinutes;
    private Boolean isActive;
}

