package com.coffeeshop.userservice.controller;

import com.coffeeshop.userservice.dto.*;
import com.coffeeshop.userservice.entity.User;
import com.coffeeshop.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users/staff")
@RequiredArgsConstructor
public class StaffManagementController {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<List<StaffResponse>> listStaff(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "role", required = false) User.Role role,
            @RequestParam(value = "branchId", required = false) String branchId,
            @RequestParam(value = "includeInactive", required = false) Boolean includeInactive
    ) {
        return ResponseEntity.ok(userService.listStaff(extractToken(authHeader), keyword, role, branchId, includeInactive));
    }

    @PostMapping
    public ResponseEntity<StaffResponse> createStaff(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody StaffCreateRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(userService.createStaff(extractToken(authHeader), request));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<StaffResponse> updateStaff(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String staffId,
            @Valid @RequestBody StaffUpdateRequest request
    ) {
        return ResponseEntity.ok(userService.updateStaff(extractToken(authHeader), staffId, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<StaffResponse> deleteStaff(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String staffId
    ) {
        return ResponseEntity.ok(userService.deleteStaff(extractToken(authHeader), staffId));
    }

    @GetMapping("/schedules")
    public ResponseEntity<WeekScheduleResponse> getWeekSchedules(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "weekStart", required = false) String weekStart,
            @RequestParam(value = "staffId", required = false) String staffId
    ) {
        return ResponseEntity.ok(userService.getWeekSchedule(extractToken(authHeader), weekStart, staffId));
    }

    @PostMapping("/schedules")
    public ResponseEntity<StaffShiftResponse> upsertSchedule(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody StaffShiftRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(userService.upsertShift(extractToken(authHeader), request));
    }

    @DeleteMapping("/schedules/{id}")
    public ResponseEntity<Void> deleteSchedule(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String shiftId
    ) {
        userService.deleteShift(extractToken(authHeader), shiftId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/attendance/check-in")
    public ResponseEntity<AttendanceResponse> checkIn(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody AttendanceCheckRequest request
    ) {
        return ResponseEntity.ok(userService.checkIn(extractToken(authHeader), request));
    }

    @PostMapping("/attendance/check-out")
    public ResponseEntity<AttendanceResponse> checkOut(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody AttendanceCheckRequest request
    ) {
        return ResponseEntity.ok(userService.checkOut(extractToken(authHeader), request));
    }

    @GetMapping("/attendance")
    public ResponseEntity<List<AttendanceResponse>> getAttendance(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "staffId", required = false) String staffId,
            @RequestParam(value = "dateFrom", required = false) String dateFrom,
            @RequestParam(value = "dateTo", required = false) String dateTo
    ) {
        return ResponseEntity.ok(userService.getAttendance(extractToken(authHeader), staffId, dateFrom, dateTo));
    }

    @GetMapping("/shift-overview")
    public ResponseEntity<ShiftOverviewResponse> getShiftOverview(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "date", required = false) String date,
            @RequestParam(value = "staffId", required = false) String staffId,
            @RequestParam(value = "shiftType", required = false) String shiftType
    ) {
        return ResponseEntity.ok(userService.getShiftOverview(extractToken(authHeader), date, staffId, shiftType));
    }

    @GetMapping("/payroll")
    public ResponseEntity<PayrollSummaryResponse> getPayroll(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "staffId", required = false) String staffId,
            @RequestParam(value = "dateFrom", required = false) String dateFrom,
            @RequestParam(value = "dateTo", required = false) String dateTo
    ) {
        return ResponseEntity.ok(userService.getPayroll(extractToken(authHeader), staffId, dateFrom, dateTo));
    }

    private String extractToken(String authHeader) {
        if (authHeader == null) {
            return "";
        }
        return authHeader.replace("Bearer ", "").trim();
    }
}
