package com.coffeeshop.tableservice.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CreateTableRequest {
    @NotNull
    private Integer number;

    private String area;

    @NotNull @Min(1)
    private Integer capacity;

    private String branchId;
}
