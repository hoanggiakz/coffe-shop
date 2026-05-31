package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.CustomerPasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.Optional;

public interface CustomerPasswordResetTokenRepository extends JpaRepository<CustomerPasswordResetToken, String> {
    Optional<CustomerPasswordResetToken> findByToken(String token);
    void deleteByExpiresAtBefore(LocalDateTime time);
}
