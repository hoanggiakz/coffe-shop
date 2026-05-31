package com.coffeeshop.userservice.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.coffeeshop.userservice.config.JwtUtil;
import com.coffeeshop.userservice.dto.AttendanceCheckRequest;
import com.coffeeshop.userservice.dto.AttendanceResponse;
import com.coffeeshop.userservice.dto.AuthResponse;
import com.coffeeshop.userservice.dto.BranchCreateRequest;
import com.coffeeshop.userservice.dto.BranchResponse;
import com.coffeeshop.userservice.dto.BranchUpdateRequest;
import com.coffeeshop.userservice.dto.CustomerEmailLoginRequest;
import com.coffeeshop.userservice.dto.CustomerEmailRegisterRequest;
import com.coffeeshop.userservice.dto.CustomerAuthResponse;
import com.coffeeshop.userservice.dto.CustomerOffersResponse;
import com.coffeeshop.userservice.dto.CustomerOtpLoginRequest;
import com.coffeeshop.userservice.dto.CustomerOtpRegisterRequest;
import com.coffeeshop.userservice.dto.CustomerProfileResponse;
import com.coffeeshop.userservice.dto.ForgotPasswordRequest;
import com.coffeeshop.userservice.dto.LoginRequest;
import com.coffeeshop.userservice.dto.LoyaltyRedeemRequest;
import com.coffeeshop.userservice.dto.LoyaltyRedeemResponse;
import com.coffeeshop.userservice.dto.LoyaltyTransactionItemResponse;
import com.coffeeshop.userservice.dto.LoyaltyTransactionListResponse;
import com.coffeeshop.userservice.dto.OtpRequest;
import com.coffeeshop.userservice.dto.OtpResponse;
import com.coffeeshop.userservice.dto.OtpVerifyRequest;
import com.coffeeshop.userservice.dto.PayrollItemResponse;
import com.coffeeshop.userservice.dto.PayrollSummaryResponse;
import com.coffeeshop.userservice.dto.PointsAccrualRequest;
import com.coffeeshop.userservice.dto.PointsAccrualResponse;
import com.coffeeshop.userservice.dto.RefreshTokenRequest;
import com.coffeeshop.userservice.dto.RefreshTokenResponse;
import com.coffeeshop.userservice.dto.RegisterRequest;
import com.coffeeshop.userservice.dto.ResetPasswordRequest;
import com.coffeeshop.userservice.dto.ShiftCoworkerResponse;
import com.coffeeshop.userservice.dto.ShiftOverviewResponse;
import com.coffeeshop.userservice.dto.StaffCreateRequest;
import com.coffeeshop.userservice.dto.StaffResponse;
import com.coffeeshop.userservice.dto.StaffShiftRequest;
import com.coffeeshop.userservice.dto.StaffShiftResponse;
import com.coffeeshop.userservice.dto.StaffUpdateRequest;
import com.coffeeshop.userservice.dto.UpdateProfileRequest;
import com.coffeeshop.userservice.dto.UserProfile;
import com.coffeeshop.userservice.dto.WeekScheduleResponse;
import com.coffeeshop.userservice.dto.ChangePasswordRequest;
import com.coffeeshop.userservice.entity.AttendanceRecord;
import com.coffeeshop.userservice.entity.Branch;
import com.coffeeshop.userservice.entity.CustomerPasswordResetToken;
import com.coffeeshop.userservice.entity.LoyaltyTransaction;
import com.coffeeshop.userservice.entity.ShiftType;
import com.coffeeshop.userservice.entity.StaffShift;
import com.coffeeshop.userservice.entity.User;
import com.coffeeshop.userservice.repository.AttendanceRecordRepository;
import com.coffeeshop.userservice.repository.BranchRepository;
import com.coffeeshop.userservice.repository.CustomerPasswordResetTokenRepository;
import com.coffeeshop.userservice.repository.LoyaltyTransactionRepository;
import com.coffeeshop.userservice.repository.StaffShiftRepository;
import com.coffeeshop.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.Base64;
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
import org.springframework.data.domain.PageRequest;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final long OTP_EXPIRES_SECONDS = 300L;
    private static final int OTP_MAX_ATTEMPTS = 5;
    private static final int OTP_MAX_REQUESTS_PER_HOUR = 5;
    private static final long OTP_RATE_LIMIT_WINDOW_MILLIS = 60L * 60L * 1000L;
    private static final long ACCESS_TOKEN_EXPIRES_SECONDS = 900L;
    private static final long REFRESH_TOKEN_EXPIRES_MILLIS = 7L * 24L * 60L * 60L * 1000L;
    private static final long RESET_TOKEN_EXPIRES_MILLIS = 15L * 60L * 1000L;
    private static final Set<User.Role> MANAGER_ROLES = Set.of(User.Role.ADMIN, User.Role.MANAGER);
    private static final Set<User.Role> BRANCH_MANAGER_ROLES = Set.of(User.Role.ADMIN, User.Role.MANAGER);
    private static final List<User.Role> STAFF_ROLES = List.of(
            User.Role.ADMIN, User.Role.MANAGER, User.Role.WAITER, User.Role.BARISTA, User.Role.STAFF
    );
    private static final Map<User.Role, Long> DEFAULT_HOURLY_RATES = Map.of(
            User.Role.ADMIN, 120_000L,
            User.Role.MANAGER, 80_000L,
            User.Role.BARISTA, 45_000L,
            User.Role.WAITER, 40_000L,
            User.Role.STAFF, 38_000L
    );

    private final UserRepository userRepository;
    private final BranchRepository branchRepository;
    private final CustomerPasswordResetTokenRepository customerPasswordResetTokenRepository;
    private final StaffShiftRepository staffShiftRepository;
    private final AttendanceRecordRepository attendanceRecordRepository;
    private final LoyaltyTransactionRepository loyaltyTransactionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.table-service-url:http://table-service:3003}")
    private String tableServiceUrl;

    @Value("${app.order-service-url:http://order-service:3001}")
    private String orderServiceUrl;

    @Value("${app.inventory-service-url:http://inventory-service:3005}")
    private String inventoryServiceUrl;

    @Value("${app.internal-service-token:dev-internal-token}")
    private String internalServiceToken;
    @Value("${app.google-oauth-client-id:}")
    private String googleOauthClientId;
    @Value("${app.google-oauth-client-secret:}")
    private String googleOauthClientSecret;
    @Value("${app.google-oauth-callback-url:https://app.httpscoffee-demo.buzz/api/auth/google/callback}")
    private String googleOauthCallbackUrl;
    private final Map<String, OtpEntry> otpStore = new ConcurrentHashMap<>();
    private final Map<String, List<Long>> otpRequestRateStore = new ConcurrentHashMap<>();
    private final Map<String, RefreshEntry> refreshTokenStore = new ConcurrentHashMap<>();
    private final Map<String, GoogleOauthStateEntry> googleOauthStateStore = new ConcurrentHashMap<>();

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

        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name(), user.getBranchId());
        return new AuthResponse(token, UserProfile.from(user));
    }

    public UserProfile getProfile(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nguoi dung"));
        return UserProfile.from(user);
    }

    public UserProfile updateProfile(String userId, UpdateProfileRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nguoi dung"));

        if (req.getName() != null) {
            String name = req.getName().trim();
            if (name.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ten khong duoc de trong");
            }
            user.setName(name);
        }

        if (req.getPhone() != null) {
            String normalizedPhone = normalizePhone(req.getPhone());
            String currentPhone = user.getPhone() == null ? "" : user.getPhone().trim();
            if (normalizedPhone != null && !normalizedPhone.equals(currentPhone) && userRepository.existsByPhone(normalizedPhone)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "PHONE_EXISTS");
            }
            user.setPhone(normalizedPhone);
        }

        if (req.getEmail() != null) {
            String normalizedEmail = normalizeEmail(req.getEmail());
            if (normalizedEmail == null || normalizedEmail.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Email khong hop le");
            }
            String currentEmail = user.getEmail() == null ? "" : user.getEmail().trim();
            if (!normalizedEmail.equalsIgnoreCase(currentEmail) && userRepository.existsByEmail(normalizedEmail)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_EXISTS");
            }
            user.setEmail(normalizedEmail);
        }

        if (req.getAvatarUrl() != null) {
            String avatarUrl = req.getAvatarUrl().trim();
            user.setAvatarUrl(avatarUrl.isBlank() ? null : avatarUrl);
        }

        if (req.getDateOfBirth() != null) {
            String rawDob = String.valueOf(req.getDateOfBirth()).trim();
            if (rawDob.isBlank()) {
                user.setDateOfBirth(null);
            } else {
                try {
                    user.setDateOfBirth(LocalDate.parse(rawDob));
                } catch (Exception ex) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ngay sinh khong hop le (yyyy-MM-dd)");
                }
            }
        }

        return UserProfile.from(userRepository.save(user));
    }

    public void changePassword(String userId, ChangePasswordRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nguoi dung"));
        if (!passwordEncoder.matches(req.getCurrentPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mat khau hien tai khong dung");
        }
        if (passwordEncoder.matches(req.getNewPassword(), user.getPassword())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mat khau moi phai khac mat khau cu");
        }
        user.setPassword(passwordEncoder.encode(req.getNewPassword()));
        userRepository.save(user);
    }

    public UserProfile uploadProfileAvatar(String userId, MultipartFile file) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nguoi dung"));
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thieu file anh");
        }
        String contentType = String.valueOf(file.getContentType());
        if (!contentType.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chi chap nhan file anh");
        }
        if (file.getSize() > 5L * 1024L * 1024L) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Anh toi da 5MB");
        }
        try {
            String base64 = Base64.getEncoder().encodeToString(file.getBytes());
            user.setAvatarUrl("data:" + contentType + ";base64," + base64);
            userRepository.save(user);
            return UserProfile.from(user);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong doc duoc file anh");
        }
    }

    public OtpResponse requestCustomerOtp(OtpRequest req) {
        String phone = normalizeRequiredPhone(req.getPhone());
        String purpose = normalizeOtpPurpose(req.getPurpose());
        enforceOtpRateLimit(phone);
        String otp = String.format("%06d", ThreadLocalRandom.current().nextInt(0, 1_000_000));
        long expiresAt = System.currentTimeMillis() + (OTP_EXPIRES_SECONDS * 1000);
        otpStore.put(buildOtpStoreKey(phone, purpose), new OtpEntry(passwordEncoder.encode(otp), expiresAt, 0));
        String maskedPhone = phone.length() >= 7
                ? phone.substring(0, 3) + "****" + phone.substring(phone.length() - 3)
                : phone;
        return new OtpResponse("OTP da duoc gui", maskedPhone, OTP_EXPIRES_SECONDS);
    }

    public CustomerAuthResponse verifyCustomerOtp(OtpVerifyRequest req) {
        String phone = normalizeRequiredPhone(req.getPhone());
        String purpose = normalizeOtpPurpose(req.getPurpose());
        verifyAndConsumeOtp(phone, purpose, req.getOtp());
        User user = userRepository.findByPhoneAndRole(phone, User.Role.CUSTOMER).orElse(null);
        boolean isNewUser = false;
        if (user == null) {
            String email = resolveOtpCustomerEmail(phone, req.getEmail());
            if (userRepository.existsByEmail(email)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Email da ton tai");
            }
            user = User.builder()
                    .email(email)
                    .password(passwordEncoder.encode("otp-" + UUID.randomUUID()))
                    .name(normalizeNullableText(req.getName()) != null ? req.getName().trim() : "Khach hang")
                    .phone(phone)
                    .role(User.Role.CUSTOMER)
                    .memberTier(User.MemberTier.BRONZE)
                    .loyaltyPoints(0)
                    .totalSpent(0L)
                    .isActive(true)
                    .build();
            user = userRepository.save(user);
            isNewUser = true;
        }
        String accessToken = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name(), user.getBranchId());
        String refreshToken = issueRefreshToken(user.getId());
        return new CustomerAuthResponse(accessToken, refreshToken, ACCESS_TOKEN_EXPIRES_SECONDS, UserProfile.from(user), isNewUser);
    }

    public AuthResponse registerCustomerByEmail(CustomerEmailRegisterRequest req) {
        String email = normalizeEmail(req.getEmail());
        validateStrongPassword(req.getPassword());
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
                .memberTier(User.MemberTier.BRONZE)
                .loyaltyPoints(0)
                .totalSpent(0L)
                .isActive(true)
                .build();

        user = userRepository.save(user);
        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name(), user.getBranchId());
        return new AuthResponse(token, issueRefreshToken(user.getId()), ACCESS_TOKEN_EXPIRES_SECONDS, UserProfile.from(user));
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
        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name(), user.getBranchId());
        return new AuthResponse(token, issueRefreshToken(user.getId()), ACCESS_TOKEN_EXPIRES_SECONDS, UserProfile.from(user));
    }

    public AuthResponse registerCustomerByOtp(CustomerOtpRegisterRequest req) {
        String phone = normalizeRequiredPhone(req.getPhone());
        verifyAndConsumeOtp(phone, "REGISTER", req.getOtp());
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
                .memberTier(User.MemberTier.BRONZE)
                .loyaltyPoints(0)
                .totalSpent(0L)
                .isActive(true)
                .build();

        user = userRepository.save(user);
        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name(), user.getBranchId());
        return new AuthResponse(token, issueRefreshToken(user.getId()), ACCESS_TOKEN_EXPIRES_SECONDS, UserProfile.from(user));
    }

    public AuthResponse loginCustomerByOtp(CustomerOtpLoginRequest req) {
        String phone = normalizeRequiredPhone(req.getPhone());
        verifyAndConsumeOtp(phone, "LOGIN", req.getOtp());
        User user = userRepository.findByPhoneAndRole(phone, User.Role.CUSTOMER)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Khong tim thay tai khoan khach hang"));
        if (Boolean.FALSE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan da bi vo hieu hoa");
        }
        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name(), user.getBranchId());
        return new AuthResponse(token, issueRefreshToken(user.getId()), ACCESS_TOKEN_EXPIRES_SECONDS, UserProfile.from(user));
    }

    public UserProfile getCustomerProfile(String token) {
        User user = requireCustomerFromToken(token);
        return UserProfile.from(user);
    }

    public CustomerProfileResponse getCustomerProfileV2(String token) {
        User user = requireCustomerFromToken(token);
        return CustomerProfileResponse.from(user);
    }

    public CustomerProfileResponse updateCustomerProfileV2(String token, UpdateProfileRequest req) {
        User customer = requireCustomerFromToken(token);
        String nextEmail = normalizeEmail(req.getEmail());
        String nextPhone = normalizePhone(req.getPhone());
        String currentEmail = customer.getEmail() == null ? "" : customer.getEmail().trim();
        String currentPhone = customer.getPhone() == null ? "" : customer.getPhone().trim();
        boolean emailChanged = nextEmail != null && !nextEmail.equalsIgnoreCase(currentEmail);
        boolean phoneChanged = nextPhone != null && !nextPhone.equals(currentPhone);

        if (emailChanged || phoneChanged) {
            String rawOtp = String.valueOf(req.getVerifyOtp() == null ? "" : req.getVerifyOtp()).trim();
            if (rawOtp.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP_REQUIRED_FOR_CONTACT_CHANGE");
            }
            String purpose = normalizeOtpPurpose(req.getVerifyPurpose());
            if (!"PROFILE_UPDATE".equals(purpose)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP_PURPOSE_INVALID_FOR_PROFILE_UPDATE");
            }
            String targetPhoneForOtp = phoneChanged ? nextPhone : normalizePhone(customer.getPhone());
            if (targetPhoneForOtp == null || targetPhoneForOtp.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PHONE_REQUIRED_FOR_CONTACT_CHANGE_VERIFICATION");
            }
            verifyAndConsumeOtp(targetPhoneForOtp, purpose, rawOtp);
        }

        UserProfile updated = updateProfile(customer.getId(), req);
        User reloaded = userRepository.findById(updated.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nguoi dung"));
        return CustomerProfileResponse.from(reloaded);
    }

    public void changeCustomerPassword(String token, ChangePasswordRequest req) {
        User customer = requireCustomerFromToken(token);
        changePassword(customer.getId(), req);
    }

    public CustomerOffersResponse getCustomerOffers(String token) {
        User user = requireCustomerFromToken(token);
        List<String> offers = new ArrayList<>();
        offers.add("Tich 1 diem cho moi 10.000d chi tieu");
        if (user.getMemberTier() == User.MemberTier.PLATINUM) {
            offers.add("Uu dai PLATINUM: giam 15% toi da 150.000d");
            offers.add("Uu tien phuc vu VIP va uu dai sinh nhat dac biet");
        } else if (user.getMemberTier() == User.MemberTier.GOLD) {
            offers.add("Uu dai GOLD: giam 10% toi da 80.000d");
            offers.add("Uu tien phuc vu va uu dai sinh nhat");
        } else if (user.getMemberTier() == User.MemberTier.SILVER) {
            offers.add("Uu dai SILVER: giam 5% toi da 30.000d");
        } else {
            offers.add("Nang cap SILVER khi tong chi tieu dat 3.000.000d");
        }
        if (user.getLoyaltyPoints() >= 50) {
            offers.add("Co the doi 50 diem lay voucher 20.000d");
        }
        if (user.getLoyaltyPoints() >= 120) {
            offers.add("Co the doi 120 diem lay combo free drink");
        }
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
        loyaltyTransactionRepository.save(LoyaltyTransaction.builder()
                .customerId(user.getId())
                .orderId(req.getOrderId())
                .type(LoyaltyTransaction.Type.EARN)
                .points(pointsEarned)
                .balanceAfter(user.getLoyaltyPoints())
                .description("Cong diem tu don " + req.getOrderId())
                .build());
        return new PointsAccrualResponse(user.getId(), req.getOrderId(), pointsEarned, user.getLoyaltyPoints(), user.getMemberTier().name());
    }

    public RefreshTokenResponse refreshCustomerToken(RefreshTokenRequest req) {
        String token = String.valueOf(req.getRefreshToken() == null ? "" : req.getRefreshToken()).trim();
        RefreshEntry entry = refreshTokenStore.get(token);
        if (entry == null || System.currentTimeMillis() > entry.expiresAtMillis()) {
            refreshTokenStore.remove(token);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Refresh token khong hop le hoac het han");
        }
        User user = userRepository.findById(entry.userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Nguoi dung khong ton tai"));
        if (user.getRole() != User.Role.CUSTOMER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi danh cho tai khoan khach hang");
        }
        refreshTokenStore.remove(token);
        String newRefreshToken = issueRefreshToken(user.getId());
        String accessToken = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name(), user.getBranchId());
        return new RefreshTokenResponse(accessToken, newRefreshToken, ACCESS_TOKEN_EXPIRES_SECONDS);
    }

    public Map<String, Object> forgotPassword(ForgotPasswordRequest req) {
        String email = normalizeEmail(req.getEmail());
        User user = userRepository.findByEmailAndRole(email, User.Role.CUSTOMER).orElse(null);
        if (user != null) {
            String token = UUID.randomUUID().toString();
            LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(15);
            customerPasswordResetTokenRepository.deleteByExpiresAtBefore(LocalDateTime.now());
            customerPasswordResetTokenRepository.save(CustomerPasswordResetToken.builder()
                    .userId(user.getId())
                    .token(token)
                    .expiresAt(expiresAt)
                    .usedAt(null)
                    .build());
        }
        return Map.of(
                "message", "Link dat lai mat khau da gui ve email cua ban (het han sau 15 phut)",
                "expiresIn", 900
        );
    }

    public Map<String, Object> resetPassword(ResetPasswordRequest req) {
        String token = String.valueOf(req.getToken() == null ? "" : req.getToken()).trim();
        CustomerPasswordResetToken entry = customerPasswordResetTokenRepository.findByToken(token).orElse(null);
        if (entry == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Token dat lai mat khau khong hop le hoac het han");
        }
        if (entry.getUsedAt() != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Token dat lai mat khau da duoc su dung");
        }
        if (entry.getExpiresAt() == null || LocalDateTime.now().isAfter(entry.getExpiresAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Token dat lai mat khau khong hop le hoac het han");
        }
        User user = userRepository.findById(entry.getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay nguoi dung"));
        validateStrongPassword(req.getNewPassword());
        user.setPassword(passwordEncoder.encode(req.getNewPassword()));
        userRepository.save(user);
        entry.setUsedAt(LocalDateTime.now());
        customerPasswordResetTokenRepository.save(entry);
        return Map.of("success", true, "message", "Mat khau da duoc cap nhat");
    }

    public Map<String, Object> getCustomerOrders(String token, Integer page, Integer limit, String status, String branchId) {
        User user = requireCustomerFromToken(token);
        int safePage = page == null || page < 1 ? 1 : page;
        int safeLimit = limit == null || limit < 1 ? 20 : Math.min(limit, 100);
        StringBuilder url = new StringBuilder(orderServiceUrl + "/api/orders/history?customerId=" + encode(user.getId()) + "&limit=" + safeLimit);
        JsonNode ordersNode = callExternalJson(url.toString());
        List<Map<String, Object>> all = new ArrayList<>();
        if (ordersNode.isArray()) {
            for (JsonNode node : ordersNode) {
                String nodeStatus = String.valueOf(node.path("status").asText(""));
                String nodeBranchId = String.valueOf(node.path("branchId").asText(""));
                if (status != null && !status.isBlank() && !status.equalsIgnoreCase("ALL") && !nodeStatus.equalsIgnoreCase(status)) {
                    continue;
                }
                if (branchId != null && !branchId.isBlank() && !Objects.equals(branchId.trim(), nodeBranchId)) {
                    continue;
                }
                all.add(objectMapper.convertValue(node, Map.class));
            }
        }
        int fromIndex = Math.min((safePage - 1) * safeLimit, all.size());
        int toIndex = Math.min(fromIndex + safeLimit, all.size());
        List<Map<String, Object>> pageData = all.subList(fromIndex, toIndex);
        return Map.of(
                "data", pageData,
                "meta", Map.of(
                        "total", all.size(),
                        "page", safePage,
                        "limit", safeLimit,
                        "totalPages", Math.max(1, (int) Math.ceil(all.size() / (double) safeLimit))
                )
        );
    }

    public LoyaltyTransactionListResponse getLoyaltyTransactions(String token, Integer page, Integer limit) {
        User user = requireCustomerFromToken(token);
        int safePage = page == null || page < 1 ? 1 : page;
        int safeLimit = limit == null || limit < 1 ? 20 : Math.min(limit, 100);
        var resultPage = loyaltyTransactionRepository.findByCustomerIdOrderByCreatedAtDesc(
                user.getId(),
                PageRequest.of(safePage - 1, safeLimit)
        );
        List<LoyaltyTransactionItemResponse> data = resultPage.getContent().stream()
                .map(LoyaltyTransactionItemResponse::from)
                .toList();
        return new LoyaltyTransactionListResponse(
                user.getLoyaltyPoints() == null ? 0 : user.getLoyaltyPoints(),
                data,
                Map.of(
                        "total", resultPage.getTotalElements(),
                        "page", safePage,
                        "limit", safeLimit,
                        "totalPages", resultPage.getTotalPages()
                )
        );
    }

    public LoyaltyRedeemResponse redeemLoyaltyPoints(String token, LoyaltyRedeemRequest req) {
        User user = requireCustomerFromToken(token);
        int points = req.getPointsToRedeem() == null ? 0 : req.getPointsToRedeem();
        if (points <= 0 || points % 100 != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "pointsToRedeem phai la boi so cua 100");
        }
        int currentPoints = user.getLoyaltyPoints() == null ? 0 : user.getLoyaltyPoints();
        if (points > currentPoints) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong du diem de doi");
        }
        int remaining = currentPoints - points;
        user.setLoyaltyPoints(remaining);
        userRepository.save(user);
        loyaltyTransactionRepository.save(LoyaltyTransaction.builder()
                .customerId(user.getId())
                .orderId(req.getOrderId())
                .type(LoyaltyTransaction.Type.REDEEM)
                .points(-points)
                .balanceAfter(remaining)
                .description("Doi diem cho don " + req.getOrderId())
                .build());
        long discountAmount = points * 100L;
        return new LoyaltyRedeemResponse(true, discountAmount, points, remaining, "Da ap dung giam gia tu loyalty points");
    }

    public Map<String, Object> startGoogleOauth(String redirectUri) {
        ensureGoogleOauthConfigured();
        String state = UUID.randomUUID().toString();
        String callback = normalizeNullableText(redirectUri);
        googleOauthStateStore.put(state, new GoogleOauthStateEntry(callback, System.currentTimeMillis() + (10L * 60L * 1000L)));
        String authUrl = "https://accounts.google.com/o/oauth2/v2/auth"
                + "?client_id=" + encode(googleOauthClientId)
                + "&redirect_uri=" + encode(googleOauthCallbackUrl)
                + "&response_type=code"
                + "&scope=" + encode("openid email profile")
                + "&access_type=offline"
                + "&prompt=consent"
                + "&state=" + encode(state);
        return Map.of(
                "authUrl", authUrl,
                "state", state,
                "callbackUrl", googleOauthCallbackUrl
        );
    }

    public CustomerAuthResponse handleGoogleOauthCallback(String code, String state) {
        ensureGoogleOauthConfigured();
        String normalizedCode = String.valueOf(code == null ? "" : code).trim();
        String normalizedState = String.valueOf(state == null ? "" : state).trim();
        if (normalizedCode.isBlank() || normalizedState.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thieu code hoac state");
        }
        GoogleOauthStateEntry stateEntry = googleOauthStateStore.get(normalizedState);
        if (stateEntry == null || System.currentTimeMillis() > stateEntry.expiresAtMillis()) {
            googleOauthStateStore.remove(normalizedState);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "State khong hop le hoac het han");
        }
        googleOauthStateStore.remove(normalizedState);

        JsonNode tokenPayload = exchangeGoogleCodeForToken(normalizedCode);
        String accessToken = String.valueOf(tokenPayload.path("access_token").asText("")).trim();
        if (accessToken.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Khong lay duoc access token tu Google");
        }

        JsonNode userInfo = fetchGoogleUserInfo(accessToken);
        String email = normalizeEmail(userInfo.path("email").asText(""));
        String googleId = normalizeNullableText(userInfo.path("sub").asText(""));
        if (email == null || email.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Google khong tra ve email hop le");
        }
        if (googleId == null || googleId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Google khong tra ve sub hop le");
        }

        User existingAny = userRepository.findByEmail(email).orElse(null);
        if (existingAny == null) {
            existingAny = userRepository.findByGoogleId(googleId).orElse(null);
        }
        if (existingAny != null && existingAny.getRole() != User.Role.CUSTOMER) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email da duoc su dung boi tai khoan nhan vien");
        }

        boolean isNewUser = false;
        User user = existingAny;
        if (user == null) {
            user = User.builder()
                    .email(email)
                    .password(passwordEncoder.encode("google-" + UUID.randomUUID()))
                    .name(normalizeNullableText(userInfo.path("name").asText("")) != null ? userInfo.path("name").asText("").trim() : "Khach hang")
                    .phone(null)
                    .role(User.Role.CUSTOMER)
                    .memberTier(User.MemberTier.BRONZE)
                    .loyaltyPoints(0)
                    .totalSpent(0L)
                    .googleId(googleId)
                    .isActive(true)
                    .avatarUrl(normalizeNullableText(userInfo.path("picture").asText("")))
                    .build();
            user = userRepository.save(user);
            isNewUser = true;
        } else {
            boolean changed = false;
            String picture = normalizeNullableText(userInfo.path("picture").asText(""));
            String name = normalizeNullableText(userInfo.path("name").asText(""));
            if ((user.getAvatarUrl() == null || user.getAvatarUrl().isBlank()) && picture != null) {
                user.setAvatarUrl(picture);
                changed = true;
            }
            if ((user.getName() == null || user.getName().isBlank()) && name != null) {
                user.setName(name);
                changed = true;
            }
            if ((user.getGoogleId() == null || user.getGoogleId().isBlank()) && googleId != null) {
                user.setGoogleId(googleId);
                changed = true;
            }
            if (changed) {
                user = userRepository.save(user);
            }
        }

        String appAccessToken = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name(), user.getBranchId());
        String appRefreshToken = issueRefreshToken(user.getId());
        return new CustomerAuthResponse(appAccessToken, appRefreshToken, ACCESS_TOKEN_EXPIRES_SECONDS, UserProfile.from(user), isNewUser);
    }

    // M-24/M-25: Quan ly chi nhanh
    public List<BranchResponse> listBranches(String token, Boolean includeInactive) {
        requireAdmin(token);
        boolean showInactive = Boolean.TRUE.equals(includeInactive);
        List<Branch> branches = showInactive
                ? branchRepository.findAllByOrderByCreatedAtDesc()
                : branchRepository.findByIsActiveOrderByCreatedAtDesc(true);
        return branches.stream().map(this::toBranchResponse).collect(Collectors.toList());
    }

    public BranchResponse getBranch(String token, String branchId) {
        User actor = requireManagerOrAdmin(token);
        Branch branch = requireBranchById(branchId);
        assertCanAccessBranch(actor, branch.getId());
        return toBranchResponse(branch);
    }

    public BranchResponse createBranch(String token, BranchCreateRequest req) {
        requireAdmin(token);
        String name = String.valueOf(req.getName() == null ? "" : req.getName()).trim();
        String code = normalizeBranchCode(req.getCode());
        if (name.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ten chi nhanh khong duoc de trong");
        }
        if (code == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ma chi nhanh khong hop le");
        }

        if (branchRepository.existsByNameIgnoreCase(name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ten chi nhanh da ton tai");
        }
        if (branchRepository.existsByCodeIgnoreCase(code)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ma chi nhanh da ton tai");
        }

        String managerId = normalizeBranchId(req.getManagerId());
        User manager = validateBranchManager(managerId);

        Branch branch = Branch.builder()
                .name(name)
                .code(code)
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
        if (req.getCode() != null) {
            String code = normalizeBranchCode(req.getCode());
            if (code == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ma chi nhanh khong hop le");
            }
            if (!code.equalsIgnoreCase(branch.getCode()) && branchRepository.existsByCodeIgnoreCase(code)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Ma chi nhanh da ton tai");
            }
            branch.setCode(code);
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
        ensureBranchHasNoCrossServiceData(branch.getId());
        long activeStaffCount = userRepository.countByBranchIdAndRoleIn(branch.getId(), STAFF_ROLES);
        if (activeStaffCount > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong the xoa chi nhanh khi con nhan su duoc gan");
        }
        branchRepository.delete(branch);
        return toBranchResponse(branch);
    }

    private void ensureBranchHasNoCrossServiceData(String branchId) {
        int tableCount = fetchArrayCount(
                tableServiceUrl + "/api/tables?branchId=" + URLEncoder.encode(branchId, StandardCharsets.UTF_8),
                false
        );
        if (tableCount > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong the xoa chi nhanh khi con du lieu ban");
        }

        int orderCount = fetchArrayCount(
                orderServiceUrl + "/api/orders?branchId=" + URLEncoder.encode(branchId, StandardCharsets.UTF_8),
                false
        );
        if (orderCount > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong the xoa chi nhanh khi con don hang");
        }

        int inventoryCount = fetchArrayCount(
                inventoryServiceUrl + "/api/v1/ingredients?branchId=" + URLEncoder.encode(branchId, StandardCharsets.UTF_8),
                true
        );
        if (inventoryCount > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Khong the xoa chi nhanh khi con ton kho/nguyen lieu");
        }
    }

    private int fetchArrayCount(String url, boolean useInternalToken) {
        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Accept", "application/json")
                .GET();

        if (useInternalToken) {
            String token = String.valueOf(internalServiceToken == null ? "" : internalServiceToken).trim();
            if (token.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Thieu internal token de kiem tra du lieu lien service");
            }
            builder.header("Authorization", "Bearer " + token);
        }

        try {
            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Kiem tra du lieu lien service that bai");
            }
            JsonNode node = objectMapper.readTree(response.body());
            if (!node.isArray()) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Du lieu lien service tra ve khong dung dinh dang");
            }
            return node.size();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Khong ket noi duoc service de kiem tra du lieu");
        }
    }

    public List<StaffResponse> listBranchStaff(String token, String branchId, Boolean includeInactive) {
        User actor = requireManagerOrAdmin(token);
        Branch branch = requireBranchById(branchId);
        assertCanAccessBranch(actor, branch.getId());
        return listStaff(token, null, null, branch.getId(), includeInactive);
    }

    public StaffResponse createBranchStaff(String token, String branchId, StaffCreateRequest request) {
        User actor = requireManagerOrAdmin(token);
        Branch branch = requireBranchById(branchId);
        assertCanAccessBranch(actor, branch.getId());
        StaffCreateRequest effectiveRequest = new StaffCreateRequest();
        effectiveRequest.setName(request.getName());
        effectiveRequest.setEmail(request.getEmail());
        effectiveRequest.setPassword(request.getPassword());
        effectiveRequest.setPhone(request.getPhone());
        effectiveRequest.setRole(request.getRole());
        effectiveRequest.setEmployeeCode(request.getEmployeeCode());
        effectiveRequest.setPersonalQrCode(request.getPersonalQrCode());
        effectiveRequest.setPreferredShift(request.getPreferredShift());
        effectiveRequest.setBranchId(branch.getId());
        return createStaff(actor, effectiveRequest);
    }

    public String getBranchSalesReport(String token, String branchId, String dateFrom, String dateTo) {
        User actor = requireManagerOrAdmin(token);
        Branch branch = requireBranchById(branchId);
        assertCanAccessBranch(actor, branch.getId());

        String reportServiceUrl = String.valueOf(System.getenv("REPORT_SERVICE_URL"));
        if (reportServiceUrl == null || reportServiceUrl.isBlank() || "null".equalsIgnoreCase(reportServiceUrl)) {
            reportServiceUrl = "http://report-service:3006";
        }

        StringBuilder url = new StringBuilder(reportServiceUrl)
                .append("/api/reports/revenue-summary?branchId=")
                .append(URLEncoder.encode(branch.getId(), StandardCharsets.UTF_8));
        String normalizedFrom = normalizeNullableText(dateFrom);
        String normalizedTo = normalizeNullableText(dateTo);
        if (normalizedFrom != null) {
            url.append("&dateFrom=").append(URLEncoder.encode(normalizedFrom, StandardCharsets.UTF_8));
        }
        if (normalizedTo != null) {
            url.append("&dateTo=").append(URLEncoder.encode(normalizedTo, StandardCharsets.UTF_8));
        }

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(url.toString()))
                .header("Accept", "application/json")
                .GET()
                .build();
        try {
            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Khong lay duoc bao cao doanh thu chi nhanh");
            }
            return response.body();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Khong ket noi duoc report-service");
        }
    }

    // M-01: Them / sua / xoa nhan vien
    public List<StaffResponse> listStaff(String token, String keyword, User.Role role, String branchId, Boolean includeInactive) {
        User actor = requireAnyStaff(token);
        boolean canViewSensitiveData = MANAGER_ROLES.contains(actor.getRole());

        String normalizedKeyword = String.valueOf(keyword == null ? "" : keyword).trim().toLowerCase(Locale.ROOT);
        String normalizedBranchId = normalizeBranchId(branchId);
        if (actor.getRole() != User.Role.ADMIN) {
            String actorBranchId = normalizeBranchId(actor.getBranchId());
            if (actorBranchId == null) {
                normalizedBranchId = "__none__";
            } else if (normalizedBranchId == null || !Objects.equals(normalizedBranchId, actorBranchId)) {
                normalizedBranchId = actorBranchId;
            }
        }
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
                    if (normalizedKeyword.isEmpty()) {
                        return true;
                    }
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
        if (actor.getRole() == User.Role.MANAGER) {
            if (actor.getBranchId() == null || actor.getBranchId().isBlank()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MANAGER chua duoc gan chi nhanh");
            }
            if (normalizedBranchId == null) {
                normalizedBranchId = actor.getBranchId();
            }
            if (!Objects.equals(actor.getBranchId(), normalizedBranchId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MANAGER chi duoc them nhan vien trong chi nhanh cua minh");
            }
        }
        String employeeCode = resolveEmployeeCode(req.getEmployeeCode(), null);
        // Always auto-generate personal QR code when creating a new staff account.
        String personalQrCode = resolvePersonalQrCode(null, employeeCode, null);

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
                .memberTier(User.MemberTier.BRONZE)
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
            if (actor.getRole() == User.Role.MANAGER && req.getRole() != user.getRole()) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MANAGER khong duoc thay doi role");
            }
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
            if (actor.getRole() == User.Role.MANAGER) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MANAGER khong duoc chuyen chi nhanh nhan vien");
            }
            user.setBranchId(resolveBranchAssignment(req.getBranchId()));
        }
        if (req.getEmployeeCode() != null) {
            if (actor.getRole() == User.Role.MANAGER) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MANAGER khong duoc doi ma nhan vien");
            }
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

        AttendanceRecord openRecord = attendanceRecordRepository
                .findFirstByStaffIdAndWorkDateAndCheckOutAtIsNullOrderByCheckInAtDesc(staff.getId(), today)
                .orElse(null);
        if (openRecord != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhan vien dang trong ca va chua ra ca");
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

        AttendanceRecord record = attendanceRecordRepository
                .findFirstByStaffIdAndWorkDateAndCheckOutAtIsNullOrderByCheckInAtDesc(staff.getId(), today)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nhan vien chua vao ca hoac da ra ca"));

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

    public ShiftOverviewResponse getShiftOverview(String token, String dateRaw, String staffId, String shiftTypeRaw) {
        User actor = requireAnyStaff(token);
        User target = resolveVisibleTargetStaff(actor, staffId);
        LocalDate date = parseDateOrDefault(dateRaw, LocalDate.now());

        List<StaffShift> assignedShifts = staffShiftRepository.findByStaffIdAndShiftDateBetweenOrderByShiftDateAsc(
                target.getId(),
                date,
                date
        );

        ShiftType selectedShiftType = resolveSelectedShiftType(assignedShifts, shiftTypeRaw, target.getPreferredShift());
        List<ShiftCoworkerResponse> sameShiftStaffs = new ArrayList<>();

        if (selectedShiftType != null) {
            List<StaffShift> sameShiftAssignments = staffShiftRepository.findByShiftDateAndShiftTypeOrderByStaffNameAsc(date, selectedShiftType);
            Map<String, User> usersById = userRepository.findAllById(
                    sameShiftAssignments.stream()
                            .map(StaffShift::getStaffId)
                            .filter(Objects::nonNull)
                            .distinct()
                            .toList()
            ).stream()
                    .filter(candidate -> isVisibleToActor(actor, target, candidate))
                    .collect(Collectors.toMap(User::getId, user -> user));

            sameShiftStaffs = sameShiftAssignments.stream()
                    .map(shift -> usersById.get(shift.getStaffId()))
                    .filter(Objects::nonNull)
                    .map(user -> ShiftCoworkerResponse.from(user, resolveBranchName(user.getBranchId())))
                    .toList();
        }

        return new ShiftOverviewResponse(
                date,
                target.getId(),
                target.getName(),
                target.getBranchId(),
                resolveBranchName(target.getBranchId()),
                selectedShiftType != null ? selectedShiftType.name() : null,
                assignedShifts.stream().map(StaffShiftResponse::from).toList(),
                sameShiftStaffs
        );
    }

    public PayrollSummaryResponse getPayroll(String token, String staffId, String dateFrom, String dateTo) {
        User actor = requireAnyStaff(token);
        LocalDate from = parseDateOrDefault(dateFrom, LocalDate.now().withDayOfMonth(1));
        LocalDate to = parseDateOrDefault(dateTo, LocalDate.now());
        if (from.isAfter(to)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "dateFrom phai <= dateTo");
        }

        List<AttendanceRecord> records;
        if (MANAGER_ROLES.contains(actor.getRole())) {
            if (staffId != null && !staffId.isBlank()) {
                User target = resolveVisibleTargetStaff(actor, staffId);
                records = attendanceRecordRepository.findByStaffIdAndWorkDateBetweenOrderByWorkDateDescCheckInAtDesc(target.getId(), from, to);
            } else {
                records = attendanceRecordRepository.findByWorkDateBetweenOrderByWorkDateDescCheckInAtDesc(from, to);
            }
        } else {
            records = attendanceRecordRepository.findByStaffIdAndWorkDateBetweenOrderByWorkDateDescCheckInAtDesc(actor.getId(), from, to);
        }

        Map<String, User> usersById = userRepository.findAllById(
                records.stream()
                        .map(AttendanceRecord::getStaffId)
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList()
        ).stream()
                .filter(candidate -> isVisibleToActor(actor, actor, candidate))
                .collect(Collectors.toMap(User::getId, user -> user));

        List<PayrollItemResponse> items = records.stream()
                .filter(record -> usersById.containsKey(record.getStaffId()))
                .collect(Collectors.groupingBy(AttendanceRecord::getStaffId))
                .entrySet()
                .stream()
                .map(entry -> toPayrollItem(usersById.get(entry.getKey()), entry.getValue()))
                .filter(Objects::nonNull)
                .sorted((left, right) -> String.valueOf(left.getStaffName()).compareToIgnoreCase(String.valueOf(right.getStaffName())))
                .toList();

        long totalWorkingMinutes = items.stream()
                .mapToLong(item -> item.getTotalWorkingMinutes() != null ? item.getTotalWorkingMinutes() : 0L)
                .sum();
        int completedShifts = items.stream()
                .mapToInt(item -> item.getCompletedShifts() != null ? item.getCompletedShifts() : 0)
                .sum();
        long totalEstimatedPay = items.stream()
                .mapToLong(item -> item.getEstimatedPay() != null ? item.getEstimatedPay() : 0L)
                .sum();

        return new PayrollSummaryResponse(
                from,
                to,
                totalWorkingMinutes,
                roundHours(totalWorkingMinutes),
                completedShifts,
                totalEstimatedPay,
                items
        );
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

    private User resolveVisibleTargetStaff(User actor, String staffId) {
        if (staffId == null || staffId.isBlank()) {
            return actor;
        }

        String normalizedStaffId = staffId.trim();
        if (!MANAGER_ROLES.contains(actor.getRole()) && !Objects.equals(actor.getId(), normalizedStaffId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi duoc xem du lieu cua chinh minh");
        }

        User target = requireStaffById(normalizedStaffId);
        if (!isVisibleToActor(actor, target, target)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Khong duoc xem du lieu cua nhan vien khac chi nhanh");
        }

        return target;
    }

    private boolean isVisibleToActor(User actor, User targetContext, User candidate) {
        if (actor.getRole() == User.Role.ADMIN) {
            return true;
        }

        String referenceBranchId = targetContext != null ? targetContext.getBranchId() : actor.getBranchId();
        if (referenceBranchId == null || referenceBranchId.isBlank()) {
            return Objects.equals(actor.getId(), candidate.getId());
        }

        return Objects.equals(referenceBranchId, candidate.getBranchId());
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
        if (!Objects.equals(actor.getBranchId(), target.getBranchId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MANAGER chi duoc quan ly nhan vien trong chi nhanh cua minh");
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

    private void assertCanAccessBranch(User actor, String branchId) {
        if (actor.getRole() == User.Role.ADMIN) {
            return;
        }
        if (!Objects.equals(actor.getBranchId(), branchId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chi duoc truy cap du lieu chi nhanh cua minh");
        }
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
        if (totalSpent >= 30_000_000L || loyaltyPoints >= 3000) {
            return User.MemberTier.PLATINUM;
        }
        if (totalSpent >= 10_000_000L || loyaltyPoints >= 1000) {
            return User.MemberTier.GOLD;
        }
        if (totalSpent >= 3_000_000L || loyaltyPoints >= 300) {
            return User.MemberTier.SILVER;
        }
        return User.MemberTier.BRONZE;
    }

    private boolean isStaffRole(User.Role role) {
        return role != null && role != User.Role.CUSTOMER;
    }

    private ShiftType resolveSelectedShiftType(List<StaffShift> assignedShifts, String rawShiftType, ShiftType preferredShift) {
        String normalized = normalizeNullableText(rawShiftType);
        if (normalized != null) {
            try {
                return ShiftType.valueOf(normalized.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ca lam khong hop le");
            }
        }

        if (!assignedShifts.isEmpty()) {
            return assignedShifts.get(0).getShiftType();
        }

        return preferredShift;
    }

    private PayrollItemResponse toPayrollItem(User user, List<AttendanceRecord> records) {
        if (user == null) {
            return null;
        }

        long totalMinutes = records.stream()
                .filter(record -> record.getCheckInAt() != null && record.getCheckOutAt() != null)
                .mapToLong(record -> Math.max(0L, java.time.Duration.between(record.getCheckInAt(), record.getCheckOutAt()).toMinutes()))
                .sum();
        int completedShifts = (int) records.stream().filter(record -> record.getCheckOutAt() != null).count();
        long hourlyRate = DEFAULT_HOURLY_RATES.getOrDefault(user.getRole(), 35_000L);
        long estimatedPay = Math.round((totalMinutes / 60.0d) * hourlyRate);

        return new PayrollItemResponse(
                user.getId(),
                user.getName(),
                user.getEmployeeCode(),
                user.getRole() != null ? user.getRole().name() : null,
                user.getBranchId(),
                resolveBranchName(user.getBranchId()),
                hourlyRate,
                totalMinutes,
                roundHours(totalMinutes),
                records.size(),
                completedShifts,
                estimatedPay
        );
    }

    private Double roundHours(long totalMinutes) {
        return Math.round((totalMinutes / 60.0d) * 100.0d) / 100.0d;
    }

    private String normalizeEmail(String email) {
        if (email == null) {
            return null;
        }
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizePhone(String phone) {
        if (phone == null) {
            return null;
        }
        String normalized = phone.replaceAll("\\s+", "").trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeBranchId(String branchId) {
        if (branchId == null) {
            return null;
        }
        String normalized = branchId.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeNullableText(String input) {
        if (input == null) {
            return null;
        }
        String normalized = input.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeCode(String code) {
        if (code == null) {
            return null;
        }
        String normalized = code.replaceAll("\\s+", "").trim().toUpperCase(Locale.ROOT);
        return normalized.isEmpty() ? null : normalized;
    }

    private String normalizeBranchCode(String code) {
        String normalized = normalizeCode(code);
        if (normalized == null || normalized.length() > 20) {
            return null;
        }
        return normalized;
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
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ngay khong hop le: " + value);
        }
    }

    private boolean containsIgnoreCase(String source, String keyword) {
        if (source == null || keyword == null || keyword.isBlank()) {
            return false;
        }
        return source.toLowerCase(Locale.ROOT).contains(keyword.toLowerCase(Locale.ROOT));
    }

    private void verifyAndConsumeOtp(String phone, String purpose, String otp) {
        OtpEntry entry = otpStore.get(buildOtpStoreKey(phone, purpose));
        if (entry == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP khong ton tai hoac da het han");
        }
        if (System.currentTimeMillis() > entry.expiresAtMillis) {
            otpStore.remove(buildOtpStoreKey(phone, purpose));
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP da het han");
        }
        if (entry.attempts >= OTP_MAX_ATTEMPTS) {
            otpStore.remove(buildOtpStoreKey(phone, purpose));
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP da bi khoa do nhap sai qua so lan cho phep");
        }
        if (!passwordEncoder.matches(String.valueOf(otp == null ? "" : otp).trim(), entry.otpHash)) {
            otpStore.put(
                    buildOtpStoreKey(phone, purpose),
                    new OtpEntry(entry.otpHash, entry.expiresAtMillis, entry.attempts + 1)
            );
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP khong dung");
        }
        otpStore.remove(buildOtpStoreKey(phone, purpose));
    }

    private void enforceOtpRateLimit(String phone) {
        long now = System.currentTimeMillis();
        List<Long> marks = new ArrayList<>(otpRequestRateStore.getOrDefault(phone, List.of()));
        marks.removeIf(ts -> now - ts > OTP_RATE_LIMIT_WINDOW_MILLIS);
        if (marks.size() >= OTP_MAX_REQUESTS_PER_HOUR) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "OTP_RATE_LIMIT_EXCEEDED");
        }
        marks.add(now);
        otpRequestRateStore.put(phone, marks);
    }

    private String normalizeOtpPurpose(String purpose) {
        String raw = String.valueOf(purpose == null ? "" : purpose).trim();
        String value = raw.isBlank() ? "LOGIN" : raw.toUpperCase(Locale.ROOT);
        if (!Set.of("LOGIN", "REGISTER", "RESET", "PROFILE_UPDATE").contains(value)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP_PURPOSE_INVALID");
        }
        return value;
    }

    private String buildOtpStoreKey(String phone, String purpose) {
        return phone + ":" + String.valueOf(purpose == null ? "" : purpose).trim().toUpperCase(Locale.ROOT);
    }

    private String issueRefreshToken(String userId) {
        String token = UUID.randomUUID().toString() + "." + UUID.randomUUID();
        refreshTokenStore.put(token, new RefreshEntry(userId, System.currentTimeMillis() + REFRESH_TOKEN_EXPIRES_MILLIS));
        return token;
    }

    private void validateStrongPassword(String password) {
        String value = String.valueOf(password == null ? "" : password);
        boolean valid = value.length() >= 8
                && value.chars().anyMatch(Character::isUpperCase)
                && value.chars().anyMatch(Character::isDigit);
        if (!valid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD");
        }
    }

    private JsonNode callExternalJson(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .header("Authorization", "Bearer " + internalServiceToken)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Khong lay duoc du lieu tu service lien quan");
            }
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Khong ket noi duoc service lien quan");
        }
    }

    private JsonNode exchangeGoogleCodeForToken(String code) {
        try {
            String body = "code=" + encode(code)
                    + "&client_id=" + encode(googleOauthClientId)
                    + "&client_secret=" + encode(googleOauthClientSecret)
                    + "&redirect_uri=" + encode(googleOauthCallbackUrl)
                    + "&grant_type=authorization_code";
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://oauth2.googleapis.com/token"))
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Google token exchange that bai");
            }
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Khong ket noi duoc Google token endpoint");
        }
    }

    private JsonNode fetchGoogleUserInfo(String googleAccessToken) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create("https://www.googleapis.com/oauth2/v3/userinfo"))
                    .header("Authorization", "Bearer " + googleAccessToken)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Google userinfo that bai");
            }
            return objectMapper.readTree(response.body());
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Khong ket noi duoc Google userinfo endpoint");
        }
    }

    private void ensureGoogleOauthConfigured() {
        if (normalizeNullableText(googleOauthClientId) == null || normalizeNullableText(googleOauthClientSecret) == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Google OAuth chua duoc cau hinh");
        }
    }

    private String encode(String value) {
        return URLEncoder.encode(String.valueOf(value == null ? "" : value), StandardCharsets.UTF_8);
    }

    private record OtpEntry(String otpHash, long expiresAtMillis, int attempts) {}
    private record RefreshEntry(String userId, long expiresAtMillis) {}
    private record GoogleOauthStateEntry(String redirectUri, long expiresAtMillis) {}
}
