package com.coffeeshop.userservice.config;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class SchemaMigrationRunner {

    private final JdbcTemplate jdbcTemplate;

    @jakarta.annotation.PostConstruct
    public void migrate() {
        Integer tableExists = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='users'",
                Integer.class
        );

        if (tableExists == null || tableExists == 0) {
            return;
        }

        jdbcTemplate.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check");
        jdbcTemplate.execute(
                "ALTER TABLE users " +
                        "ADD CONSTRAINT users_role_check " +
                        "CHECK (role IN ('ADMIN','MANAGER','WAITER','BARISTA','STAFF','CUSTOMER'))"
        );

        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_code VARCHAR(255)");
        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_qr_code VARCHAR(255)");
        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_shift VARCHAR(50)");
        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN");
        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255)");
        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE");
        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)");
        jdbcTemplate.execute("UPDATE users SET is_active = TRUE WHERE is_active IS NULL");
        jdbcTemplate.execute("ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE");
        jdbcTemplate.execute("ALTER TABLE users ALTER COLUMN is_active SET NOT NULL");
        jdbcTemplate.execute("CREATE UNIQUE INDEX IF NOT EXISTS uk_users_employee_code ON users(employee_code) WHERE employee_code IS NOT NULL");
        jdbcTemplate.execute("CREATE UNIQUE INDEX IF NOT EXISTS uk_users_personal_qr_code ON users(personal_qr_code) WHERE personal_qr_code IS NOT NULL");
        jdbcTemplate.execute("CREATE UNIQUE INDEX IF NOT EXISTS uk_users_google_id ON users(google_id) WHERE google_id IS NOT NULL");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id)");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS branches (" +
                        "id VARCHAR(255) PRIMARY KEY, " +
                        "name VARCHAR(255) NOT NULL, " +
                        "code VARCHAR(20), " +
                        "address VARCHAR(255), " +
                        "phone VARCHAR(255), " +
                        "manager_id VARCHAR(255), " +
                        "is_active BOOLEAN NOT NULL DEFAULT TRUE, " +
                        "created_at TIMESTAMP DEFAULT NOW(), " +
                        "updated_at TIMESTAMP DEFAULT NOW()" +
                        ")"
        );
        jdbcTemplate.execute("ALTER TABLE branches ADD COLUMN IF NOT EXISTS code VARCHAR(20)");
        jdbcTemplate.execute("UPDATE branches SET code = CONCAT('BR', UPPER(SUBSTRING(REPLACE(id, '-', ''), 1, 6))) WHERE code IS NULL OR TRIM(code) = ''");
        jdbcTemplate.execute("ALTER TABLE branches ALTER COLUMN code SET NOT NULL");
        jdbcTemplate.execute("CREATE UNIQUE INDEX IF NOT EXISTS uk_branches_name_lower ON branches (LOWER(name))");
        jdbcTemplate.execute("CREATE UNIQUE INDEX IF NOT EXISTS uk_branches_code_lower ON branches (LOWER(code))");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_branches_manager_id ON branches(manager_id)");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS loyalty_transaction (" +
                        "id VARCHAR(255) PRIMARY KEY, " +
                        "customer_id VARCHAR(255) NOT NULL, " +
                        "order_id VARCHAR(255), " +
                        "branch_id VARCHAR(255), " +
                        "type VARCHAR(20) NOT NULL, " +
                        "points INTEGER NOT NULL, " +
                        "balance_after INTEGER NOT NULL, " +
                        "description TEXT, " +
                        "created_at TIMESTAMP DEFAULT NOW()" +
                        ")"
        );
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_loyalty_tx_customer_created ON loyalty_transaction(customer_id, created_at DESC)");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS customer_password_reset_token (" +
                        "id VARCHAR(255) PRIMARY KEY, " +
                        "user_id VARCHAR(255) NOT NULL, " +
                        "token VARCHAR(255) NOT NULL UNIQUE, " +
                        "expires_at TIMESTAMP NOT NULL, " +
                        "used_at TIMESTAMP NULL, " +
                        "created_at TIMESTAMP DEFAULT NOW()" +
                        ")"
        );
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_customer_reset_token_user ON customer_password_reset_token(user_id)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_customer_reset_token_exp ON customer_password_reset_token(expires_at)");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS salary_history (" +
                        "id VARCHAR(255) PRIMARY KEY, " +
                        "user_id VARCHAR(255) NOT NULL, " +
                        "branch_id VARCHAR(255) NOT NULL, " +
                        "old_salary NUMERIC(12,2), " +
                        "new_salary NUMERIC(12,2) NOT NULL, " +
                        "old_type VARCHAR(20), " +
                        "new_type VARCHAR(20) NOT NULL, " +
                        "changed_by VARCHAR(255) NOT NULL, " +
                        "changed_at TIMESTAMP DEFAULT NOW(), " +
                        "reason TEXT" +
                        ")"
        );
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_salary_history_user_changed ON salary_history(user_id, changed_at DESC)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_salary_history_branch_changed ON salary_history(branch_id, changed_at DESC)");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS salary_advance (" +
                        "id VARCHAR(255) PRIMARY KEY, " +
                        "user_id VARCHAR(255) NOT NULL, " +
                        "amount NUMERIC(10,2) NOT NULL, " +
                        "request_date DATE NOT NULL, " +
                        "approved_by VARCHAR(255), " +
                        "status VARCHAR(20) NOT NULL DEFAULT 'PENDING', " +
                        "deduct_month DATE, " +
                        "notes TEXT, " +
                        "created_at TIMESTAMP DEFAULT NOW()" +
                        ")"
        );
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_salary_advance_user ON salary_advance(user_id)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_salary_advance_deduct_month ON salary_advance(deduct_month)");
        jdbcTemplate.execute("CREATE INDEX IF NOT EXISTS idx_salary_advance_status ON salary_advance(status)");
    }
}
