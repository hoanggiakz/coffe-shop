package com.coffeeshop.userservice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.math.BigDecimal;

@Entity
@Table(name = "users")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String password;

    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private Role role = Role.STAFF;

    @Enumerated(EnumType.STRING)
    @Column(name = "member_tier", nullable = false)
    @Builder.Default
    private MemberTier memberTier = MemberTier.STANDARD;

    @Column(name = "loyalty_points", nullable = false)
    @Builder.Default
    private Integer loyaltyPoints = 0;

    @Column(name = "total_spent", nullable = false)
    @Builder.Default
    private Long totalSpent = 0L;

    private String phone;

    @Column(name = "branch_id")
    private String branchId;

    @Column(name = "employee_code", unique = true)
    private String employeeCode;

    @Column(name = "personal_qr_code", unique = true)
    private String personalQrCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "preferred_shift")
    private ShiftType preferredShift;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "hire_date")
    private LocalDate hireDate;

    @Column(name = "base_salary", precision = 10, scale = 2)
    private BigDecimal baseSalary;

    @Enumerated(EnumType.STRING)
    @Column(name = "salary_type")
    private SalaryType salaryType;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public enum Role {
        ADMIN, MANAGER, WAITER, BARISTA, STAFF, CUSTOMER
    }

    public enum MemberTier {
        STANDARD, SILVER, GOLD
    }

    public enum SalaryType {
        MONTHLY, HOURLY
    }
}
