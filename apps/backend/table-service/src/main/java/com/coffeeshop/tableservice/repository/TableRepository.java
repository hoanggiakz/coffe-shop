package com.coffeeshop.tableservice.repository;

import com.coffeeshop.tableservice.entity.CoffeeTable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface TableRepository extends JpaRepository<CoffeeTable, String> {
    List<CoffeeTable> findByBranchId(String branchId);
    boolean existsByNumber(Integer number);
    boolean existsByNumberAndIdNot(Integer number, String id);
}
