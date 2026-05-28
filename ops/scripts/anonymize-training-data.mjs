import crypto from 'node:crypto';
import fs from 'node:fs';

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'reports/ai/anonymized-orders.json';

if (!inputPath) {
  console.error('Usage: node anonymize-training-data.mjs <input-json-path> [output-json-path]');
  process.exit(1);
}

const raw = fs.readFileSync(inputPath, 'utf8');
const rows = JSON.parse(raw);
if (!Array.isArray(rows)) {
  throw new Error('Input must be a JSON array');
}

const anon = rows.map((row) => {
  const phone = String(row.customerPhone || '');
  const email = String(row.customerEmail || '');
  const salt = String(row.branchId || '');
  const sessionId = crypto.createHash('sha256').update(`${phone}|${email}|${salt}`).digest('hex').slice(0, 24);
  return {
    sessionId,
    branchId: row.branchId || null,
    items: row.items || [],
    totalAmount: row.totalAmount || 0,
    createdAt: row.createdAt || null,
    status: row.status || null,
  };
});

fs.mkdirSync(require('node:path').dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(anon, null, 2)}\n`, 'utf8');
console.log(`Anonymized ${anon.length} records -> ${outputPath}`);
