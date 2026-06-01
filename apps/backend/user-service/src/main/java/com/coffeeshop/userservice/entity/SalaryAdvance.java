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
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "salary_advance", indexes = {
        @Index(name = "idx_salary_advance_user", columnList = "user_id"),
        @Index(name = "idx_salary_advance_deduct_month", columnList = "deduct_month"),
        @Index(name = "idx_salary_advance_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SalaryAdvance {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    @Column(name = "request_date", nullable = false)
    private LocalDate requestDate;

    @Column(name = "approved_by")
    private String approvedBy;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private SalaryAdvanceStatus status = SalaryAdvanceStatus.PENDING;

    @Column(name = "deduct_month")
    private LocalDate deductMonth;

    @Column(name = "notes")
    private String notes;

    @Column(name = "created_at")
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    public enum SalaryAdvanceStatus {
        PENDING, APPROVED, DEDUCTED, REJECTED
    }
}

