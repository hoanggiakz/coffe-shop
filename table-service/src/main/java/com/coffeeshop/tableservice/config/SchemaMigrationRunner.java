package com.coffeeshop.tableservice.config;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SchemaMigrationRunner implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) {
        jdbcTemplate.execute("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'tables_status_check'
                ) THEN
                    ALTER TABLE tables DROP CONSTRAINT tables_status_check;
                END IF;
            END $$;
        """);

        jdbcTemplate.execute("""
            ALTER TABLE tables
            ADD CONSTRAINT tables_status_check
            CHECK (status IN ('AVAILABLE','OCCUPIED','RESERVED','CLEANING','MAINTENANCE'));
        """);
    }
}

