package com.coffeeshop.userservice.controller;

import com.coffeeshop.userservice.config.JwtUtil;
import com.coffeeshop.userservice.dto.AuthResponse;
import com.coffeeshop.userservice.dto.CustomerEmailLoginRequest;
import com.coffeeshop.userservice.dto.CustomerEmailRegisterRequest;
import com.coffeeshop.userservice.dto.CustomerOffersResponse;
import com.coffeeshop.userservice.dto.CustomerOtpLoginRequest;
import com.coffeeshop.userservice.dto.CustomerOtpRegisterRequest;
import com.coffeeshop.userservice.dto.LoginRequest;
import com.coffeeshop.userservice.dto.OtpRequest;
import com.coffeeshop.userservice.dto.OtpResponse;
import com.coffeeshop.userservice.dto.PointsAccrualRequest;
import com.coffeeshop.userservice.dto.PointsAccrualResponse;
import com.coffeeshop.userservice.dto.RegisterRequest;
import com.coffeeshop.userservice.dto.StaffResponse;
import com.coffeeshop.userservice.dto.UserProfile;
import com.coffeeshop.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class AuthController {

    private final UserService userService;
    private final JwtUtil jwtUtil;

    @GetMapping("/health")
    public ResponseEntity<Object> health() {
        return ResponseEntity.ok().body(java.util.Map.of(
                "service", "user-service",
                "status", "ok",
                "timestamp", java.time.Instant.now().toString()
        ));
    }

    @PostMapping("/register")
    public ResponseEntity<StaffResponse> register(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @Valid @RequestBody RegisterRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.register(extractToken(authHeader), request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(userService.login(request));
    }

    @GetMapping("/profile")
    public ResponseEntity<UserProfile> getProfile(@RequestHeader("Authorization") String authHeader) {
        String token = extractToken(authHeader);
        String userId = jwtUtil.getUserIdFromToken(token);
        return ResponseEntity.ok(userService.getProfile(userId));
    }

    @PostMapping("/customer/request-otp")
    public ResponseEntity<OtpResponse> requestOtp(@Valid @RequestBody OtpRequest request) {
        return ResponseEntity.ok(userService.requestCustomerOtp(request));
    }

    @PostMapping("/customer/register-email")
    public ResponseEntity<AuthResponse> registerCustomerByEmail(@Valid @RequestBody CustomerEmailRegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.registerCustomerByEmail(request));
    }

    @PostMapping("/customer/login-email")
    public ResponseEntity<AuthResponse> loginCustomerByEmail(@Valid @RequestBody CustomerEmailLoginRequest request) {
        return ResponseEntity.ok(userService.loginCustomerByEmail(request));
    }

    @PostMapping("/customer/register-otp")
    public ResponseEntity<AuthResponse> registerCustomerByOtp(@Valid @RequestBody CustomerOtpRegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.registerCustomerByOtp(request));
    }

    @PostMapping("/customer/login-otp")
    public ResponseEntity<AuthResponse> loginCustomerByOtp(@Valid @RequestBody CustomerOtpLoginRequest request) {
        return ResponseEntity.ok(userService.loginCustomerByOtp(request));
    }

    @GetMapping("/customer/profile")
    public ResponseEntity<UserProfile> getCustomerProfile(@RequestHeader("Authorization") String authHeader) {
        return ResponseEntity.ok(userService.getCustomerProfile(extractToken(authHeader)));
    }

    @GetMapping("/customer/offers")
    public ResponseEntity<CustomerOffersResponse> getCustomerOffers(@RequestHeader("Authorization") String authHeader) {
        return ResponseEntity.ok(userService.getCustomerOffers(extractToken(authHeader)));
    }

    @PostMapping("/customer/points/accrual")
    public ResponseEntity<PointsAccrualResponse> accruePoints(@Valid @RequestBody PointsAccrualRequest request) {
        return ResponseEntity.ok(userService.accrueCustomerPoints(request));
    }

    private String extractToken(String authHeader) {
        if (authHeader == null) {
            return "";
        }
        return authHeader.replace("Bearer ", "").trim();
    }
}
