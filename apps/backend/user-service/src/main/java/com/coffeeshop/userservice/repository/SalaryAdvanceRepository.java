package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.SalaryAdvance;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface SalaryAdvanceRepository extends JpaRepository<SalaryAdvance, String> {
    List<SalaryAdvance> findByUserIdAndDeductMonthAndStatusIn(String userId, LocalDate deductMonth, List<SalaryAdvance.SalaryAdvanceStatus> statuses);
    List<SalaryAdvance> findByUserIdOrderByRequestDateDesc(String userId);
}

