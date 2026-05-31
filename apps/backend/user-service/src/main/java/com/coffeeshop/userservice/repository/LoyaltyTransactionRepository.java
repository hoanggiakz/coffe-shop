package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.LoyaltyTransaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoyaltyTransactionRepository extends JpaRepository<LoyaltyTransaction, String> {
    Page<LoyaltyTransaction> findByCustomerIdOrderByCreatedAtDesc(String customerId, Pageable pageable);
}

