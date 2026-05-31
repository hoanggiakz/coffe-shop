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
import com.coffeeshop.userservice.entity.User;
import com.coffeeshop.userservice.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private UserService userService;

    @Mock
    private JwtUtil jwtUtil;

    @InjectMocks
    private AuthController controller;

    private LoginRequest loginRequest;
    private RegisterRequest registerRequest;
    private AuthResponse authResponse;
    private UserProfile userProfile;

    @BeforeEach
    void setUp() {
        loginRequest = new LoginRequest();
        loginRequest.setEmail("staff@coffee.local");
        loginRequest.setPassword("Password@123");

        registerRequest = new RegisterRequest();
        registerRequest.setName("Staff A");
        registerRequest.setEmail("new.staff@coffee.local");
        registerRequest.setPassword("Secret@123");
        registerRequest.setRole(User.Role.STAFF);

        userProfile = new UserProfile(
                "u-1",
                "staff@coffee.local",
                "Staff A",
                "STAFF",
                "0900000001",
                "branch-1",
                "EMP001",
                null,
                null,
                0,
                "BRONZE",
                0L
        );
        authResponse = new AuthResponse("token-123", userProfile);
    }

    @Test
    void health_ShouldReturnOkPayload() {
        ResponseEntity<Object> response = controller.health();
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().toString().contains("user-service"));
    }

    @Test
    void register_ShouldUseBearerTokenAndReturnCreated() {
        StaffResponse staffResponse = new StaffResponse(
                "u-2", "Staff B", "new.staff@coffee.local", "0900000002",
                "STAFF", "EMP002", "QR-EMP002", "MORNING",
                "branch-1", "Central", true, null
        );
        when(userService.register(eq("token-abc"), eq(registerRequest))).thenReturn(staffResponse);

        ResponseEntity<StaffResponse> response = controller.register("Bearer token-abc", registerRequest);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertEquals(staffResponse, response.getBody());
        verify(userService).register("token-abc", registerRequest);
    }

    @Test
    void register_ShouldHandleMissingAuthorizationHeader() {
        StaffResponse staffResponse = new StaffResponse(
                "u-3", "Staff C", "staff.c@coffee.local", "0900000003",
                "WAITER", "EMP003", "QR-EMP003", "AFTERNOON",
                "branch-1", "Central", true, null
        );
        when(userService.register(eq(""), eq(registerRequest))).thenReturn(staffResponse);

        ResponseEntity<StaffResponse> response = controller.register(null, registerRequest);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertEquals(staffResponse, response.getBody());
        verify(userService).register("", registerRequest);
    }

    @Test
    void login_ShouldDelegateToUserService() {
        when(userService.login(loginRequest)).thenReturn(authResponse);

        ResponseEntity<AuthResponse> response = controller.login(loginRequest);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(authResponse, response.getBody());
        verify(userService).login(loginRequest);
    }

    @Test
    void getProfile_ShouldDecodeTokenAndFetchProfile() {
        when(jwtUtil.getUserIdFromToken("token-x")).thenReturn("u-1");
        when(userService.getProfile("u-1")).thenReturn(userProfile);

        ResponseEntity<UserProfile> response = controller.getProfile("Bearer token-x");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(userProfile, response.getBody());
        verify(jwtUtil).getUserIdFromToken("token-x");
        verify(userService).getProfile("u-1");
    }

    @Test
    void customerOtpAndEmailEndpoints_ShouldDelegateToService() {
        OtpRequest otpRequest = new OtpRequest();
        otpRequest.setPhone("0900000009");
        OtpResponse otpResponse = new OtpResponse("ok", "090****009", 300L);
        when(userService.requestCustomerOtp(otpRequest)).thenReturn(otpResponse);

        CustomerEmailRegisterRequest emailRegisterRequest = new CustomerEmailRegisterRequest();
        emailRegisterRequest.setEmail("customer@coffee.local");
        emailRegisterRequest.setPassword("Password@123");
        emailRegisterRequest.setName("Customer");
        when(userService.registerCustomerByEmail(emailRegisterRequest)).thenReturn(authResponse);

        CustomerEmailLoginRequest emailLoginRequest = new CustomerEmailLoginRequest();
        emailLoginRequest.setEmail("customer@coffee.local");
        emailLoginRequest.setPassword("Password@123");
        when(userService.loginCustomerByEmail(emailLoginRequest)).thenReturn(authResponse);

        assertEquals(otpResponse, controller.requestOtp(otpRequest).getBody());
        assertEquals(HttpStatus.CREATED, controller.registerCustomerByEmail(emailRegisterRequest).getStatusCode());
        assertEquals(authResponse, controller.loginCustomerByEmail(emailLoginRequest).getBody());
    }

    @Test
    void customerOtpLoginRegisterProfileOffers_ShouldDelegate() {
        CustomerOtpRegisterRequest otpRegisterRequest = new CustomerOtpRegisterRequest();
        otpRegisterRequest.setPhone("0900000010");
        otpRegisterRequest.setOtp("123456");
        otpRegisterRequest.setName("Customer OTP");

        CustomerOtpLoginRequest otpLoginRequest = new CustomerOtpLoginRequest();
        otpLoginRequest.setPhone("0900000010");
        otpLoginRequest.setOtp("123456");

        CustomerOffersResponse offers = new CustomerOffersResponse("STANDARD", 12, List.of("Offer 1"));

        when(userService.registerCustomerByOtp(otpRegisterRequest)).thenReturn(authResponse);
        when(userService.loginCustomerByOtp(otpLoginRequest)).thenReturn(authResponse);
        when(userService.getCustomerProfile("token-customer")).thenReturn(userProfile);
        when(userService.getCustomerOffers("token-customer")).thenReturn(offers);

        assertEquals(HttpStatus.CREATED, controller.registerCustomerByOtp(otpRegisterRequest).getStatusCode());
        assertEquals(authResponse, controller.loginCustomerByOtp(otpLoginRequest).getBody());
        assertEquals(userProfile, controller.getCustomerProfile("Bearer token-customer").getBody());
        assertEquals(offers, controller.getCustomerOffers("Bearer token-customer").getBody());
    }

    @Test
    void accruePoints_ShouldDelegateToService() {
        PointsAccrualRequest request = new PointsAccrualRequest();
        request.setCustomerId("cust-1");
        request.setOrderId("order-1");
        request.setAmount(250_000L);

        PointsAccrualResponse responsePayload = new PointsAccrualResponse("cust-1", "order-1", 25, 125, "SILVER");
        when(userService.accrueCustomerPoints(any(PointsAccrualRequest.class))).thenReturn(responsePayload);

        ResponseEntity<PointsAccrualResponse> response = controller.accruePoints(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(responsePayload, response.getBody());
        verify(userService).accrueCustomerPoints(request);
    }
}
