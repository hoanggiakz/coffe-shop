package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.Branch;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BranchRepository extends JpaRepository<Branch, String> {
    Optional<Branch> findByNameIgnoreCase(String name);
    Optional<Branch> findByCodeIgnoreCase(String code);
    boolean existsByNameIgnoreCase(String name);
    boolean existsByCodeIgnoreCase(String code);
    List<Branch> findByIsActiveOrderByCreatedAtDesc(Boolean isActive);
    List<Branch> findAllByOrderByCreatedAtDesc();
}
