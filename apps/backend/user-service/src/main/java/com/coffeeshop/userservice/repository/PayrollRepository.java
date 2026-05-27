package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.Payroll;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface PayrollRepository extends JpaRepository<Payroll, String> {
    List<Payroll> findByMonthOrderByUserIdAsc(LocalDate month);
    List<Payroll> findByUserIdAndMonthBetweenOrderByMonthDesc(String userId, LocalDate from, LocalDate to);
    List<Payroll> findByUserIdInAndMonth(List<String> userIds, LocalDate month);
    Optional<Payroll> findByUserIdAndMonth(String userId, LocalDate month);
}

