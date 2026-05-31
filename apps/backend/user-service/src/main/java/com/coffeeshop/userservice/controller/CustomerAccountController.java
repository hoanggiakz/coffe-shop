package com.coffeeshop.userservice.controller;

import com.coffeeshop.userservice.dto.ChangePasswordRequest;
import com.coffeeshop.userservice.dto.CustomerAuthResponse;
import com.coffeeshop.userservice.dto.CustomerEmailLoginRequest;
import com.coffeeshop.userservice.dto.CustomerEmailRegisterRequest;
import com.coffeeshop.userservice.dto.CustomerProfileResponse;
import com.coffeeshop.userservice.dto.ForgotPasswordRequest;
import com.coffeeshop.userservice.dto.LoyaltyRedeemRequest;
import com.coffeeshop.userservice.dto.LoyaltyRedeemResponse;
import com.coffeeshop.userservice.dto.LoyaltyTransactionListResponse;
import com.coffeeshop.userservice.dto.OtpRequest;
import com.coffeeshop.userservice.dto.OtpResponse;
import com.coffeeshop.userservice.dto.OtpVerifyRequest;
import com.coffeeshop.userservice.dto.RefreshTokenRequest;
import com.coffeeshop.userservice.dto.RefreshTokenResponse;
import com.coffeeshop.userservice.dto.ResetPasswordRequest;
import com.coffeeshop.userservice.dto.UpdateProfileRequest;
import com.coffeeshop.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
public class CustomerAccountController {

    private final UserService userService;

    @PostMapping("/api/auth/otp/request")
    public ResponseEntity<OtpResponse> requestOtp(@Valid @RequestBody OtpRequest request) {
        return ResponseEntity.ok(userService.requestCustomerOtp(request));
    }

    @PostMapping("/api/auth/otp/verify")
    public ResponseEntity<CustomerAuthResponse> verifyOtp(@Valid @RequestBody OtpVerifyRequest request) {
        return ResponseEntity.ok(userService.verifyCustomerOtp(request));
    }

    @PostMapping("/api/auth/register")
    public ResponseEntity<CustomerAuthResponse> registerByEmail(@Valid @RequestBody CustomerEmailRegisterRequest request) {
        var auth = userService.registerCustomerByEmail(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(
                new CustomerAuthResponse(auth.getAccessToken(), auth.getRefreshToken(), auth.getExpiresIn(), auth.getUser(), false)
        );
    }

    @PostMapping("/api/auth/login")
    public ResponseEntity<CustomerAuthResponse> loginByEmail(@Valid @RequestBody CustomerEmailLoginRequest request) {
        var auth = userService.loginCustomerByEmail(request);
        return ResponseEntity.ok(new CustomerAuthResponse(auth.getAccessToken(), auth.getRefreshToken(), auth.getExpiresIn(), auth.getUser(), false));
    }

    @PostMapping("/api/auth/refresh")
    public ResponseEntity<RefreshTokenResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(userService.refreshCustomerToken(request));
    }

    @PostMapping("/api/auth/forgot-password")
    public ResponseEntity<Map<String, Object>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        return ResponseEntity.ok(userService.forgotPassword(request));
    }

    @PostMapping("/api/auth/reset-password")
    public ResponseEntity<Map<String, Object>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        return ResponseEntity.ok(userService.resetPassword(request));
    }

    @GetMapping("/api/customer/profile")
    public ResponseEntity<CustomerProfileResponse> getProfile(@RequestHeader("Authorization") String authHeader) {
        return ResponseEntity.ok(userService.getCustomerProfileV2(extractToken(authHeader)));
    }

    @PutMapping("/api/customer/profile")
    public ResponseEntity<CustomerProfileResponse> updateProfile(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        return ResponseEntity.ok(userService.updateCustomerProfileV2(extractToken(authHeader), request));
    }

    @PostMapping("/api/customer/change-password")
    public ResponseEntity<Map<String, Object>> changePassword(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        userService.changeCustomerPassword(extractToken(authHeader), request);
        return ResponseEntity.ok(Map.of("success", true, "message", "Mat khau da duoc cap nhat"));
    }

    @GetMapping("/api/customer/orders")
    public ResponseEntity<Map<String, Object>> customerOrders(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "branchId", required = false) String branchId
    ) {
        return ResponseEntity.ok(userService.getCustomerOrders(extractToken(authHeader), page, limit, status, branchId));
    }

    @GetMapping("/api/customer/loyalty/transactions")
    public ResponseEntity<LoyaltyTransactionListResponse> loyaltyTransactions(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "limit", required = false) Integer limit
    ) {
        return ResponseEntity.ok(userService.getLoyaltyTransactions(extractToken(authHeader), page, limit));
    }

    @PostMapping("/api/customer/loyalty/redeem")
    public ResponseEntity<LoyaltyRedeemResponse> redeem(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody LoyaltyRedeemRequest request
    ) {
        return ResponseEntity.ok(userService.redeemLoyaltyPoints(extractToken(authHeader), request));
    }

    private String extractToken(String authHeader) {
        if (authHeader == null) {
            return "";
        }
        return authHeader.replace("Bearer ", "").trim();
    }
}

