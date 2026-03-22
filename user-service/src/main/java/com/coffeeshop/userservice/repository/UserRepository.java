package com.coffeeshop.userservice.repository;

import com.coffeeshop.userservice.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.List;

public interface UserRepository extends JpaRepository<User, String> {
    Optional<User> findByEmail(String email);
    Optional<User> findByPhone(String phone);
    Optional<User> findByEmailAndRole(String email, User.Role role);
    Optional<User> findByPhoneAndRole(String phone, User.Role role);
    Optional<User> findByEmployeeCode(String employeeCode);
    Optional<User> findByPersonalQrCode(String personalQrCode);
    boolean existsByEmployeeCode(String employeeCode);
    boolean existsByPersonalQrCode(String personalQrCode);
    boolean existsByEmail(String email);
    boolean existsByPhone(String phone);
    List<User> findByRoleInOrderByCreatedAtDesc(List<User.Role> roles);
    List<User> findByRoleInAndBranchIdOrderByCreatedAtDesc(List<User.Role> roles, String branchId);
    long countByBranchIdAndRoleIn(String branchId, List<User.Role> roles);
}
