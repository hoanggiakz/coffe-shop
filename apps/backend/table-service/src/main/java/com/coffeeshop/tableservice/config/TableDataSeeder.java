package com.coffeeshop.tableservice.config;

import com.coffeeshop.tableservice.entity.CoffeeTable;
import com.coffeeshop.tableservice.repository.TableRepository;
import com.coffeeshop.tableservice.service.QrCodeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.DependsOn;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
@DependsOn("schemaMigrationRunner")
public class TableDataSeeder implements CommandLineRunner {

    private static final int MIN_TABLES = 10;
    private final TableRepository tableRepository;
    private final QrCodeService qrCodeService;

    @Value("${app.seed-tables-on-startup:true}")
    private boolean seedTablesOnStartup;

    @Override
    public void run(String... args) {
        if (!seedTablesOnStartup) {
            log.info("TableDataSeeder is disabled by configuration.");
            return;
        }

        List<CoffeeTable> existingTables = tableRepository.findAll();
        Set<Integer> existingNumbers = new HashSet<>();
        for (CoffeeTable table : existingTables) {
            if (table.getNumber() != null) {
                existingNumbers.add(table.getNumber());
            }
        }

        int created = 0;
        for (int number = 1; number <= MIN_TABLES; number++) {
            if (existingNumbers.contains(number)) {
                continue;
            }

            CoffeeTable table = CoffeeTable.builder()
                    .number(number)
                    .area(number <= 5 ? "Tang 1" : "Tang 2")
                    .capacity(number <= 4 ? 2 : 4)
                    .status(CoffeeTable.TableStatus.AVAILABLE)
                    .build();

            CoffeeTable saved = tableRepository.save(table);
            saved.setQrCode(qrCodeService.generateQrBase64(saved));
            tableRepository.save(saved);
            created++;
        }

        if (created > 0) {
            log.info("TableDataSeeder created {} default tables.", created);
        } else {
            log.info("TableDataSeeder found enough existing tables, no seed needed.");
        }
    }
}
