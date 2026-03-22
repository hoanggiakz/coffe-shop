package com.coffeeshop.userservice.service;

import com.coffeeshop.userservice.config.JwtUtil;
import com.coffeeshop.userservice.dto.*;
import com.coffeeshop.userservice.entity.AttendanceRecord;
import com.coffeeshop.userservice.entity.Branch;
import com.coffeeshop.userservice.entity.ShiftType;
import com.coffeeshop.userservice.entity.StaffShift;
import com.coffeeshop.userservice.entity.User;
import com.coffeeshop.userservice.repository.AttendanceRecordRepository;
import com.coffeeshop.userservice.repository.BranchRepository;
import com.coffeeshop.userservice.repository.StaffShiftRepository;
import com.coffeeshop.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final long OTP_EXPIRES_SECONDS = 300L;
    private static final Set<User.Role> MANAGER_ROLES = Set.of(User.Role.ADMIN, User.Role.MANAGER);
    private static final Set<User.Role> BRANCH_MANAGER_ROLES = Set.of(User.Role.ADMIN, User.Role.MANAGER);
    private static final List<User.Role> STAFF_ROLES = List.of(
            User.Role.ADMIN, User.Role.MANAGER, User.Role.WAITER, User.Role.BARISTA, User.Role.STAFF
    );

    private final UserRepository userRepository;
    private final BranchRepository branchRepository;
    private final StaffShiftRepository staffShiftRepository;
    private final AttendanceRecordRepository attendanceRecordRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final Map<String, OtpEntry> otpStore = new ConcurrentHashMap<>();

    public StaffResponse register(String token, RegisterRequest req) {
        User actor = requireManagerOrAdmin(token);
        User.Role role = req.getRole() != null ? req.getRole() : User.Role.WAITER;
        assertManageableRole(actor, role);

        StaffCreateRequest createRequest = new StaffCreateRequest();
        createRequest.setName(req.getName());
        createRequest.setEmail(req.getEmail());
        createRequest.setPassword(req.getPassword());
        createRequest.setPhone(req.getPhone());
        createRequest.setRole(role);
        return createStaff(actor, createRequest);
    }

    public AuthResponse login(LoginRequest req) {
        User user = userRepository.findByEmail(normalizeEmail(req.getEmail()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email hoac mat khau khong dung"));

        if (!passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email hoac mat khau khong dung");
        }
        if (user.getRole() == User.Role.CUSTOMER) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Vui long dang nhap bang cong khach hang");
        }
        if (Boolean.FALSE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan da bi vo hieu hoa");
        }

        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return new AuthResponse(token, UserProfile.from(user));
    }

    public UserProfile getProfile(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nguoi dung"));
        return UserProfile.from(user);
    }

    public OtpResponse requestCustomerOtp(OtpRequest req) {
        String phone = normalizeRequiredPhone(req.getPhone());
        String otp = String.format("%06d", ThreadLocalRandom.current().nextInt(0, 1_000_000));
        long expiresAt = System.currentTimeMillis() + (OTP_EXPIRES_SECONDS * 1000);
        otpStore.put(phone, new OtpEntry(otp, expiresAt));
        return new OtpResponse("OTP generated (sandbox)", otp, OTP_EXPIRES_SECONDS);
    }

    public AuthResponse registerCustomerByEmail(CustomerEmailRegisterRequest req) {
        String email = normalizeEmail(req.getEmail());
        if (userRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email da ton tai");
        }
        String normalizedPhone = normalizePhone(req.getPhone());
        if (normalizedPhone != null && userRepository.existsByPhone(normalizedPhone)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "So dien thoai da ton tai");
        }

        User user = User.builder()
                .email(email)
                .password(passwordEncoder.encode(req.getPassword()))
                .name(req.getName())
                .phone(normalizedPhone)
                .role(User.Role.CUSTOMER)
                .memberTier(User.MemberTier.STANDARD)
                .loyaltyPoints(0)
                .totalSpent(0L)
                .isActive(true)
                .build();

        user = userRepository.save(user);
        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return new AuthResponse(token, UserProfile.from(user));
    }

    public AuthResponse loginCustomerByEmail(CustomerEmailLoginRequest req) {
        User user = userRepository.findByEmailAndRole(normalizeEmail(req.getEmail()), User.Role.CUSTOMER)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan hoac mat khau khong dung"));
        if (!passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan hoac mat khau khong dung");
        }
        if (Boolean.FALSE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan da bi vo hieu hoa");
        }
        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return new AuthResponse(token, UserProfile.from(user));
    }

    public AuthResponse registerCustomerByOtp(CustomerOtpRegisterRequest req) {
        String phone = normalizeRequiredPhone(req.getPhone());
        verifyAndConsumeOtp(phone, req.getOtp());
        if (userRepository.existsByPhone(phone)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "So dien thoai da duoc dang ky");
        }
        String email = resolveOtpCustomerEmail(phone, req.getEmail());
        if (userRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email da ton tai");
        }

        User user = User.builder()
                .email(email)
                .password(passwordEncoder.encode("otp-" + UUID.randomUUID()))
                .name(req.getName())
                .phone(phone)
                .role(User.Role.CUSTOMER)
                .memberTier(User.MemberTier.STANDARD)
                .loyaltyPoints(0)
                .totalSpent(0L)
                .isActive(true)
                .build();

        user = userRepository.save(user);
        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return new AuthResponse(token, UserProfile.from(user));
    }

    public AuthResponse loginCustomerByOtp(CustomerOtpLoginRequest req) {
        String phone = normalizeRequiredPhone(req.getPhone());
        verifyAndConsumeOtp(phone, req.getOtp());
        User user = userRepository.findByPhoneAndRole(phone, User.Role.CUSTOMER)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Khong tim thay tai khoan khach hang"));
        if (Boolean.FALSE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan da bi vo hieu hoa");
        }
        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return new AuthResponse(token, UserProfile.from(user));
    }

    public UserProfile getCustomerProfile(String token) {
        User user = requireCustomerFromToken(token);
        return UserProfile.from(user);
    }

    public CustomerOffersResponse getCustomerOffers(String token) {
        User user = requireCustomerFromToken(token);
        List<String> offers = new ArrayList<>();
        offers.add("Tich 1 diem cho moi 10.000d chi tieu");
        if (user.getMemberTier() == User.MemberTier.SILVER) {
            offers.add("Uu dai SILVER: giam 5% toi da 30.000d");
        } else if (user.getMemberTier() == User.MemberTier.GOLD) {
            offers.add("Uu dai GOLD: giam 10% toi da 80.000d");
            offers.add("Uu tien phuc vu va uu dai sinh nhat");
        } else {
            offers.add("Nang cap SILVER khi tong chi tieu dat 3.000.000d");
        }
        if (user.getLoyaltyPoints() >= 50) offers.add("Co the doi 50 diem lay voucher 20.000d");
        if (user.getLoyaltyPoints() >= 120) offers.add("Co the doi 120 diem lay combo free drink");
        return new CustomerOffersResponse(user.getMemberTier().name(), user.getLoyaltyPoints(), offers);
    }

    public PointsAccrualResponse accrueCustomerPoints(PointsAccrualRequest req) {
        User user = userRepository.findById(req.getCustomerId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay khach hang"));
        if (user.getRole() != User.Role.CUSTOMER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User khong phai khach hang");
        }
        int pointsEarned = (int) Math.max(0L, req.getAmount() / 10000L);
        long currentSpent = user.getTotalSpent() == null ? 0L : user.getTotalSpent();
        int currentPoints = user.getLoyaltyPoints() == null ? 0 : user.getLoyaltyPoints();
        long newTotalSpent = currentSpent + Math.max(0L, req.getAmount());
        int newTotalPoints = currentPoints + pointsEarned;
        user.setTotalSpent(newTotalSpent);
        user.setLoyaltyPoints(newTotalPoints);
        user.setMemberTier(resolveTier(newTotalSpent, newTotalPoints));
        user = userRepository.save(user);
        return new PointsAccrualResponse(user.getId(), req.getOrderId(), pointsEarned, user.getLoyaltyPoints(), user.getMemberTier().name());
    }

    // M-24/M-25: Quan ly chi nhanh
    public List<BranchResponse> listBranches(String token, Boolean includeInactive) {
        requireManagerOrAdmin(token);
        boolean showInactive = Boolean.TRUE.equals(includeInactive);
        List<Branch> branches = showInactive
                ? branchRepository.findAllByOrderByCreatedAtDesc()
                : branchRepository.findByIsActiveOrderByCreatedAtDesc(true);
        return branches.stream().map(this::toBranchResponse).collect(Collectors.toList());
    }

    public BranchResponse getBranch(String token, String branchId) {
        requireManagerOrAdmin(token);
        Branch branch = requireBranchById(branchId);
        return toBranchResponse(branch);
    }

    public BranchResponse createBranch(String token, BranchCreateRequest req) {
        requireAdmin(token);
        String name = String.valueOf(req.getName() == null ? "" : req.getName()).trim();
        if (name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ten chi nhanh khong duoc de trong");
        }

        if (branchRepository.existsByNameIgnoreCase(name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ten chi nhanh da ton tai");
        }

        String managerId = normalizeBranchId(req.getManagerId());
        User manager = validateBranchManager(managerId);

        Branch branch = Branch.builder()
                .name(name)
                .address(normalizeNullableText(req.getAddress()))
                .phone(normalizePhone(req.getPhone()))
                .managerId(manager != null ? manager.getId() : null)
                .isActive(req.getIsActive() == null ? true : req.getIsActive())
                .build();

        branch = branchRepository.save(branch);

        if (manager != null) {
            manager.setBranchId(branch.getId());
            userRepository.save(manager);
        }

        return toBranchResponse(branch);
    }

    public BranchResponse updateBranch(String token, String branchId, BranchUpdateRequest req) {
        requireAdmin(token);
        Branch branch = requireBranchById(branchId);
        String previousManagerId = branch.getManagerId();

        if (req.getName() != null) {
            String name = req.getName().trim();
            if (name.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ten chi nhanh khong duoc de trong");
            }
            if (!name.equalsIgnoreCase(branch.getName()) && branchRepository.existsByNameIgnoreCase(name)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Ten chi nhanh da ton tai");
            }
            branch.setName(name);
        }

        if (req.getAddress() != null) {
            branch.setAddress(normalizeNullableText(req.getAddress()));
        }

        if (req.getPhone() != null) {
            branch.setPhone(normalizePhone(req.getPhone()));
        }

        User newManager = null;
        boolean managerChanged = false;
        if (req.getManagerId() != null) {
            String nextManagerId = normalizeBranchId(req.getManagerId());
            newManager = validateBranchManager(nextManagerId);
            String normalizedPrevious = normalizeBranchId(previousManagerId);
            managerChanged = !Objects.equals(normalizedPrevious, nextManagerId);
            branch.setManagerId(newManager != null ? newManager.getId() : null);
        }

        if (req.getIsActive() != null) {
            branch.setIsActive(req.getIsActive());
        }

        branch = branchRepository.save(branch);
        String updatedBranchId = branch.getId();

        if (managerChanged) {
            if (previousManagerId != null && !previousManagerId.isBlank()) {
                userRepository.findById(previousManagerId).ifPresent(user -> {
                    if (updatedBranchId.equals(user.getBranchId())) {
                        user.setBranchId(null);
                        userRepository.save(user);
                    }
                });
            }

            if (newManager != null && !updatedBranchId.equals(newManager.getBranchId())) {
                newManager.setBranchId(updatedBranchId);
                userRepository.save(newManager);
            }
        }

        return toBranchResponse(branch);
    }

    public BranchResponse deleteBranch(String token, String branchId) {
        requireAdmin(token);
        Branch branch = requireBranchById(branchId);
        branch.setIsActive(false);
        branch = branchRepository.save(branch);
        return toBranchResponse(branch);
    }

    // M-01: Them / sua / xoa nhan vien
    public List<StaffResponse> listStaff(String token, String keyword, User.Role role, String branchId, Boolean includeInactive) {
        User actor = requireAnyStaff(token);
        boolean canViewSensitiveData = MANAGER_ROLES.contains(actor.getRole());

        String normalizedKeyword = String.valueOf(keyword == null ? "" : keyword).trim().toLowerCase(Locale.ROOT);
        String normalizedBranchId = normalizeBranchId(branchId);
        boolean showInactive = canViewSensitiveData && Boolean.TRUE.equals(includeInactive);

        List<User> users = normalizedBranchId == null
                ? userRepository.findByRoleInOrderByCreatedAtDesc(STAFF_ROLES)
                : userRepository.findByRoleInAndBranchIdOrderByCreatedAtDesc(STAFF_ROLES, normalizedBranchId);

        Map<String, String> branchNamesById = branchRepository.findAllById(
                        users.stream()
                                .map(User::getBranchId)
                                .filter(Objects::nonNull)
                                .filter(id -> !id.isBlank())
                                .distinct()
                                .collect(Collectors.toList())
                ).stream()
                .collect(Collectors.toMap(Branch::getId, Branch::getName));

        return users.stream()
                .filter(user -> showInactive || !Boolean.FALSE.equals(user.getIsActive()))
                .filter(user -> role == null || user.getRole() == role)
                .filter(user -> {
                    if (normalizedKeyword.isEmpty()) return true;
                    return containsIgnoreCase(user.getName(), normalizedKeyword)
                            || containsIgnoreCase(user.getEmail(), normalizedKeyword)
                            || containsIgnoreCase(user.getPhone(), normalizedKeyword)
                            || containsIgnoreCase(user.getEmployeeCode(), normalizedKeyword);
                })
                .map(user -> toStaffResponse(user, canViewSensitiveData, branchNamesById.get(user.getBranchId())))
                .collect(Collectors.toList());
    }

    public StaffResponse createStaff(String token, StaffCreateRequest req) {
        User actor = requireManagerOrAdmin(token);
        return createStaff(actor, req);
    }

    private StaffResponse createStaff(User actor, StaffCreateRequest req) {
        assertManageableRole(actor, req.getRole());

        if (req.getRole() == null || req.getRole() == User.Role.CUSTOMER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role nhan vien khong hop le");
        }

        String email = normalizeEmail(req.getEmail());
        if (userRepository.existsByEmail(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email da ton tai");
        }

        String normalizedPhone = normalizePhone(req.getPhone());
        if (normalizedPhone != null && userRepository.existsByPhone(normalizedPhone)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "So dien thoai da ton tai");
        }

        String normalizedBranchId = resolveBranchAssignment(req.getBranchId());
        String employeeCode = resolveEmployeeCode(req.getEmployeeCode(), null);
        String personalQrCode = resolvePersonalQrCode(req.getPersonalQrCode(), employeeCode, null);

        User user = User.builder()
                .name(req.getName().trim())
                .email(email)
                .password(passwordEncoder.encode(req.getPassword()))
                .phone(normalizedPhone)
                .role(req.getRole())
                .employeeCode(employeeCode)
                .personalQrCode(personalQrCode)
                .preferredShift(req.getPreferredShift())
                .branchId(normalizedBranchId)
                .memberTier(User.MemberTier.STANDARD)
                .loyaltyPoints(0)
                .totalSpent(0L)
                .isActive(true)
                .build();

        user = userRepository.save(user);
        return toStaffResponse(user, true, resolveBranchName(user.getBranchId()));
    }

    public StaffResponse updateStaff(String token, String staffId, StaffUpdateRequest req) {
        User actor = requireManagerOrAdmin(token);

        User user = requireStaffById(staffId);
        assertCanManageTargetStaff(actor, user);
        String currentEmail = user.getEmail();
        String currentPhone = user.getPhone();
        String currentEmployeeCode = user.getEmployeeCode();
        String currentQrCode = user.getPersonalQrCode();

        if (req.getName() != null && !req.getName().isBlank()) {
            user.setName(req.getName().trim());
        }
        if (req.getEmail() != null && !req.getEmail().isBlank()) {
            String nextEmail = normalizeEmail(req.getEmail());
            if (!nextEmail.equalsIgnoreCase(currentEmail) && userRepository.existsByEmail(nextEmail)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Email da ton tai");
            }
            user.setEmail(nextEmail);
        }
        if (req.getPassword() != null && !req.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(req.getPassword()));
        }
        if (req.getPhone() != null) {
            String nextPhone = normalizePhone(req.getPhone());
            if (nextPhone != null && (currentPhone == null || !currentPhone.equals(nextPhone)) && userRepository.existsByPhone(nextPhone)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "So dien thoai da ton tai");
            }
            user.setPhone(nextPhone);
        }
        if (req.getRole() != null) {
            if (req.getRole() == User.Role.CUSTOMER) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong the doi thanh role CUSTOMER");
            }
            assertManageableRole(actor, req.getRole());
            user.setRole(req.getRole());
        }
        if (req.getPreferredShift() != null) {
            user.setPreferredShift(req.getPreferredShift());
        }
        if (req.getBranchId() != null) {
            user.setBranchId(resolveBranchAssignment(req.getBranchId()));
        }
        if (req.getEmployeeCode() != null) {
            String nextEmployeeCode = resolveEmployeeCode(req.getEmployeeCode(), staffId);
            if (nextEmployeeCode == null || nextEmployeeCode.isBlank()) {
                nextEmployeeCode = resolveEmployeeCode(null, staffId);
            }
            if (currentEmployeeCode == null || !currentEmployeeCode.equals(nextEmployeeCode)) {
                user.setEmployeeCode(nextEmployeeCode);
            }
        }
        if (req.getPersonalQrCode() != null) {
            String nextQrCode = resolvePersonalQrCode(req.getPersonalQrCode(), user.getEmployeeCode(), staffId);
            if (nextQrCode == null || nextQrCode.isBlank()) {
                nextQrCode = resolvePersonalQrCode(null, user.getEmployeeCode(), staffId);
            }
            if (currentQrCode == null || !currentQrCode.equals(nextQrCode)) {
                user.setPersonalQrCode(nextQrCode);
            }
        }
        if (req.getIsActive() != null) {
            user.setIsActive(req.getIsActive());
        }

        user = userRepository.save(user);
        return toStaffResponse(user, true, resolveBranchName(user.getBranchId()));
    }

    public StaffResponse deleteStaff(String token, String staffId) {
        User actor = requireManagerOrAdmin(token);
        User user = requireStaffById(staffId);

        if (Objects.equals(actor.getId(), user.getId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong the tu xoa tai khoan dang dang nhap");
        }
        assertCanManageTargetStaff(actor, user);

        String archivedEmail = "deleted+" + user.getId() + "+" + System.currentTimeMillis() + "@archived.local";
        user.setIsActive(false);
        user.setEmail(archivedEmail);
        user.setPhone(null);
        user.setEmployeeCode(null);
        user.setPersonalQrCode(null);

        user = userRepository.save(user);
        return toStaffResponse(user, true, resolveBranchName(user.getBranchId()));
    }

    // M-02: Phan ca
    public WeekScheduleResponse getWeekSchedule(String token, String weekStart, String staffId) {
        requireManagerOrAdmin(token);

        LocalDate start = resolveWeekStart(weekStart);
        LocalDate end = start.plusDays(6);

        List<StaffShift> shifts;
        if (staffId != null && !staffId.isBlank()) {
            shifts = staffShiftRepository.findByStaffIdAndShiftDateBetweenOrderByShiftDateAsc(staffId.trim(), start, end);
        } else {
            shifts = staffShiftRepository.findByShiftDateBetweenOrderByShiftDateAsc(start, end);
        }

        List<StaffShiftResponse> data = shifts.stream()
                .map(StaffShiftResponse::from)
                .collect(Collectors.toList());

        return new WeekScheduleResponse(start, end, data);
    }

    public StaffShiftResponse upsertShift(String token, StaffShiftRequest req) {
        requireManagerOrAdmin(token);

        User staff = requireStaffById(req.getStaffId());
        if (Boolean.FALSE.equals(staff.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhan vien da vo hieu hoa");
        }

        StaffShift shift = staffShiftRepository.findByStaffIdAndShiftDateAndShiftType(
                staff.getId(), req.getShiftDate(), req.getShiftType()
        ).orElseGet(() -> StaffShift.builder()
                .staffId(staff.getId())
                .shiftDate(req.getShiftDate())
                .shiftType(req.getShiftType())
                .build());

        shift.setStaffName(staff.getName());
        shift.setNote(req.getNote());

        shift = staffShiftRepository.save(shift);
        return StaffShiftResponse.from(shift);
    }

    public void deleteShift(String token, String shiftId) {
        requireManagerOrAdmin(token);
        if (!staffShiftRepository.existsById(shiftId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay ca lam");
        }
        staffShiftRepository.deleteById(shiftId);
    }

    // M-03: Cham cong
    public AttendanceResponse checkIn(String token, AttendanceCheckRequest req) {
        requireAnyStaff(token);
        User staff = findStaffByIdentifier(req);
        LocalDate today = LocalDate.now();

        AttendanceRecord existing = attendanceRecordRepository.findByStaffIdAndWorkDate(staff.getId(), today).orElse(null);
        if (existing != null && existing.getCheckOutAt() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhan vien da check-in cho hom nay");
        }
        if (existing != null && existing.getCheckOutAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhan vien da check-out cho hom nay");
        }

        ShiftType scheduledShift = staffShiftRepository.findByStaffIdAndShiftDateBetweenOrderByShiftDateAsc(
                        staff.getId(), today, today
                ).stream()
                .findFirst()
                .map(StaffShift::getShiftType)
                .orElse(null);

        AttendanceRecord created = AttendanceRecord.builder()
                .staffId(staff.getId())
                .staffName(staff.getName())
                .workDate(today)
                .scheduledShift(scheduledShift)
                .checkInAt(LocalDateTime.now())
                .checkInMethod(req.getMethod())
                .checkInIdentifier(req.getIdentifier().trim())
                .build();

        created = attendanceRecordRepository.save(created);
        return AttendanceResponse.from(created);
    }

    public AttendanceResponse checkOut(String token, AttendanceCheckRequest req) {
        requireAnyStaff(token);
        User staff = findStaffByIdentifier(req);
        LocalDate today = LocalDate.now();

        AttendanceRecord record = attendanceRecordRepository.findByStaffIdAndWorkDate(staff.getId(), today)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhan vien chua check-in hom nay"));
        if (record.getCheckOutAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhan vien da check-out hom nay");
        }

        record.setCheckOutAt(LocalDateTime.now());
        record.setCheckOutMethod(req.getMethod());
        record.setCheckOutIdentifier(req.getIdentifier().trim());
        record = attendanceRecordRepository.save(record);
        return AttendanceResponse.from(record);
    }

    public List<AttendanceResponse> getAttendance(String token, String staffId, String dateFrom, String dateTo) {
        User actor = requireAnyStaff(token);
        LocalDate from = parseDateOrDefault(dateFrom, LocalDate.now());
        LocalDate to = parseDateOrDefault(dateTo, from);
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dateFrom phai <= dateTo");
        }

        List<AttendanceRecord> records;
        if (MANAGER_ROLES.contains(actor.getRole())) {
            if (staffId != null && !staffId.isBlank()) {
                records = attendanceRecordRepository.findByStaffIdAndWorkDateBetweenOrderByWorkDateDescCheckInAtDesc(staffId.trim(), from, to);
            } else {
                records = attendanceRecordRepository.findByWorkDateBetweenOrderByWorkDateDescCheckInAtDesc(from, to);
            }
        } else {
            records = attendanceRecordRepository.findByStaffIdAndWorkDateBetweenOrderByWorkDateDescCheckInAtDesc(actor.getId(), from, to);
        }

        return records.stream().map(AttendanceResponse::from).collect(Collectors.toList());
    }

    private User findStaffByIdentifier(AttendanceCheckRequest req) {
        String identifier = String.valueOf(req.getIdentifier() == null ? "" : req.getIdentifier()).trim();
        if (identifier.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thieu ma nhan vien hoac ma QR");
        }

        User user = switch (req.getMethod()) {
            case EMPLOYEE_CODE -> userRepository.findByEmployeeCode(identifier).orElse(null);
            case QR -> userRepository.findByPersonalQrCode(identifier).orElse(null);
        };

        if (user == null || !isStaffRole(user.getRole()) || Boolean.FALSE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nhan vien hop le");
        }

        return user;
    }

    private User requireStaffById(String staffId) {
        User user = userRepository.findById(staffId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nhan vien"));
        if (!isStaffRole(user.getRole())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "User khong phai nhan vien");
        }
        return user;
    }

    private Branch requireBranchById(String branchId) {
        String normalized = normalizeBranchId(branchId);
        if (normalized == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "BranchId khong hop le");
        }
        return branchRepository.findById(normalized)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay chi nhanh"));
    }

    private BranchResponse toBranchResponse(Branch branch) {
        String managerName = null;
        if (branch.getManagerId() != null && !branch.getManagerId().isBlank()) {
            managerName = userRepository.findById(branch.getManagerId())
                    .map(User::getName)
                    .orElse(null);
        }

        long staffCount = userRepository.countByBranchIdAndRoleIn(branch.getId(), STAFF_ROLES);
        return BranchResponse.from(branch, managerName, staffCount);
    }

    private StaffResponse toStaffResponse(User user, boolean includeSensitiveData, String branchName) {
        if (includeSensitiveData) {
            return StaffResponse.from(user, branchName);
        }

        return new StaffResponse(
                user.getId(),
                user.getName(),
                null,
                null,
                user.getRole().name(),
                null,
                null,
                user.getPreferredShift() != null ? user.getPreferredShift().name() : null,
                user.getBranchId(),
                branchName,
                user.getIsActive(),
                user.getCreatedAt()
        );
    }

    private String resolveBranchName(String branchId) {
        String normalizedBranchId = normalizeBranchId(branchId);
        if (normalizedBranchId == null) {
            return null;
        }

        return branchRepository.findById(normalizedBranchId)
                .map(Branch::getName)
                .orElse(null);
    }

    private User validateBranchManager(String managerId) {
        String normalizedManagerId = normalizeBranchId(managerId);
        if (normalizedManagerId == null) {
            return null;
        }

        User manager = userRepository.findById(normalizedManagerId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay quan ly chi nhanh"));
        if (!BRANCH_MANAGER_ROLES.contains(manager.getRole())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quan ly chi nhanh phai co role MANAGER hoac ADMIN");
        }
        if (Boolean.FALSE.equals(manager.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quan ly chi nhanh dang bi vo hieu hoa");
        }

        return manager;
    }

    private String resolveBranchAssignment(String branchId) {
        String normalizedBranchId = normalizeBranchId(branchId);
        if (normalizedBranchId == null) {
            return null;
        }

        Branch branch = requireBranchById(normalizedBranchId);
        if (Boolean.FALSE.equals(branch.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong the gan chi nhanh da vo hieu hoa");
        }

        return branch.getId();
    }

    private User requireAdmin(String token) {
        User actor = requireUserFromToken(token);
        if (actor.getRole() != User.Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi ADMIN moi duoc truy cap");
        }
        return actor;
    }

    private User requireManagerOrAdmin(String token) {
        User actor = requireUserFromToken(token);
        if (!MANAGER_ROLES.contains(actor.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi MANAGER/ADMIN moi duoc truy cap");
        }
        return actor;
    }

    private void assertManageableRole(User actor, User.Role role) {
        if (role == null || role == User.Role.CUSTOMER) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Role nhan vien khong hop le");
        }
        if (actor.getRole() == User.Role.ADMIN) {
            return;
        }
        if (role == User.Role.ADMIN || role == User.Role.MANAGER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MANAGER chi duoc cap tai khoan cho nhan vien van hanh");
        }
    }

    private void assertCanManageTargetStaff(User actor, User target) {
        if (actor.getRole() == User.Role.ADMIN) {
            return;
        }
        if (target.getRole() == User.Role.ADMIN || target.getRole() == User.Role.MANAGER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MANAGER khong duoc sua hoac xoa tai khoan quan tri");
        }
    }

    private User requireAnyStaff(String token) {
        User actor = requireUserFromToken(token);
        if (!isStaffRole(actor.getRole())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi nhan vien moi duoc truy cap");
        }
        return actor;
    }

    private User requireCustomerFromToken(String token) {
        User user = requireUserFromToken(token);
        if (user.getRole() != User.Role.CUSTOMER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi danh cho tai khoan khach hang");
        }
        return user;
    }

    private User requireUserFromToken(String token) {
        if (token == null || token.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Thieu token");
        }

        try {
            String userId = jwtUtil.getUserIdFromToken(token);
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nguoi dung"));
            if (Boolean.FALSE.equals(user.getIsActive())) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan da bi vo hieu hoa");
            }
            return user;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Token khong hop le");
        }
    }

    private User.MemberTier resolveTier(long totalSpent, int loyaltyPoints) {
        if (totalSpent >= 10_000_000L || loyaltyPoints >= 1000) return User.MemberTier.GOLD;
        if (totalSpent >= 3_000_000L || loyaltyPoints >= 300) return User.MemberTier.SILVER;
        return User.MemberTier.STANDARD;
    }

    private boolean isStaffRole(User.Role role) {
        return role != null && role != User.Role.CUSTOMER;
    }

    private String normalizeEmail(String email) {
        if (email == null) return null;
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizePhone(String phone) {
        if (phone == null) return null;
        String normalized = phone.replaceAll("\\s+", "").trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeBranchId(String branchId) {
        if (branchId == null) return null;
        String normalized = branchId.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeNullableText(String input) {
        if (input == null) return null;
        String normalized = input.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeCode(String code) {
        if (code == null) return null;
        String normalized = code.replaceAll("\\s+", "").trim().toUpperCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeRequiredPhone(String phone) {
        String normalized = normalizePhone(phone);
        if (normalized == null || normalized.length() < 9) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "So dien thoai khong hop le");
        }
        return normalized;
    }

    private String resolveOtpCustomerEmail(String phone, String email) {
        if (email != null && !email.isBlank()) {
            return normalizeEmail(email);
        }
        return phone + "@customer.local";
    }

    private String resolveEmployeeCode(String requestedCode, String currentUserId) {
        String normalized = normalizeCode(requestedCode);
        if (normalized != null) {
            User existing = userRepository.findByEmployeeCode(normalized).orElse(null);
            if (existing != null && (currentUserId == null || !existing.getId().equals(currentUserId))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Ma nhan vien da ton tai");
            }
            return normalized;
        }

        while (true) {
            String generated = "EMP" + ThreadLocalRandom.current().nextInt(100000, 999999);
            if (!userRepository.existsByEmployeeCode(generated)) {
                return generated;
            }
        }
    }

    private String resolvePersonalQrCode(String requestedCode, String employeeCode, String currentUserId) {
        String normalized = normalizeCode(requestedCode);
        if (normalized != null) {
            User existing = userRepository.findByPersonalQrCode(normalized).orElse(null);
            if (existing != null && (currentUserId == null || !existing.getId().equals(currentUserId))) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Ma QR ca nhan da ton tai");
            }
            return normalized;
        }

        String baseCode = "QR-" + (employeeCode == null ? UUID.randomUUID().toString().substring(0, 8) : employeeCode);
        String candidate = normalizeCode(baseCode);
        if (!userRepository.existsByPersonalQrCode(candidate)) {
            return candidate;
        }

        while (true) {
            String generated = candidate + "-" + ThreadLocalRandom.current().nextInt(100, 999);
            if (!userRepository.existsByPersonalQrCode(generated)) {
                return generated;
            }
        }
    }

    private LocalDate resolveWeekStart(String weekStartRaw) {
        LocalDate baseDate = parseDateOrDefault(weekStartRaw, LocalDate.now());
        return baseDate.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    private LocalDate parseDateOrDefault(String value, LocalDate fallback) {
        if (value == null || value.isBlank()) return fallback;
        try {
            return LocalDate.parse(value.trim());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ngay khong hop le: " + value);
        }
    }

    private boolean containsIgnoreCase(String source, String keyword) {
        if (source == null || keyword == null || keyword.isBlank()) return false;
        return source.toLowerCase(Locale.ROOT).contains(keyword.toLowerCase(Locale.ROOT));
    }

    private void verifyAndConsumeOtp(String phone, String otp) {
        OtpEntry entry = otpStore.get(phone);
        if (entry == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP khong ton tai hoac da het han");
        }
        if (System.currentTimeMillis() > entry.expiresAtMillis) {
            otpStore.remove(phone);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP da het han");
        }
        if (!entry.otp.equals(otp)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP khong dung");
        }
        otpStore.remove(phone);
    }

    private record OtpEntry(String otp, long expiresAtMillis) {}
}
