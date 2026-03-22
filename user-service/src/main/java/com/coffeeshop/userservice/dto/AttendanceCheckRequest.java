package com.coffeeshop.userservice.dto;

import com.coffeeshop.userservice.entity.AttendanceMethod;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AttendanceCheckRequest {
    @NotBlank
    private String identifier;

    @NotNull
    private AttendanceMethod method;
}
