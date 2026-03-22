package com.coffeeshop.tableservice.dto;

import com.coffeeshop.tableservice.entity.CoffeeTable;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateStatusRequest {
    @NotNull
    private CoffeeTable.TableStatus status;
}
