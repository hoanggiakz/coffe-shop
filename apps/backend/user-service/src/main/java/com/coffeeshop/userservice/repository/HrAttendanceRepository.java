package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.HrAttendance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface HrAttendanceRepository extends JpaRepository<HrAttendance, String> {
    Optional<HrAttendance> findByUserIdAndDate(String userId, LocalDate date);
    List<HrAttendance> findByUserIdAndDateBetweenOrderByDateDesc(String userId, LocalDate from, LocalDate to);
    List<HrAttendance> findByDateBetweenOrderByDateDesc(LocalDate from, LocalDate to);
}
