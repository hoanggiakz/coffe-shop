package com.coffeeshop.userservice.dto.hr;

import lombok.Data;

@Data
public class LeaveRequestCreateRequest {
    private String startDate;
    private String endDate;
    private String leaveType;
    private String reason;
}

