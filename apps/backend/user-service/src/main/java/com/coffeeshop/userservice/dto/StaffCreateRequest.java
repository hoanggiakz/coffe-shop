package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.ShiftType;
import com.coffeeshop.userservice.entity.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class StaffCreateRequest {
    @NotBlank
    private String name;

    @NotBlank
    @Email
    private String email;

    private String password;

    private String phone;

    @NotNull
    private User.Role role;

    private String employeeCode;
    private String personalQrCode;
    private ShiftType preferredShift;
    private String branchId;
    private LocalDate hireDate;
    private BigDecimal baseSalary;
    private User.SalaryType salaryType;
}
