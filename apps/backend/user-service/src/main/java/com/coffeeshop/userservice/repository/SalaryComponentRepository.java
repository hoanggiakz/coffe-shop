package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.SalaryComponent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SalaryComponentRepository extends JpaRepository<SalaryComponent, String> {
    List<SalaryComponent> findByIsActiveTrueOrderByNameAsc();
    List<SalaryComponent> findByBranchIdOrBranchIdIsNullOrderByNameAsc(String branchId);
}

