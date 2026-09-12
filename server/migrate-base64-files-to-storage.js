require("dotenv").config();
const db = require("./database");
const { uploadDataUrl } = require("./supabase-storage");

async function migrateColumn(table, idColumn, valueColumn, folder) {
  const rows = db.prepare(`SELECT ${idColumn}, ${valueColumn} FROM ${table} WHERE ${valueColumn} IS NOT NULL`).all();
  let migrated = 0;
  for (const row of rows) {
    const value = row[valueColumn];
    if (!String(value || "").startsWith("data:")) continue;
    const url = await uploadDataUrl(value, "application/octet-stream", `${folder}/${row[idColumn]}`);
    db.prepare(`UPDATE ${table} SET ${valueColumn} = ? WHERE ${idColumn} = ?`).run(url, row[idColumn]);
    migrated += 1;
    console.log(`Migrated ${table}.${valueColumn} id=${row[idColumn]}`);
  }
  return migrated;
}

(async () => {
  const jobs = [
    ["orders", "id", "product_image", "orders"],
    ["orders", "id", "payment_receipt", "order-payments"],
    ["orders", "id", "china_proof", "china-proofs"],
    ["orders", "id", "vietnam_proof", "vietnam-proofs"],
    ["order_items", "id", "file_data", "order-items"],
    ["payments", "id", "payment_image", "payments"],
    ["customer_request_files", "id", "file_data", "requests"],
  ];

  let total = 0;
  for (const job of jobs) {
    try {
      total += await migrateColumn(...job);
    } catch (error) {
      console.error(`Skipping ${job[0]}.${job[2]}:`, error.message);
    }
  }
  console.log(`DONE. Migrated ${total} file(s) to Supabase Storage.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
