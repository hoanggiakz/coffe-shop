package com.coffeeshop.userservice.dto.hr;

import lombok.Data;

@Data
public class HrAttendanceCheckRequest {
    private String employeeCode;
    private String note;
}

