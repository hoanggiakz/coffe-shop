package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.AttendanceRecord;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@AllArgsConstructor
public class AttendanceResponse {
    private String id;
    private String staffId;
    private String staffName;
    private LocalDate workDate;
    private String scheduledShift;
    private LocalDateTime checkInAt;
    private LocalDateTime checkOutAt;
    private String checkInMethod;
    private String checkOutMethod;
    private Long workingMinutes;

    public static AttendanceResponse from(AttendanceRecord record) {
        Long minutes = null;
        if (record.getCheckInAt() != null && record.getCheckOutAt() != null) {
            minutes = Math.max(0L, Duration.between(record.getCheckInAt(), record.getCheckOutAt()).toMinutes());
        }

        return new AttendanceResponse(
                record.getId(),
                record.getStaffId(),
                record.getStaffName(),
                record.getWorkDate(),
                record.getScheduledShift() != null ? record.getScheduledShift().name() : null,
                record.getCheckInAt(),
                record.getCheckOutAt(),
                record.getCheckInMethod() != null ? record.getCheckInMethod().name() : null,
                record.getCheckOutMethod() != null ? record.getCheckOutMethod().name() : null,
                minutes
        );
    }
}
