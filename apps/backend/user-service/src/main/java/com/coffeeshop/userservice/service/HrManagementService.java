package com.coffeeshop.userservice.service;

import com.coffeeshop.userservice.config.JwtUtil;
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
import com.coffeeshop.userservice.entity.Branch;
import com.coffeeshop.userservice.entity.EmployeeSalaryComponent;
import com.coffeeshop.userservice.entity.HrAttendance;
import com.coffeeshop.userservice.entity.HrShift;
import com.coffeeshop.userservice.entity.LeaveRequest;
import com.coffeeshop.userservice.entity.Payroll;
import com.coffeeshop.userservice.entity.PayrollDetail;
import com.coffeeshop.userservice.entity.SalaryComponent;
import com.coffeeshop.userservice.entity.User;
import com.coffeeshop.userservice.entity.WorkSchedule;
import com.coffeeshop.userservice.repository.BranchRepository;
import com.coffeeshop.userservice.repository.EmployeeSalaryComponentRepository;
import com.coffeeshop.userservice.repository.HrAttendanceRepository;
import com.coffeeshop.userservice.repository.HrShiftRepository;
import com.coffeeshop.userservice.repository.LeaveRequestRepository;
import com.coffeeshop.userservice.repository.PayrollDetailRepository;
import com.coffeeshop.userservice.repository.PayrollRepository;
import com.coffeeshop.userservice.repository.SalaryComponentRepository;
import com.coffeeshop.userservice.repository.UserRepository;
import com.coffeeshop.userservice.repository.WorkScheduleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class HrManagementService {
    private static final int LATE_TOLERANCE_MINUTES = 10;
    private static final BigDecimal HALF_DAY_THRESHOLD = new BigDecimal("0.5");
    private static final String AUTO_PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#$%";
    private static final Random RANDOM = new Random();

    private final UserRepository userRepository;
    private final BranchRepository branchRepository;
    private final HrShiftRepository hrShiftRepository;
    private final WorkScheduleRepository workScheduleRepository;
    private final HrAttendanceRepository hrAttendanceRepository;
    private final LeaveRequestRepository leaveRequestRepository;
    private final SalaryComponentRepository salaryComponentRepository;
    private final EmployeeSalaryComponentRepository employeeSalaryComponentRepository;
    private final PayrollRepository payrollRepository;
    private final PayrollDetailRepository payrollDetailRepository;
    private final UserService userService;
    private final JwtUtil jwtUtil;

    public List<StaffResponse> listBranchStaff(String token, String branchId) {
        User actor = requireManagerOrAdmin(token);
        assertCanAccessBranch(actor, branchId);
        return userService.listStaff(token, null, null, branchId, false);
    }

    public StaffResponse createBranchStaff(String token, String branchId, StaffCreateRequest request) {
        User actor = requireManagerOrAdmin(token);
        assertCanAccessBranch(actor, branchId);
        request.setBranchId(branchId);
        return userService.createStaff(token, request);
    }

    public StaffResponse getStaffById(String token, String userId) {
        User actor = requireAnyStaff(token);
        User target = requireUser(userId);
        if (actor.getRole() != User.Role.ADMIN && !Objects.equals(actor.getId(), target.getId())) {
            assertCanAccessBranch(actor, target.getBranchId());
        }
        return StaffResponse.from(target, resolveBranchName(target.getBranchId()));
    }

    public StaffResponse updateStaff(String token, String userId, StaffUpdateRequest request) {
        return userService.updateStaff(token, userId, request);
    }

    public StaffResponse deactivateStaff(String token, String userId) {
        StaffUpdateRequest request = new StaffUpdateRequest();
        request.setIsActive(false);
        return userService.updateStaff(token, userId, request);
    }

    public Map<String, Object> softDeleteStaff(String token, String userId) {
        StaffUpdateRequest request = new StaffUpdateRequest();
        request.setIsActive(false);
        StaffResponse updated = userService.updateStaff(token, userId, request);
        return Map.of(
                "success", true,
                "message", "Nhân viên đã được vô hiệu hóa",
                "userId", updated.getId(),
                "isActive", false,
                "deactivatedAt", LocalDateTime.now().toString()
        );
    }

    public Map<String, Object> reactivateStaff(String token, String userId) {
        StaffUpdateRequest request = new StaffUpdateRequest();
        request.setIsActive(true);
        StaffResponse updated = userService.updateStaff(token, userId, request);
        return Map.of(
                "success", true,
                "message", "Nhân viên đã được kích hoạt lại",
                "userId", updated.getId(),
                "isActive", true,
                "reactivatedAt", LocalDateTime.now().toString()
        );
    }

    public Map<String, Object> resetPassword(String token, String userId, String newPassword) {
        String nextPassword = normalizeText(newPassword);
        boolean autoGenerated = false;
        if (nextPassword == null) {
            nextPassword = generateTemporaryPassword(16);
            autoGenerated = true;
        }
        StaffUpdateRequest request = new StaffUpdateRequest();
        request.setPassword(nextPassword);
        StaffResponse updated = userService.updateStaff(token, userId, request);
        String maskedEmail = maskEmail(updated.getEmail());
        return Map.of(
                "success", true,
                "autoGenerated", autoGenerated,
                "message", autoGenerated
                        ? "Mật khẩu mới đã được tạo và gửi qua email: " + maskedEmail
                        : "Mật khẩu đã được đặt lại. Email xác nhận đã gửi."
        );
    }

    public Map<String, Object> checkStaffExists(String token, String email, String employeeCode, String branchId) {
        User actor = requireManagerOrAdmin(token);
        String normalizedBranchId = normalizeText(branchId);
        if (normalizedBranchId != null) {
            assertCanAccessBranch(actor, normalizedBranchId);
        }

        Map<String, Object> result = new HashMap<>();

        String normalizedEmail = normalizeText(email);
        if (normalizedEmail != null) {
            boolean exists = userRepository.existsByEmail(normalizedEmail.trim().toLowerCase(Locale.ROOT));
            result.put("email", Map.of("exists", exists));
        } else {
            result.put("email", Map.of("exists", false));
        }

        String normalizedCode = normalizeText(employeeCode);
        if (normalizedCode != null) {
            String code = normalizedCode.replaceAll("\\s+", "").trim().toUpperCase(Locale.ROOT);
            if (normalizedBranchId != null) {
                User conflict = userRepository.findByEmployeeCodeAndBranchId(code, normalizedBranchId).orElse(null);
                result.put("employeeCode", conflict == null
                        ? Map.of("exists", false)
                        : Map.of("exists", true, "conflictWith", conflict.getEmployeeCode()));
            } else {
                boolean exists = userRepository.existsByEmployeeCode(code);
                result.put("employeeCode", exists
                        ? Map.of("exists", true, "conflictWith", code)
                        : Map.of("exists", false));
            }
        } else {
            result.put("employeeCode", Map.of("exists", false));
        }

        return result;
    }

    public Map<String, Object> getStaffQr(String token, String userId) {
        User actor = requireAnyStaff(token);
        User target = requireUser(userId);
        if (actor.getRole() != User.Role.ADMIN && !Objects.equals(actor.getId(), target.getId())) {
            assertCanAccessBranch(actor, target.getBranchId());
        }
        return Map.of(
                "userId", target.getId(),
                "employeeCode", target.getEmployeeCode(),
                "qrcode", target.getPersonalQrCode()
        );
    }

    public List<HrShift> listShifts(String token, String branchId) {
        User actor = requireManagerOrAdmin(token);
        assertCanAccessBranch(actor, branchId);
        return hrShiftRepository.findByBranchIdOrderByStartTimeAsc(branchId);
    }

    public HrShift createShift(String token, String branchId, HrShiftRequest request) {
        User actor = requireManagerOrAdmin(token);
        assertCanAccessBranch(actor, branchId);
        return hrShiftRepository.save(HrShift.builder()
                .branchId(branchId)
                .name(requireText(request.getName(), "Ten ca khong duoc de trong"))
                .startTime(parseTime(request.getStartTime()))
                .endTime(parseTime(request.getEndTime()))
                .breakMinutes(request.getBreakMinutes() == null ? 0 : Math.max(0, request.getBreakMinutes()))
                .isActive(request.getIsActive() == null ? true : request.getIsActive())
                .build());
    }

    public HrShift updateShift(String token, String shiftId, HrShiftRequest request) {
        User actor = requireManagerOrAdmin(token);
        HrShift shift = hrShiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay ca"));
        assertCanAccessBranch(actor, shift.getBranchId());
        if (request.getName() != null) shift.setName(requireText(request.getName(), "Ten ca khong hop le"));
        if (request.getStartTime() != null) shift.setStartTime(parseTime(request.getStartTime()));
        if (request.getEndTime() != null) shift.setEndTime(parseTime(request.getEndTime()));
        if (request.getBreakMinutes() != null) shift.setBreakMinutes(Math.max(0, request.getBreakMinutes()));
        if (request.getIsActive() != null) shift.setIsActive(request.getIsActive());
        return hrShiftRepository.save(shift);
    }

    public Map<String, Object> deleteShift(String token, String shiftId) {
        User actor = requireManagerOrAdmin(token);
        HrShift shift = hrShiftRepository.findById(shiftId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay ca"));
        assertCanAccessBranch(actor, shift.getBranchId());
        boolean used = workScheduleRepository.findAll().stream().anyMatch(item -> Objects.equals(item.getShiftId(), shiftId));
        if (used) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong the xoa ca da duoc phan");
        }
        hrShiftRepository.delete(shift);
        return Map.of("id", shiftId, "deleted", true);
    }

    public List<Map<String, Object>> listSchedule(String token, String branchId, String from, String to) {
        User actor = requireManagerOrAdmin(token);
        assertCanAccessBranch(actor, branchId);
        LocalDate dateFrom = parseDateOrDefault(from, LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
        LocalDate dateTo = parseDateOrDefault(to, dateFrom.plusDays(6));
        return toScheduleResponses(filterBranchSchedules(branchId, dateFrom, dateTo));
    }

    public Map<String, Object> createSchedule(String token, WorkScheduleRequest request) {
        User actor = requireManagerOrAdmin(token);
        User staff = requireUser(request.getUserId());
        assertCanAccessBranch(actor, staff.getBranchId());
        HrShift shift = requireShift(request.getShiftId());
        if (!Objects.equals(shift.getBranchId(), staff.getBranchId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ca khong thuoc chi nhanh cua nhan vien");
        }
        LocalDate date = parseDate(request.getDate());
        WorkSchedule existing = workScheduleRepository.findByUserIdAndDate(staff.getId(), date).orElse(null);
        WorkSchedule next = existing == null ? WorkSchedule.builder().build() : existing;
        next.setUserId(staff.getId());
        next.setShiftId(shift.getId());
        next.setDate(date);
        next.setNotes(normalizeText(request.getNotes()));
        next.setCreatedBy(actor.getId());
        WorkSchedule saved = workScheduleRepository.save(next);
        return toScheduleResponse(saved);
    }

    public List<Map<String, Object>> bulkSchedule(String token, BulkWorkScheduleRequest request) {
        if (request == null || request.getItems() == null || request.getItems().isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (WorkScheduleRequest item : request.getItems()) {
            result.add(createSchedule(token, item));
        }
        return result;
    }

    public Map<String, Object> copyWeekSchedule(String token, CopyWeekScheduleRequest request) {
        User actor = requireManagerOrAdmin(token);
        String branchId = requireText(request.getBranchId(), "branchId khong hop le");
        assertCanAccessBranch(actor, branchId);
        LocalDate fromWeek = parseDate(request.getFromWeekStart()).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate toWeek = parseDate(request.getToWeekStart()).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        List<WorkSchedule> source = filterBranchSchedules(branchId, fromWeek, fromWeek.plusDays(6));
        int copied = 0;
        for (WorkSchedule item : source) {
            LocalDate targetDate = toWeek.plusDays(Duration.between(fromWeek.atStartOfDay(), item.getDate().atStartOfDay()).toDays());
            WorkScheduleRequest req = new WorkScheduleRequest();
            req.setUserId(item.getUserId());
            req.setShiftId(item.getShiftId());
            req.setDate(targetDate.toString());
            req.setNotes(item.getNotes());
            createSchedule(token, req);
            copied++;
        }
        return Map.of("copied", copied, "fromWeekStart", fromWeek.toString(), "toWeekStart", toWeek.toString());
    }

    public Map<String, Object> deleteSchedule(String token, String scheduleId) {
        User actor = requireManagerOrAdmin(token);
        WorkSchedule schedule = workScheduleRepository.findById(scheduleId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay lich phan ca"));
        User staff = requireUser(schedule.getUserId());
        assertCanAccessBranch(actor, staff.getBranchId());
        workScheduleRepository.delete(schedule);
        return Map.of("id", scheduleId, "deleted", true);
    }

    public Map<String, Object> checkIn(String token, HrAttendanceCheckRequest request) {
        User actor = requireAnyStaff(token);
        User staff = resolveAttendanceStaff(actor, request);
        LocalDate date = LocalDate.now();
        HrAttendance attendance = hrAttendanceRepository.findByUserIdAndDate(staff.getId(), date).orElse(HrAttendance.builder()
                .userId(staff.getId())
                .date(date)
                .status(HrAttendance.Status.PRESENT)
                .build());
        if (attendance.getCheckInTime() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Da check-in trong ngay");
        }
        attendance.setCheckInTime(LocalDateTime.now());
        attendance.setCheckInNote(normalizeText(request.getNote()));
        attendance.setStatus(resolveAttendanceStatus(staff.getId(), date, attendance.getCheckInTime(), null));
        HrAttendance saved = hrAttendanceRepository.save(attendance);
        return toAttendanceResponse(saved);
    }

    public Map<String, Object> checkOut(String token, HrAttendanceCheckRequest request) {
        User actor = requireAnyStaff(token);
        User staff = resolveAttendanceStaff(actor, request);
        LocalDate date = LocalDate.now();
        HrAttendance attendance = hrAttendanceRepository.findByUserIdAndDate(staff.getId(), date)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chua check-in"));
        if (attendance.getCheckOutTime() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Da check-out");
        }
        attendance.setCheckOutTime(LocalDateTime.now());
        attendance.setCheckOutNote(normalizeText(request.getNote()));
        recalculateAttendance(attendance);
        HrAttendance saved = hrAttendanceRepository.save(attendance);
        return toAttendanceResponse(saved);
    }

    public List<Map<String, Object>> listAttendance(String token, String branchId, String from, String to) {
        User actor = requireManagerOrAdmin(token);
        assertCanAccessBranch(actor, branchId);
        LocalDate dateFrom = parseDateOrDefault(from, LocalDate.now().withDayOfMonth(1));
        LocalDate dateTo = parseDateOrDefault(to, LocalDate.now());
        Set<String> userIds = listBranchUsers(branchId).stream().map(User::getId).collect(Collectors.toSet());
        return hrAttendanceRepository.findByDateBetweenOrderByDateDesc(dateFrom, dateTo).stream()
                .filter(item -> userIds.contains(item.getUserId()))
                .map(this::toAttendanceResponse)
                .toList();
    }

    public List<Map<String, Object>> myAttendance(String token, String from, String to) {
        User actor = requireAnyStaff(token);
        LocalDate dateFrom = parseDateOrDefault(from, LocalDate.now().withDayOfMonth(1));
        LocalDate dateTo = parseDateOrDefault(to, LocalDate.now());
        return hrAttendanceRepository.findByUserIdAndDateBetweenOrderByDateDesc(actor.getId(), dateFrom, dateTo).stream()
                .map(this::toAttendanceResponse)
                .toList();
    }

    public Map<String, Object> updateAttendance(String token, String attendanceId, Map<String, Object> payload) {
        User actor = requireManagerOrAdmin(token);
        HrAttendance attendance = hrAttendanceRepository.findById(attendanceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay ban ghi cham cong"));
        User staff = requireUser(attendance.getUserId());
        assertCanAccessBranch(actor, staff.getBranchId());
        if (payload.containsKey("checkInTime")) attendance.setCheckInTime(parseDateTime(payload.get("checkInTime")));
        if (payload.containsKey("checkOutTime")) attendance.setCheckOutTime(parseDateTime(payload.get("checkOutTime")));
        if (payload.containsKey("status")) attendance.setStatus(HrAttendance.Status.valueOf(String.valueOf(payload.get("status")).toUpperCase(Locale.ROOT)));
        recalculateAttendance(attendance);
        attendance.setApprovedBy(actor.getId());
        attendance.setApprovedAt(LocalDateTime.now());
        return toAttendanceResponse(hrAttendanceRepository.save(attendance));
    }

    public Map<String, Object> approveAttendance(String token, String attendanceId) {
        User actor = requireManagerOrAdmin(token);
        HrAttendance attendance = hrAttendanceRepository.findById(attendanceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay ban ghi cham cong"));
        User staff = requireUser(attendance.getUserId());
        assertCanAccessBranch(actor, staff.getBranchId());
        attendance.setApprovedBy(actor.getId());
        attendance.setApprovedAt(LocalDateTime.now());
        return toAttendanceResponse(hrAttendanceRepository.save(attendance));
    }

    public Map<String, Object> createLeaveRequest(String token, LeaveRequestCreateRequest request) {
        User actor = requireAnyStaff(token);
        LeaveRequest saved = leaveRequestRepository.save(LeaveRequest.builder()
                .userId(actor.getId())
                .startDate(parseDate(request.getStartDate()))
                .endDate(parseDate(request.getEndDate()))
                .leaveType(LeaveRequest.LeaveType.valueOf(normalizeUpper(request.getLeaveType(), "UNPAID")))
                .reason(normalizeText(request.getReason()))
                .status(LeaveRequest.LeaveStatus.PENDING)
                .build());
        return toLeaveResponse(saved);
    }

    public List<Map<String, Object>> myLeaveRequests(String token) {
        User actor = requireAnyStaff(token);
        return leaveRequestRepository.findByUserIdOrderByCreatedAtDesc(actor.getId()).stream()
                .map(this::toLeaveResponse)
                .toList();
    }

    public List<Map<String, Object>> branchLeaveRequests(String token, String branchId) {
        User actor = requireManagerOrAdmin(token);
        assertCanAccessBranch(actor, branchId);
        Set<String> ids = listBranchUsers(branchId).stream().map(User::getId).collect(Collectors.toSet());
        return leaveRequestRepository.findByUserIdInOrderByCreatedAtDesc(new ArrayList<>(ids)).stream()
                .map(this::toLeaveResponse)
                .toList();
    }

    public Map<String, Object> approveLeaveRequest(String token, String leaveId, boolean approved) {
        User actor = requireManagerOrAdmin(token);
        LeaveRequest leave = leaveRequestRepository.findById(leaveId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay don nghi"));
        User staff = requireUser(leave.getUserId());
        assertCanAccessBranch(actor, staff.getBranchId());
        leave.setStatus(approved ? LeaveRequest.LeaveStatus.APPROVED : LeaveRequest.LeaveStatus.REJECTED);
        leave.setApprovedBy(actor.getId());
        return toLeaveResponse(leaveRequestRepository.save(leave));
    }

    public List<SalaryComponent> listSalaryComponents(String token, String branchId) {
        User actor = requireManagerOrAdmin(token);
        if (actor.getRole() != User.Role.ADMIN && branchId != null) {
            assertCanAccessBranch(actor, branchId);
        }
        if (branchId != null && !branchId.isBlank()) {
            return salaryComponentRepository.findByBranchIdOrBranchIdIsNullOrderByNameAsc(branchId);
        }
        return salaryComponentRepository.findByIsActiveTrueOrderByNameAsc();
    }

    public SalaryComponent createSalaryComponent(String token, SalaryComponentRequest request) {
        User actor = requireAdmin(token);
        return salaryComponentRepository.save(SalaryComponent.builder()
                .branchId(normalizeText(request.getBranchId()))
                .name(requireText(request.getName(), "Ten khoan luong khong duoc de trong"))
                .type(SalaryComponent.ComponentType.valueOf(normalizeUpper(request.getType(), null)))
                .calculationType(SalaryComponent.CalculationType.valueOf(normalizeUpper(request.getCalculationType(), null)))
                .amount(BigDecimal.valueOf(request.getAmount() == null ? 0D : request.getAmount()))
                .appliesToRoles(normalizeText(request.getAppliesToRoles()))
                .isActive(request.getIsActive() == null ? true : request.getIsActive())
                .build());
    }

    public SalaryComponent updateSalaryComponent(String token, String id, SalaryComponentRequest request) {
        User actor = requireAdmin(token);
        SalaryComponent component = salaryComponentRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay khoan luong"));
        if (request.getName() != null) component.setName(requireText(request.getName(), "Ten khoan luong khong hop le"));
        if (request.getType() != null) component.setType(SalaryComponent.ComponentType.valueOf(normalizeUpper(request.getType(), null)));
        if (request.getCalculationType() != null) component.setCalculationType(SalaryComponent.CalculationType.valueOf(normalizeUpper(request.getCalculationType(), null)));
        if (request.getAmount() != null) component.setAmount(BigDecimal.valueOf(request.getAmount()));
        if (request.getBranchId() != null) component.setBranchId(normalizeText(request.getBranchId()));
        if (request.getAppliesToRoles() != null) component.setAppliesToRoles(normalizeText(request.getAppliesToRoles()));
        if (request.getIsActive() != null) component.setIsActive(request.getIsActive());
        return salaryComponentRepository.save(component);
    }

    public EmployeeSalaryComponent assignEmployeeSalaryComponent(String token, EmployeeSalaryComponentAssignRequest request) {
        User actor = requireManagerOrAdmin(token);
        User staff = requireUser(request.getUserId());
        assertCanAccessBranch(actor, staff.getBranchId());
        SalaryComponent component = salaryComponentRepository.findById(request.getSalaryComponentId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay khoan luong"));
        if (actor.getRole() != User.Role.ADMIN && component.getBranchId() != null && !Objects.equals(component.getBranchId(), staff.getBranchId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Khoan luong khong thuoc chi nhanh cua ban");
        }
        return employeeSalaryComponentRepository.save(EmployeeSalaryComponent.builder()
                .userId(staff.getId())
                .salaryComponentId(component.getId())
                .effectiveFrom(parseDate(request.getEffectiveFrom()))
                .effectiveTo(request.getEffectiveTo() == null ? null : parseDate(request.getEffectiveTo()))
                .customAmount(request.getCustomAmount() == null ? null : BigDecimal.valueOf(request.getCustomAmount()))
                .build());
    }

    public List<Payroll> listBranchPayroll(String token, String branchId, String monthRaw) {
        User actor = requireManagerOrAdmin(token);
        assertCanAccessBranch(actor, branchId);
        LocalDate month = parsePayrollMonth(monthRaw);
        Set<String> userIds = listBranchUsers(branchId).stream().map(User::getId).collect(Collectors.toSet());
        return payrollRepository.findByMonthOrderByUserIdAsc(month).stream()
                .filter(item -> userIds.contains(item.getUserId()))
                .toList();
    }

    public List<Payroll> getUserPayroll(String token, String userId) {
        User actor = requireAnyStaff(token);
        if (actor.getRole() != User.Role.ADMIN && !Objects.equals(actor.getId(), userId)) {
            User target = requireUser(userId);
            assertCanAccessBranch(actor, target.getBranchId());
        }
        return payrollRepository.findByUserIdAndMonthBetweenOrderByMonthDesc(userId, LocalDate.now().minusYears(5), LocalDate.now().plusDays(1));
    }

    public Map<String, Object> generateBranchPayroll(String token, String branchId, GeneratePayrollRequest request) {
        User actor = requireManagerOrAdmin(token);
        assertCanAccessBranch(actor, branchId);
        LocalDate month = parsePayrollMonth(request.getMonth());
        LocalDate from = month.withDayOfMonth(1);
        LocalDate to = from.withDayOfMonth(from.lengthOfMonth());
        List<User> staffs = listBranchUsers(branchId);
        int generated = 0;
        for (User staff : staffs) {
            Payroll payroll = buildPayrollForUser(staff, from, to, month, actor);
            payrollRepository.save(payroll);
            generated++;
        }
        return Map.of("month", month.toString(), "generated", generated);
    }

    public List<PayrollDetail> payrollDetails(String token, String payrollId) {
        User actor = requireManagerOrAdmin(token);
        Payroll payroll = payrollRepository.findById(payrollId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay bang luong"));
        User user = requireUser(payroll.getUserId());
        assertCanAccessBranch(actor, user.getBranchId());
        return payrollDetailRepository.findByPayrollIdOrderByIdAsc(payrollId);
    }

    public Payroll approvePayroll(String token, String payrollId) {
        User actor = requireManagerOrAdmin(token);
        Payroll payroll = payrollRepository.findById(payrollId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay bang luong"));
        User user = requireUser(payroll.getUserId());
        assertCanAccessBranch(actor, user.getBranchId());
        payroll.setStatus(Payroll.PayrollStatus.APPROVED);
        payroll.setApprovedBy(actor.getId());
        payroll.setApprovedAt(LocalDateTime.now());
        return payrollRepository.save(payroll);
    }

    public Payroll payPayroll(String token, String payrollId) {
        User actor = requireManagerOrAdmin(token);
        Payroll payroll = payrollRepository.findById(payrollId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay bang luong"));
        User user = requireUser(payroll.getUserId());
        assertCanAccessBranch(actor, user.getBranchId());
        payroll.setStatus(Payroll.PayrollStatus.PAID);
        return payrollRepository.save(payroll);
    }

    public Map<String, Object> exportPayroll(String token, String payrollId) {
        User actor = requireManagerOrAdmin(token);
        Payroll payroll = payrollRepository.findById(payrollId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay bang luong"));
        User user = requireUser(payroll.getUserId());
        assertCanAccessBranch(actor, user.getBranchId());
        List<PayrollDetail> details = payrollDetailRepository.findByPayrollIdOrderByIdAsc(payrollId);
        return Map.of("payroll", payroll, "details", details, "exportedAt", LocalDateTime.now().toString());
    }

    private Payroll buildPayrollForUser(User user, LocalDate from, LocalDate to, LocalDate month, User actor) {
        List<HrAttendance> attendance = hrAttendanceRepository.findByUserIdAndDateBetweenOrderByDateDesc(user.getId(), from, to);
        BigDecimal workedMinutes = BigDecimal.valueOf(attendance.stream().mapToInt(item -> item.getWorkedMinutes() == null ? 0 : item.getWorkedMinutes()).sum());
        BigDecimal workedHours = workedMinutes.divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
        long presentDays = attendance.stream().filter(item -> item.getStatus() == HrAttendance.Status.PRESENT || item.getStatus() == HrAttendance.Status.LATE).count();
        long halfDays = attendance.stream().filter(item -> item.getStatus() == HrAttendance.Status.HALF_DAY).count();
        BigDecimal totalWorkedDays = BigDecimal.valueOf(presentDays).add(BigDecimal.valueOf(halfDays).multiply(new BigDecimal("0.5")));

        List<WorkSchedule> schedules = workScheduleRepository.findByUserIdAndDateBetweenOrderByDateAsc(user.getId(), from, to);
        BigDecimal standardDays = BigDecimal.valueOf(Math.max(1, schedules.size()));
        BigDecimal baseSalary = user.getBaseSalary() == null ? BigDecimal.ZERO : user.getBaseSalary();
        BigDecimal baseEarned;
        if (user.getSalaryType() == User.SalaryType.HOURLY) {
            baseEarned = baseSalary.multiply(workedHours);
        } else {
            baseEarned = baseSalary.multiply(totalWorkedDays).divide(standardDays, 2, RoundingMode.HALF_UP);
        }

        List<EmployeeSalaryComponent> components = employeeSalaryComponentRepository.findByUserIdAndEffectiveFromLessThanEqual(user.getId(), to).stream()
                .filter(item -> item.getEffectiveTo() == null || !item.getEffectiveTo().isBefore(from))
                .toList();
        Map<String, SalaryComponent> componentById = salaryComponentRepository.findAllById(
                components.stream().map(EmployeeSalaryComponent::getSalaryComponentId).toList()
        ).stream().collect(Collectors.toMap(SalaryComponent::getId, item -> item));

        BigDecimal allowance = BigDecimal.ZERO;
        BigDecimal bonus = BigDecimal.ZERO;
        BigDecimal deduction = BigDecimal.ZERO;

        List<PayrollDetail> details = new ArrayList<>();
        details.add(PayrollDetail.builder()
                .componentName("Base salary")
                .componentType(PayrollDetail.ComponentType.BASE)
                .amount(baseEarned)
                .note("Auto calculated")
                .build());

        for (EmployeeSalaryComponent item : components) {
            SalaryComponent component = componentById.get(item.getSalaryComponentId());
            if (component == null || Boolean.FALSE.equals(component.getIsActive())) continue;
            BigDecimal sourceAmount = item.getCustomAmount() != null ? item.getCustomAmount() : component.getAmount();
            BigDecimal calcAmount = switch (component.getCalculationType()) {
                case FIXED_AMOUNT -> sourceAmount;
                case PERCENT_OF_BASE -> baseEarned.multiply(sourceAmount).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
                case PER_HOUR -> sourceAmount.multiply(workedHours);
            };
            if (component.getType() == SalaryComponent.ComponentType.ALLOWANCE) allowance = allowance.add(calcAmount);
            if (component.getType() == SalaryComponent.ComponentType.BONUS) bonus = bonus.add(calcAmount);
            if (component.getType() == SalaryComponent.ComponentType.DEDUCTION) deduction = deduction.add(calcAmount);
            details.add(PayrollDetail.builder()
                    .componentName(component.getName())
                    .componentType(mapComponentType(component.getType()))
                    .amount(calcAmount)
                    .note(component.getCalculationType().name())
                    .build());
        }

        BigDecimal net = baseEarned.add(allowance).add(bonus).subtract(deduction).max(BigDecimal.ZERO);
        Payroll payroll = payrollRepository.findByUserIdAndMonth(user.getId(), month).orElse(Payroll.builder()
                .userId(user.getId())
                .month(month)
                .build());
        if (payroll.getStatus() == Payroll.PayrollStatus.APPROVED && actor.getRole() != User.Role.ADMIN) {
            return payroll;
        }
        payroll.setTotalWorkedHours(workedHours);
        payroll.setTotalWorkedDays(totalWorkedDays);
        payroll.setBaseSalaryEarned(baseEarned);
        payroll.setTotalAllowances(allowance);
        payroll.setTotalBonus(bonus);
        payroll.setTotalDeductions(deduction);
        payroll.setNetSalary(net);
        payroll.setStatus(Payroll.PayrollStatus.DRAFT);
        Payroll saved = payrollRepository.save(payroll);
        payrollDetailRepository.deleteByPayrollId(saved.getId());
        for (PayrollDetail detail : details) {
            detail.setPayrollId(saved.getId());
        }
        payrollDetailRepository.saveAll(details);
        return saved;
    }

    private PayrollDetail.ComponentType mapComponentType(SalaryComponent.ComponentType type) {
        return switch (type) {
            case ALLOWANCE -> PayrollDetail.ComponentType.ALLOWANCE;
            case BONUS -> PayrollDetail.ComponentType.BONUS;
            case DEDUCTION -> PayrollDetail.ComponentType.DEDUCTION;
        };
    }

    private List<WorkSchedule> filterBranchSchedules(String branchId, LocalDate from, LocalDate to) {
        Set<String> userIds = listBranchUsers(branchId).stream().map(User::getId).collect(Collectors.toSet());
        return workScheduleRepository.findByDateBetweenOrderByDateAsc(from, to).stream()
                .filter(item -> userIds.contains(item.getUserId()))
                .toList();
    }

    private List<Map<String, Object>> toScheduleResponses(List<WorkSchedule> items) {
        return items.stream().map(this::toScheduleResponse).toList();
    }

    private Map<String, Object> toScheduleResponse(WorkSchedule item) {
        User user = requireUser(item.getUserId());
        HrShift shift = requireShift(item.getShiftId());
        return Map.of(
                "id", item.getId(),
                "userId", item.getUserId(),
                "userName", user.getName(),
                "shiftId", item.getShiftId(),
                "shiftName", shift.getName(),
                "date", item.getDate().toString(),
                "notes", item.getNotes() == null ? "" : item.getNotes()
        );
    }

    private void recalculateAttendance(HrAttendance attendance) {
        if (attendance.getCheckInTime() == null || attendance.getCheckOutTime() == null) {
            attendance.setWorkedMinutes(0);
            attendance.setOvertimeMinutes(0);
            return;
        }
        LocalDate date = attendance.getDate();
        User user = requireUser(attendance.getUserId());
        WorkSchedule schedule = workScheduleRepository.findByUserIdAndDate(user.getId(), date).orElse(null);
        HrShift shift = schedule == null ? null : requireShift(schedule.getShiftId());
        long totalMinutes = Math.max(0L, Duration.between(attendance.getCheckInTime(), attendance.getCheckOutTime()).toMinutes());
        int breakMinutes = shift == null || shift.getBreakMinutes() == null ? 0 : shift.getBreakMinutes();
        int worked = (int) Math.max(0L, totalMinutes - breakMinutes);
        attendance.setWorkedMinutes(worked);
        int shiftMinutes = shift == null ? 0 : (int) Math.max(0L, Duration.between(shift.getStartTime(), shift.getEndTime()).toMinutes() - breakMinutes);
        attendance.setOvertimeMinutes(Math.max(0, worked - shiftMinutes));
        attendance.setStatus(resolveAttendanceStatus(user.getId(), date, attendance.getCheckInTime(), attendance.getCheckOutTime()));
    }

    private HrAttendance.Status resolveAttendanceStatus(String userId, LocalDate date, LocalDateTime checkIn, LocalDateTime checkOut) {
        if (checkIn == null && checkOut == null) return HrAttendance.Status.ABSENT;
        WorkSchedule schedule = workScheduleRepository.findByUserIdAndDate(userId, date).orElse(null);
        if (schedule == null) return HrAttendance.Status.PRESENT;
        HrShift shift = requireShift(schedule.getShiftId());
        LocalDateTime shiftStart = LocalDateTime.of(date, shift.getStartTime());
        if (checkIn != null && checkIn.isAfter(shiftStart.plusMinutes(LATE_TOLERANCE_MINUTES))) {
            return HrAttendance.Status.LATE;
        }
        if (checkIn != null && checkOut != null) {
            long shiftMinutes = Math.max(1L, Duration.between(shift.getStartTime(), shift.getEndTime()).toMinutes() - (shift.getBreakMinutes() == null ? 0 : shift.getBreakMinutes()));
            long worked = Math.max(0L, Duration.between(checkIn, checkOut).toMinutes() - (shift.getBreakMinutes() == null ? 0 : shift.getBreakMinutes()));
            BigDecimal ratio = BigDecimal.valueOf(worked).divide(BigDecimal.valueOf(shiftMinutes), 4, RoundingMode.HALF_UP);
            if (ratio.compareTo(HALF_DAY_THRESHOLD) < 0) return HrAttendance.Status.HALF_DAY;
        }
        return HrAttendance.Status.PRESENT;
    }

    private Map<String, Object> toAttendanceResponse(HrAttendance item) {
        User user = requireUser(item.getUserId());
        return Map.ofEntries(
                Map.entry("id", item.getId()),
                Map.entry("userId", item.getUserId()),
                Map.entry("userName", user.getName()),
                Map.entry("date", item.getDate().toString()),
                Map.entry("checkInTime", item.getCheckInTime()),
                Map.entry("checkOutTime", item.getCheckOutTime()),
                Map.entry("checkInNote", item.getCheckInNote() == null ? "" : item.getCheckInNote()),
                Map.entry("checkOutNote", item.getCheckOutNote() == null ? "" : item.getCheckOutNote()),
                Map.entry("status", item.getStatus().name()),
                Map.entry("workedMinutes", item.getWorkedMinutes()),
                Map.entry("overtimeMinutes", item.getOvertimeMinutes()),
                Map.entry("approvedBy", item.getApprovedBy()),
                Map.entry("approvedAt", item.getApprovedAt())
        );
    }

    private Map<String, Object> toLeaveResponse(LeaveRequest leave) {
        User user = requireUser(leave.getUserId());
        return Map.of(
                "id", leave.getId(),
                "userId", leave.getUserId(),
                "userName", user.getName(),
                "startDate", leave.getStartDate().toString(),
                "endDate", leave.getEndDate().toString(),
                "leaveType", leave.getLeaveType().name(),
                "reason", leave.getReason() == null ? "" : leave.getReason(),
                "status", leave.getStatus().name(),
                "approvedBy", leave.getApprovedBy(),
                "createdAt", leave.getCreatedAt()
        );
    }

    private List<User> listBranchUsers(String branchId) {
        return userRepository.findByRoleInAndBranchIdOrderByCreatedAtDesc(List.of(User.Role.MANAGER, User.Role.BARISTA, User.Role.WAITER, User.Role.STAFF), branchId);
    }

    private User resolveAttendanceStaff(User actor, HrAttendanceCheckRequest request) {
        String code = normalizeText(request.getEmployeeCode());
        if (actor.getRole() == User.Role.ADMIN || actor.getRole() == User.Role.MANAGER) {
            if (code != null) {
                User target = userRepository.findByEmployeeCode(code)
                        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nhan vien"));
                assertCanAccessBranch(actor, target.getBranchId());
                return target;
            }
        }
        return actor;
    }

    private User requireAdmin(String token) {
        User user = requireUserFromToken(token);
        if (user.getRole() != User.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi ADMIN moi duoc truy cap");
        }
        return user;
    }

    private User requireManagerOrAdmin(String token) {
        User user = requireUserFromToken(token);
        if (user.getRole() != User.Role.ADMIN && user.getRole() != User.Role.MANAGER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi ADMIN/MANAGER moi duoc truy cap");
        }
        return user;
    }

    private User requireAnyStaff(String token) {
        User user = requireUserFromToken(token);
        if (user.getRole() == User.Role.CUSTOMER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi nhan vien moi duoc truy cap");
        }
        return user;
    }

    private void assertCanAccessBranch(User actor, String branchId) {
        if (actor.getRole() == User.Role.ADMIN) return;
        if (!Objects.equals(actor.getBranchId(), branchId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Khong co quyen truy cap chi nhanh nay");
        }
    }

    private User requireUserFromToken(String token) {
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Thieu token");
        }
        String userId = jwtUtil.getUserIdFromToken(token);
        return requireUser(userId);
    }

    private User requireUser(String id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay user"));
    }

    private HrShift requireShift(String id) {
        return hrShiftRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay shift"));
    }

    private LocalDate parseDate(String value) {
        try {
            return LocalDate.parse(value);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ngay khong hop le");
        }
    }

    private LocalDate parseDateOrDefault(String value, LocalDate fallback) {
        if (value == null || value.isBlank()) return fallback;
        return parseDate(value);
    }

    private LocalDate parsePayrollMonth(String value) {
        if (value == null || value.isBlank()) {
            LocalDate now = LocalDate.now();
            return LocalDate.of(now.getYear(), now.getMonth(), 1);
        }
        LocalDate date = parseDate(value);
        return LocalDate.of(date.getYear(), date.getMonth(), 1);
    }

    private LocalDateTime parseDateTime(Object value) {
        if (value == null) return null;
        try {
            return LocalDateTime.parse(String.valueOf(value));
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Datetime khong hop le");
        }
    }

    private LocalTime parseTime(String value) {
        try {
            return LocalTime.parse(value);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thoi gian ca khong hop le");
        }
    }

    private String normalizeText(String value) {
        if (value == null) return null;
        String v = value.trim();
        return v.isBlank() ? null : v;
    }

    private String generateTemporaryPassword(int length) {
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < Math.max(length, 12); index++) {
            int next = RANDOM.nextInt(AUTO_PASSWORD_CHARS.length());
            builder.append(AUTO_PASSWORD_CHARS.charAt(next));
        }
        return builder.toString();
    }

    private String maskEmail(String email) {
        String normalized = normalizeText(email);
        if (normalized == null || !normalized.contains("@")) return "n***@***";
        String[] parts = normalized.split("@", 2);
        String local = parts[0];
        String domain = parts[1];
        if (local.length() <= 1) {
            return "*@" + domain;
        }
        return local.charAt(0) + "***@" + domain;
    }

    private String requireText(String value, String error) {
        String normalized = normalizeText(value);
        if (normalized == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error);
        return normalized;
    }

    private String normalizeUpper(String value, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private String resolveBranchName(String branchId) {
        if (branchId == null) return null;
        return branchRepository.findById(branchId).map(Branch::getName).orElse(null);
    }
}
