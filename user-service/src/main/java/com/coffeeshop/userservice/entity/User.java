package com.coffeeshop.userservice.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

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

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public enum Role {
        ADMIN, MANAGER, WAITER, BARISTA, STAFF, CUSTOMER
    }

    public enum MemberTier {
        STANDARD, SILVER, GOLD
    }
}
