package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.ShiftType;
import com.coffeeshop.userservice.entity.StaffShift;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface StaffShiftRepository extends JpaRepository<StaffShift, String> {
    List<StaffShift> findByShiftDateBetweenOrderByShiftDateAsc(LocalDate from, LocalDate to);
    List<StaffShift> findByStaffIdAndShiftDateBetweenOrderByShiftDateAsc(String staffId, LocalDate from, LocalDate to);
    Optional<StaffShift> findByStaffIdAndShiftDateAndShiftType(String staffId, LocalDate shiftDate, ShiftType shiftType);
    List<StaffShift> findByShiftDateAndShiftTypeOrderByStaffNameAsc(LocalDate shiftDate, ShiftType shiftType);
}
