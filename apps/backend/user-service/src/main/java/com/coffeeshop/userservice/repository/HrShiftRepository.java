package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.HrShift;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface HrShiftRepository extends JpaRepository<HrShift, String> {
    List<HrShift> findByBranchIdAndIsActiveOrderByStartTimeAsc(String branchId, Boolean isActive);
    List<HrShift> findByBranchIdOrderByStartTimeAsc(String branchId);
}

