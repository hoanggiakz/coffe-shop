package com.coffeeshop.tableservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class BatchQrRequest {
    private List<String> tableIds;
}

