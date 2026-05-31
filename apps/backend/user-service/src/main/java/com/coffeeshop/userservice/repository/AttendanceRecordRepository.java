package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.AttendanceRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface AttendanceRecordRepository extends JpaRepository<AttendanceRecord, String> {
    boolean existsByStaffId(String staffId);
    Optional<AttendanceRecord> findByStaffIdAndWorkDate(String staffId, LocalDate workDate);
    List<AttendanceRecord> findByStaffIdAndWorkDateOrderByCheckInAtDesc(String staffId, LocalDate workDate);
    Optional<AttendanceRecord> findFirstByStaffIdAndWorkDateAndCheckOutAtIsNullOrderByCheckInAtDesc(String staffId, LocalDate workDate);
    List<AttendanceRecord> findByWorkDateBetweenOrderByWorkDateDescCheckInAtDesc(LocalDate from, LocalDate to);
    List<AttendanceRecord> findByStaffIdAndWorkDateBetweenOrderByWorkDateDescCheckInAtDesc(String staffId, LocalDate from, LocalDate to);
}
