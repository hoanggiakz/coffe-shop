package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.EmployeeSalaryComponent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface EmployeeSalaryComponentRepository extends JpaRepository<EmployeeSalaryComponent, String> {
    List<EmployeeSalaryComponent> findByUserId(String userId);
    List<EmployeeSalaryComponent> findByUserIdIn(List<String> userIds);
    List<EmployeeSalaryComponent> findByUserIdAndEffectiveFromLessThanEqual(String userId, LocalDate date);
}

