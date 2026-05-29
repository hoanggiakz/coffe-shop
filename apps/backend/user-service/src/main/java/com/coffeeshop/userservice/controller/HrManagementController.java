package com.coffeeshop.userservice.controller;

import com.coffeeshop.userservice.dto.StaffCreateRequest;
import com.coffeeshop.userservice.dto.StaffResponse;
import com.coffeeshop.userservice.dto.StaffUpdateRequest;
import com.coffeeshop.userservice.dto.hr.BulkWorkScheduleRequest;
import com.coffeeshop.userservice.dto.hr.CopyWeekScheduleRequest;
import com.coffeeshop.userservice.dto.hr.EmployeeSalaryComponentAssignRequest;
import com.coffeeshop.userservice.dto.hr.GeneratePayrollRequest;
import com.coffeeshop.userservice.dto.hr.HrAttendanceCheckRequest;
import com.coffeeshop.userservice.dto.hr.HrShiftRequest;
import com.coffeeshop.userservice.dto.hr.LeaveRequestCreateRequest;
import com.coffeeshop.userservice.dto.hr.SalaryComponentRequest;
import com.coffeeshop.userservice.dto.hr.WorkScheduleRequest;
import com.coffeeshop.userservice.entity.EmployeeSalaryComponent;
import com.coffeeshop.userservice.entity.HrShift;
import com.coffeeshop.userservice.entity.Payroll;
import com.coffeeshop.userservice.entity.PayrollDetail;
import com.coffeeshop.userservice.entity.SalaryComponent;
import com.coffeeshop.userservice.service.HrManagementService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class HrManagementController {

    private final HrManagementService hrManagementService;

    @GetMapping("/staff/{userId}")
    public ResponseEntity<StaffResponse> getStaff(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String userId
    ) {
        return ResponseEntity.ok(hrManagementService.getStaffById(extractToken(authHeader), userId));
    }

    @PutMapping("/staff/{userId}")
    public ResponseEntity<StaffResponse> updateStaff(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String userId,
            @Valid @RequestBody StaffUpdateRequest request
    ) {
        return ResponseEntity.ok(hrManagementService.updateStaff(extractToken(authHeader), userId, request));
    }

    @PatchMapping("/staff/{userId}/deactivate")
    public ResponseEntity<StaffResponse> deactivateStaff(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String userId
    ) {
        return ResponseEntity.ok(hrManagementService.deactivateStaff(extractToken(authHeader), userId));
    }

    @PostMapping("/staff/{userId}/reset-password")
    public ResponseEntity<Map<String, Object>> resetPassword(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String userId,
            @RequestBody Map<String, String> payload
    ) {
        return ResponseEntity.ok(hrManagementService.resetPassword(
                extractToken(authHeader),
                userId,
                payload == null ? null : payload.get("newPassword")
        ));
    }

    @GetMapping("/staff/{userId}/qrcode")
    public ResponseEntity<Map<String, Object>> getStaffQrCode(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String userId
    ) {
        return ResponseEntity.ok(hrManagementService.getStaffQr(extractToken(authHeader), userId));
    }

    @GetMapping("/branches/{branchId}/shifts")
    public ResponseEntity<List<HrShift>> listShifts(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String branchId
    ) {
        return ResponseEntity.ok(hrManagementService.listShifts(extractToken(authHeader), branchId));
    }

    @PostMapping("/branches/{branchId}/shifts")
    public ResponseEntity<HrShift> createShift(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String branchId,
            @Valid @RequestBody HrShiftRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(hrManagementService.createShift(extractToken(authHeader), branchId, request));
    }

    @PutMapping("/shifts/{shiftId}")
    public ResponseEntity<HrShift> updateShift(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String shiftId,
            @Valid @RequestBody HrShiftRequest request
    ) {
        return ResponseEntity.ok(hrManagementService.updateShift(extractToken(authHeader), shiftId, request));
    }

    @DeleteMapping("/shifts/{shiftId}")
    public ResponseEntity<Map<String, Object>> deleteShift(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String shiftId
    ) {
        return ResponseEntity.ok(hrManagementService.deleteShift(extractToken(authHeader), shiftId));
    }

    @GetMapping("/branches/{branchId}/schedule")
    public ResponseEntity<List<Map<String, Object>>> listSchedule(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String branchId,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to
    ) {
        return ResponseEntity.ok(hrManagementService.listSchedule(extractToken(authHeader), branchId, from, to));
    }

    @PostMapping("/schedule")
    public ResponseEntity<Map<String, Object>> createSchedule(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody WorkScheduleRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(hrManagementService.createSchedule(extractToken(authHeader), request));
    }

    @PostMapping("/schedule/bulk")
    public ResponseEntity<List<Map<String, Object>>> bulkSchedule(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody BulkWorkScheduleRequest request
    ) {
        return ResponseEntity.ok(hrManagementService.bulkSchedule(extractToken(authHeader), request));
    }

    @PostMapping("/schedule/copy-week")
    public ResponseEntity<Map<String, Object>> copyWeekSchedule(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody CopyWeekScheduleRequest request
    ) {
        return ResponseEntity.ok(hrManagementService.copyWeekSchedule(extractToken(authHeader), request));
    }

    @DeleteMapping("/schedule/{scheduleId}")
    public ResponseEntity<Map<String, Object>> deleteSchedule(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String scheduleId
    ) {
        return ResponseEntity.ok(hrManagementService.deleteSchedule(extractToken(authHeader), scheduleId));
    }

    @PostMapping("/attendance/checkin")
    public ResponseEntity<Map<String, Object>> checkIn(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody HrAttendanceCheckRequest request
    ) {
        return ResponseEntity.ok(hrManagementService.checkIn(extractToken(authHeader), request));
    }

    @PostMapping("/attendance/checkout")
    public ResponseEntity<Map<String, Object>> checkOut(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody HrAttendanceCheckRequest request
    ) {
        return ResponseEntity.ok(hrManagementService.checkOut(extractToken(authHeader), request));
    }

    @GetMapping("/branches/{branchId}/attendance")
    public ResponseEntity<List<Map<String, Object>>> listAttendance(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String branchId,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to
    ) {
        return ResponseEntity.ok(hrManagementService.listAttendance(extractToken(authHeader), branchId, from, to));
    }

    @GetMapping("/attendance/me")
    public ResponseEntity<List<Map<String, Object>>> myAttendance(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "from", required = false) String from,
            @RequestParam(value = "to", required = false) String to
    ) {
        return ResponseEntity.ok(hrManagementService.myAttendance(extractToken(authHeader), from, to));
    }

    @PutMapping("/attendance/{attendanceId}")
    public ResponseEntity<Map<String, Object>> updateAttendance(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String attendanceId,
            @RequestBody Map<String, Object> payload
    ) {
        return ResponseEntity.ok(hrManagementService.updateAttendance(extractToken(authHeader), attendanceId, payload));
    }

    @PutMapping("/attendance/{attendanceId}/approve")
    public ResponseEntity<Map<String, Object>> approveAttendance(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String attendanceId
    ) {
        return ResponseEntity.ok(hrManagementService.approveAttendance(extractToken(authHeader), attendanceId));
    }

    @PostMapping("/leave-requests")
    public ResponseEntity<Map<String, Object>> createLeaveRequest(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody LeaveRequestCreateRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(hrManagementService.createLeaveRequest(extractToken(authHeader), request));
    }

    @GetMapping("/leave-requests/me")
    public ResponseEntity<List<Map<String, Object>>> myLeaveRequests(
            @RequestHeader("Authorization") String authHeader
    ) {
        return ResponseEntity.ok(hrManagementService.myLeaveRequests(extractToken(authHeader)));
    }

    @GetMapping("/branches/{branchId}/leave-requests")
    public ResponseEntity<List<Map<String, Object>>> branchLeaveRequests(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String branchId
    ) {
        return ResponseEntity.ok(hrManagementService.branchLeaveRequests(extractToken(authHeader), branchId));
    }

    @PutMapping("/leave-requests/{id}/approve")
    public ResponseEntity<Map<String, Object>> approveLeaveRequest(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String id
    ) {
        return ResponseEntity.ok(hrManagementService.approveLeaveRequest(extractToken(authHeader), id, true));
    }

    @PutMapping("/leave-requests/{id}/reject")
    public ResponseEntity<Map<String, Object>> rejectLeaveRequest(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String id
    ) {
        return ResponseEntity.ok(hrManagementService.approveLeaveRequest(extractToken(authHeader), id, false));
    }

    @GetMapping("/salary-components")
    public ResponseEntity<List<SalaryComponent>> listSalaryComponents(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "branchId", required = false) String branchId
    ) {
        return ResponseEntity.ok(hrManagementService.listSalaryComponents(extractToken(authHeader), branchId));
    }

    @PostMapping("/salary-components")
    public ResponseEntity<SalaryComponent> createSalaryComponent(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody SalaryComponentRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(hrManagementService.createSalaryComponent(extractToken(authHeader), request));
    }

    @PutMapping("/salary-components/{id}")
    public ResponseEntity<SalaryComponent> updateSalaryComponent(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String id,
            @Valid @RequestBody SalaryComponentRequest request
    ) {
        return ResponseEntity.ok(hrManagementService.updateSalaryComponent(extractToken(authHeader), id, request));
    }

    @PostMapping("/employee-salary-components")
    public ResponseEntity<EmployeeSalaryComponent> assignEmployeeSalaryComponent(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody EmployeeSalaryComponentAssignRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(hrManagementService.assignEmployeeSalaryComponent(extractToken(authHeader), request));
    }

    @GetMapping("/branches/{branchId}/payroll")
    public ResponseEntity<List<Payroll>> listBranchPayroll(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String branchId,
            @RequestParam(value = "month", required = false) String month
    ) {
        return ResponseEntity.ok(hrManagementService.listBranchPayroll(extractToken(authHeader), branchId, month));
    }

    @GetMapping("/payroll/{userId}")
    public ResponseEntity<List<Payroll>> getUserPayroll(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String userId
    ) {
        return ResponseEntity.ok(hrManagementService.getUserPayroll(extractToken(authHeader), userId));
    }

    @PostMapping("/branches/{branchId}/payroll/generate")
    public ResponseEntity<Map<String, Object>> generateBranchPayroll(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String branchId,
            @Valid @RequestBody GeneratePayrollRequest request
    ) {
        return ResponseEntity.ok(hrManagementService.generateBranchPayroll(extractToken(authHeader), branchId, request));
    }

    @GetMapping("/payroll/{payrollId}/detail")
    public ResponseEntity<List<PayrollDetail>> payrollDetails(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String payrollId
    ) {
        return ResponseEntity.ok(hrManagementService.payrollDetails(extractToken(authHeader), payrollId));
    }

    @PutMapping("/payroll/{payrollId}/approve")
    public ResponseEntity<Payroll> approvePayroll(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String payrollId
    ) {
        return ResponseEntity.ok(hrManagementService.approvePayroll(extractToken(authHeader), payrollId));
    }

    @PutMapping("/payroll/{payrollId}/pay")
    public ResponseEntity<Payroll> payPayroll(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String payrollId
    ) {
        return ResponseEntity.ok(hrManagementService.payPayroll(extractToken(authHeader), payrollId));
    }

    @GetMapping("/payroll/{payrollId}/export")
    public ResponseEntity<Map<String, Object>> exportPayroll(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable String payrollId
    ) {
        return ResponseEntity.ok(hrManagementService.exportPayroll(extractToken(authHeader), payrollId));
    }

    private String extractToken(String authHeader) {
        if (authHeader == null) {
            return "";
        }
        return authHeader.replace("Bearer ", "").trim();
    }
}
