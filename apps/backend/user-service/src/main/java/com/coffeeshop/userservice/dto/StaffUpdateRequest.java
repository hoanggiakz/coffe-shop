package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.ShiftType;
import com.coffeeshop.userservice.entity.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class StaffUpdateRequest {
    private String name;

    @Email
    private String email;

    @Size(min = 6)
    private String password;

    private String phone;
    private User.Role role;
    private String employeeCode;
    private String personalQrCode;
    private ShiftType preferredShift;
    private String branchId;
    private Boolean isActive;
    private LocalDate hireDate;
    private BigDecimal baseSalary;
    private User.SalaryType salaryType;
}
