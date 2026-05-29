package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.LeaveRequest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LeaveRequestRepository extends JpaRepository<LeaveRequest, String> {
    List<LeaveRequest> findByUserIdOrderByCreatedAtDesc(String userId);
    List<LeaveRequest> findByUserIdInOrderByCreatedAtDesc(List<String> userIds);
}

