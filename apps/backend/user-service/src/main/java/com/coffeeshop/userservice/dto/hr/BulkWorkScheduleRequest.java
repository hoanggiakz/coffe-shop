package com.coffeeshop.userservice.dto.hr;

import lombok.Data;

import java.util.List;

@Data
public class BulkWorkScheduleRequest {
    private List<WorkScheduleRequest> items;
}

