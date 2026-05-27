package com.coffeeshop.userservice.dto.hr;

import lombok.Data;

@Data
public class CopyWeekScheduleRequest {
    private String branchId;
    private String fromWeekStart;
    private String toWeekStart;
}

