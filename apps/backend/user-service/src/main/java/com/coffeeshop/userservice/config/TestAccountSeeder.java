package com.coffeeshop.userservice.config;

import com.coffeeshop.userservice.entity.Branch;
import com.coffeeshop.userservice.entity.ShiftType;
import com.coffeeshop.userservice.entity.User;
import com.coffeeshop.userservice.repository.BranchRepository;
import com.coffeeshop.userservice.repository.UserRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.DependsOn;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@DependsOn("schemaMigrationRunner")
public class TestAccountSeeder {

    private final UserRepository userRepository;
    private final BranchRepository branchRepository;
    private final PasswordEncoder passwordEncoder;

    @PostConstruct
    public void seed() {
        Branch centralBranch = upsertBranch(
                "Chi nhanh Trung Tam",
                "1 Le Loi, Quan 1, TP HCM",
                "02873001234"
        );
        Branch riversideBranch = upsertBranch(
                "Chi nhanh Riverside",
                "88 Tran Phu, Hai Chau, Da Nang",
                "02367300123"
        );

        User admin = upsertStaff(
                "admin.test@coffeeshop.local",
                "Admin@123",
                "Admin Test",
                "0900000001",
                User.Role.ADMIN,
                "ADM001",
                "QR-ADM001",
                ShiftType.MORNING,
                centralBranch.getId()
        );

        User centralManager = upsertStaff(
                "manager.central@coffeeshop.local",
                "Manager@123",
                "Manager Central",
                "0900000002",
                User.Role.MANAGER,
                "MGR001",
                "QR-MGR001",
                ShiftType.MORNING,
                centralBranch.getId()
        );

        User riversideManager = upsertStaff(
                "manager.riverside@coffeeshop.local",
                "Manager@123",
                "Manager Riverside",
                "0900000003",
                User.Role.MANAGER,
                "MGR002",
                "QR-MGR002",
                ShiftType.AFTERNOON,
                riversideBranch.getId()
        );

        upsertStaff(
                "waiter.test@coffeeshop.local",
                "Waiter@123",
                "Waiter Test",
                "0900000004",
                User.Role.WAITER,
                "WTR001",
                "QR-WTR001",
                ShiftType.MORNING,
                centralBranch.getId()
        );

        upsertStaff(
                "barista.test@coffeeshop.local",
                "Barista@123",
                "Barista Test",
                "0900000005",
                User.Role.BARISTA,
                "BAR001",
                "QR-BAR001",
                ShiftType.AFTERNOON,
                centralBranch.getId()
        );

        upsertStaff(
                "staff.test@coffeeshop.local",
                "Staff@123",
                "Staff Test",
                "0900000006",
                User.Role.STAFF,
                "STF001",
                "QR-STF001",
                ShiftType.EVENING,
                riversideBranch.getId()
        );

        upsertCustomer(
                "customer.test@coffeeshop.local",
                "Customer@123",
                "Customer Test",
                "0900000007"
        );

        assignBranchManager(centralBranch, centralManager);
        assignBranchManager(riversideBranch, riversideManager);

        if (admin.getBranchId() == null || !admin.getBranchId().equals(centralBranch.getId())) {
            admin.setBranchId(centralBranch.getId());
            userRepository.save(admin);
        }
    }

    private Branch upsertBranch(String name, String address, String phone) {
        Branch branch = branchRepository.findByNameIgnoreCase(name)
                .orElseGet(() -> Branch.builder().name(name).build());
        branch.setName(name);
        branch.setCode(branchCodeForName(name));
        branch.setAddress(address);
        branch.setPhone(phone);
        branch.setIsActive(true);
        return branchRepository.save(branch);
    }

    private String branchCodeForName(String name) {
        String normalized = name == null ? "" : name.toLowerCase();
        if (normalized.contains("trung tam")) {
            return "BR-CENTRAL";
        }
        if (normalized.contains("riverside")) {
            return "BR-RIVERSIDE";
        }
        return "BR-DEFAULT";
    }

    private User upsertStaff(
            String email,
            String password,
            String name,
            String phone,
            User.Role role,
            String employeeCode,
            String personalQrCode,
            ShiftType preferredShift,
            String branchId
    ) {
        User user = userRepository.findByEmployeeCode(employeeCode)
                .or(() -> userRepository.findByEmail(email))
                .orElseGet(() -> User.builder().email(email).build());
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password));
        user.setName(name);
        user.setPhone(phone);
        user.setRole(role);
        user.setEmployeeCode(employeeCode);
        user.setPersonalQrCode(personalQrCode);
        user.setPreferredShift(preferredShift);
        user.setBranchId(branchId);
        user.setMemberTier(User.MemberTier.STANDARD);
        user.setLoyaltyPoints(0);
        user.setTotalSpent(0L);
        user.setIsActive(true);
        return userRepository.save(user);
    }

    private User upsertCustomer(String email, String password, String name, String phone) {
        User user = userRepository.findByEmail(email)
                .orElseGet(() -> User.builder().email(email).build());
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password));
        user.setName(name);
        user.setPhone(phone);
        user.setRole(User.Role.CUSTOMER);
        user.setEmployeeCode(null);
        user.setPersonalQrCode(null);
        user.setPreferredShift(null);
        user.setBranchId(null);
        user.setMemberTier(User.MemberTier.STANDARD);
        user.setLoyaltyPoints(0);
        user.setTotalSpent(0L);
        user.setIsActive(true);
        return userRepository.save(user);
    }

    private void assignBranchManager(Branch branch, User manager) {
        if (manager == null) {
            return;
        }
        if (branch.getManagerId() != null && branch.getManagerId().equals(manager.getId())) {
            return;
        }
        branch.setManagerId(manager.getId());
        branchRepository.save(branch);
    }
}
