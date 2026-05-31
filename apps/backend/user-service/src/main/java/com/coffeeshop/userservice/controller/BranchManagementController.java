package com.coffeeshop.userservice.controller;

import com.coffeeshop.userservice.dto.BranchCreateRequest;
import com.coffeeshop.userservice.dto.BranchResponse;
import com.coffeeshop.userservice.dto.BranchUpdateRequest;
import com.coffeeshop.userservice.dto.StaffCreateRequest;
import com.coffeeshop.userservice.dto.StaffResponse;
import com.coffeeshop.userservice.entity.User;
import com.coffeeshop.userservice.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping({"/api/users/admin/branches", "/api/branches"})
@RequiredArgsConstructor
public class BranchManagementController {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<List<BranchResponse>> listBranches(
            @RequestHeader("Authorization") String authHeader,
            @RequestParam(value = "includeInactive", required = false) Boolean includeInactive
    ) {
        return ResponseEntity.ok(userService.listBranches(extractToken(authHeader), includeInactive));
    }

    @GetMapping("/{id}")
    public ResponseEntity<BranchResponse> getBranch(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String id
    ) {
        return ResponseEntity.ok(userService.getBranch(extractToken(authHeader), id));
    }

    @PostMapping
    public ResponseEntity<BranchResponse> createBranch(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody BranchCreateRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(userService.createBranch(extractToken(authHeader), request));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<BranchResponse> updateBranch(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String id,
            @Valid @RequestBody BranchUpdateRequest request
    ) {
        return ResponseEntity.ok(userService.updateBranch(extractToken(authHeader), id, request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<BranchResponse> replaceBranch(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String id,
            @Valid @RequestBody BranchUpdateRequest request
    ) {
        return ResponseEntity.ok(userService.updateBranch(extractToken(authHeader), id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<BranchResponse> deleteBranch(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String id
    ) {
        return ResponseEntity.ok(userService.deleteBranch(extractToken(authHeader), id));
    }

    @GetMapping("/{id}/staff")
    public ResponseEntity<Map<String, Object>> listBranchStaff(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String id,
            @RequestParam(value = "includeInactive", required = false) Boolean includeInactive,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "limit", required = false) Integer limit,
            @RequestParam(value = "role", required = false) User.Role role,
            @RequestParam(value = "isActive", required = false) Boolean isActive,
            @RequestParam(value = "search", required = false) String search,
            @RequestParam(value = "sortBy", required = false) String sortBy,
            @RequestParam(value = "sortOrder", required = false) String sortOrder
    ) {
        Boolean effectiveIsActive = isActive;
        if (effectiveIsActive == null && Boolean.TRUE.equals(includeInactive)) {
            effectiveIsActive = null;
        }
        return ResponseEntity.ok(userService.listBranchStaffPaged(
                extractToken(authHeader),
                id,
                page,
                limit,
                role,
                effectiveIsActive,
                search,
                sortBy,
                sortOrder
        ));
    }

    @PostMapping("/{id}/staff")
    public ResponseEntity<StaffResponse> addBranchStaff(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String id,
            @Valid @RequestBody StaffCreateRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(userService.createBranchStaff(extractToken(authHeader), id, request));
    }

    @GetMapping("/{id}/reports/sales")
    public ResponseEntity<String> getBranchSalesReport(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String id,
            @RequestParam(value = "dateFrom", required = false) String dateFrom,
            @RequestParam(value = "dateTo", required = false) String dateTo
    ) {
        return ResponseEntity.ok(userService.getBranchSalesReport(extractToken(authHeader), id, dateFrom, dateTo));
    }

    private String extractToken(String authHeader) {
        if (authHeader == null) {
            return "";
        }
        return authHeader.replace("Bearer ", "").trim();
    }
}
