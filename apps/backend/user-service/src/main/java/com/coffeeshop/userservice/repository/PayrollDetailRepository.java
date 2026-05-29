package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.PayrollDetail;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PayrollDetailRepository extends JpaRepository<PayrollDetail, String> {
    List<PayrollDetail> findByPayrollIdOrderByIdAsc(String payrollId);
    void deleteByPayrollId(String payrollId);
}

