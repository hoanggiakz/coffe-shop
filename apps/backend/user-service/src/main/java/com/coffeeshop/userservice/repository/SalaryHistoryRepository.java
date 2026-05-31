package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.SalaryHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SalaryHistoryRepository extends JpaRepository<SalaryHistory, String> {
    List<SalaryHistory> findByUserIdOrderByChangedAtDesc(String userId);
    List<SalaryHistory> findByBranchIdOrderByChangedAtDesc(String branchId);
}

