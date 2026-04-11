package com.coffeeshop.tableservice.dto;

import com.coffeeshop.tableservice.entity.CoffeeTable;
import jakarta.validation.constraints.Min;
import lombok.Data;

@Data
public class UpdateTableRequest {
    private Integer number;
    private String area;
    @Min(1)
    private Integer capacity;
    private String branchId;
    private CoffeeTable.TableStatus status;
}

