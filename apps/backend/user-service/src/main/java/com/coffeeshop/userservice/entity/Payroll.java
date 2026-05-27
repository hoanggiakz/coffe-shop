package com.coffeeshop.userservice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "payroll",
        uniqueConstraints = @UniqueConstraint(name = "uk_payroll_user_month", columnNames = {"user_id", "month"}),
        indexes = @Index(name = "idx_payroll_month", columnList = "month"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payroll {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "month", nullable = false)
    private LocalDate month;

    @Column(name = "total_worked_hours", precision = 8, scale = 2)
    @Builder.Default
    private BigDecimal totalWorkedHours = BigDecimal.ZERO;

    @Column(name = "total_worked_days", precision = 8, scale = 2)
    @Builder.Default
    private BigDecimal totalWorkedDays = BigDecimal.ZERO;

    @Column(name = "base_salary_earned", precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal baseSalaryEarned = BigDecimal.ZERO;

    @Column(name = "total_allowances", precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal totalAllowances = BigDecimal.ZERO;

    @Column(name = "total_bonus", precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal totalBonus = BigDecimal.ZERO;

    @Column(name = "total_deductions", precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal totalDeductions = BigDecimal.ZERO;

    @Column(name = "net_salary", precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal netSalary = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private PayrollStatus status = PayrollStatus.DRAFT;

    @Column(name = "approved_by")
    private String approvedBy;

    @Column(name = "approved_at")
    private LocalDateTime approvedAt;

    @Column(name = "notes")
    private String notes;

    public enum PayrollStatus {
        DRAFT, APPROVED, PAID
    }
}

