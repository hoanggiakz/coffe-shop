package com.coffeeshop.userservice.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(
        name = "attendance_records",
        indexes = {
                @Index(name = "idx_attendance_staff", columnList = "staff_id"),
                @Index(name = "idx_attendance_work_date", columnList = "work_date")
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AttendanceRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(name = "staff_id", nullable = false)
    private String staffId;

    @Column(name = "staff_name", nullable = false)
    private String staffName;

    @Column(name = "work_date", nullable = false)
    private LocalDate workDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "scheduled_shift")
    private ShiftType scheduledShift;

    @Column(name = "check_in_at", nullable = false)
    private LocalDateTime checkInAt;

    @Column(name = "check_out_at")
    private LocalDateTime checkOutAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "check_in_method", nullable = false)
    private AttendanceMethod checkInMethod;

    @Enumerated(EnumType.STRING)
    @Column(name = "check_out_method")
    private AttendanceMethod checkOutMethod;

    @Column(name = "check_in_identifier")
    private String checkInIdentifier;

    @Column(name = "check_out_identifier")
    private String checkOutIdentifier;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
