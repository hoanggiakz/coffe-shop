package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.WorkSchedule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface WorkScheduleRepository extends JpaRepository<WorkSchedule, String> {
    List<WorkSchedule> findByDateBetweenOrderByDateAsc(LocalDate from, LocalDate to);
    List<WorkSchedule> findByUserIdAndDateBetweenOrderByDateAsc(String userId, LocalDate from, LocalDate to);
    Optional<WorkSchedule> findByUserIdAndDate(String userId, LocalDate date);
}

