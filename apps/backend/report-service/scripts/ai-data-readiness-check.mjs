import { Pool } from 'pg';

const ORDER_DATABASE_URL = process.env.ORDER_DATABASE_URL;
const PAYMENT_DATABASE_URL = process.env.PAYMENT_DATABASE_URL;
const MIN_MONTHS = Number(process.env.AI_MIN_MONTHS || 3);
const MIN_ORDERS_PER_BRANCH = Number(process.env.AI_MIN_ORDERS_PER_BRANCH || 1000);

if (!ORDER_DATABASE_URL || !PAYMENT_DATABASE_URL) {
  console.error('Missing ORDER_DATABASE_URL or PAYMENT_DATABASE_URL.');
  process.exit(1);
}

const orderPool = new Pool({ connectionString: ORDER_DATABASE_URL });
const paymentPool = new Pool({ connectionString: PAYMENT_DATABASE_URL });

function printCheck(label, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${label} - ${detail}`);
}

async function run() {
  try {
    const coverageSql = `
      SELECT
        "branchId" AS "branchId",
        MIN("createdAt") AS first_order_at,
        MAX("createdAt") AS last_order_at,
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_orders
      FROM orders
      WHERE "branchId" IS NOT NULL AND btrim("branchId") <> ''
      GROUP BY "branchId"
      ORDER BY total_orders DESC
    `;

    const branchCoverage = await orderPool.query(coverageSql);
    if (!branchCoverage.rows.length) {
      printCheck('Branch data coverage', false, 'No branch data found in orders table');
      process.exitCode = 2;
      return;
    }

    const now = Date.now();
    let coveragePass = true;
    let volumePass = true;
    for (const row of branchCoverage.rows) {
      const firstAt = new Date(row.first_order_at);
      const months = (now - firstAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
      const enoughMonths = months >= MIN_MONTHS;
      const enoughVolume = Number(row.total_orders || 0) >= MIN_ORDERS_PER_BRANCH;
      coveragePass = coveragePass && enoughMonths;
      volumePass = volumePass && enoughVolume;
      console.log(
        `Branch=${row.branchId} orders=${row.total_orders} completed=${row.completed_orders} first=${firstAt.toISOString()} months=${months.toFixed(2)}`,
      );
    }

    printCheck('Data history window', coveragePass, `>= ${MIN_MONTHS} months for every branch`);
    printCheck('Data volume', volumePass, `>= ${MIN_ORDERS_PER_BRANCH} orders per branch`);

    const branchIdQualitySql = `
      SELECT
        COUNT(*) FILTER (WHERE "branchId" IS NULL OR btrim("branchId") = '')::int AS null_or_blank_branch,
        COUNT(*) FILTER (WHERE "branchId" IS NOT NULL AND "branchId" <> btrim("branchId"))::int AS branch_with_spaces
      FROM orders
    `;
    const branchQuality = await orderPool.query(branchIdQualitySql);
    const bq = branchQuality.rows[0];
    const branchOk = Number(bq.null_or_blank_branch) === 0 && Number(bq.branch_with_spaces) === 0;
    printCheck(
      'branchId consistency',
      branchOk,
      `null_or_blank=${bq.null_or_blank_branch}, with_spaces=${bq.branch_with_spaces}`,
    );

    const tzSql = `
      SELECT
        current_setting('TIMEZONE') AS timezone,
        now() AT TIME ZONE 'UTC' AS utc_now
    `;
    const orderTz = await orderPool.query(tzSql);
    const paymentTz = await paymentPool.query(tzSql);
    const timezoneMatch = orderTz.rows[0].timezone === paymentTz.rows[0].timezone;
    printCheck(
      'Timezone alignment',
      timezoneMatch,
      `order=${orderTz.rows[0].timezone}, payment=${paymentTz.rows[0].timezone}`,
    );

    const completedOrdersResult = await orderPool.query(
      `SELECT COUNT(*)::int AS total_completed_orders FROM orders WHERE status = 'COMPLETED'`,
    );
    const paidPaymentsResult = await paymentPool.query(
      `SELECT COUNT(*)::int AS total_paid_payments FROM payments WHERE status = 'PAID'`,
    );
    const completed = Number(completedOrdersResult.rows[0]?.total_completed_orders || 0);
    const paid = Number(paidPaymentsResult.rows[0]?.total_paid_payments || 0);
    const paidRatio = completed > 0 ? paid / completed : 1;
    const statusOk = paidRatio >= 0.95;
    printCheck('Order/Payment status consistency', statusOk, `paid_ratio=${(paidRatio * 100).toFixed(2)}%`);
  } finally {
    await Promise.allSettled([orderPool.end(), paymentPool.end()]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
