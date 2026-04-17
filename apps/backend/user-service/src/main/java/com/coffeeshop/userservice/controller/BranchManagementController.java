package com.coffeeshop.userservice.controller;

import com.coffeeshop.userservice.dto.BranchCreateRequest;
import com.coffeeshop.userservice.dto.BranchResponse;
import com.coffeeshop.userservice.dto.BranchUpdateRequest;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/users/admin/branches")
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

    @DeleteMapping("/{id}")
    public ResponseEntity<BranchResponse> deleteBranch(
            @RequestHeader("Authorization") String authHeader,
            @PathVariable("id") String id
    ) {
        return ResponseEntity.ok(userService.deleteBranch(extractToken(authHeader), id));
    }

    private String extractToken(String authHeader) {
        if (authHeader == null) {
            return "";
        }
        return authHeader.replace("Bearer ", "").trim();
    }
}
