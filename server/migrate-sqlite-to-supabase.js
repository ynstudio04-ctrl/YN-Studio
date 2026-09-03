require("dotenv").config();

const Database = require("better-sqlite3");
const { Client } = require("pg");
const path = require("path");

const sqlitePath = path.join(__dirname, "ynstudio.db");

const sqlite = new Database(sqlitePath, {
  readonly: true,
});

const pg = new Client({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

/*
 * IMPORTANT:
 * This migration:
 * - reads SQLite only
 * - writes to Supabase
 * - preserves IDs
 * - does NOT delete your SQLite database
 * - does NOT modify your SQLite database
 */

const tables = [
  {
    name: "users",
    columns: [
      "id",
      "username",
      "password",
      "created_at",
    ],
  },

  {
    name: "customers",
    columns: [
      "id",
      "customer_code",
      "full_name",
      "customer_type",
      "phone",
      "email",
      "password",
      "telegram",
      "facebook",
      "address",
      "notes",
      "created_at",
    ],
  },

  {
    name: "services",
    columns: [
      "id",
      "name",
      "price",
      "description",
      "active",
      "created_at",
      "service_code",
      "category",
      "allow_file_upload",
    ],
  },

  {
    name: "orders",
    columns: [
      "id",
      "customer_id",
      "status",
      "total",
      "notes",
      "created_at",
      "public_order_number",
      "payment_amount",
      "payment_receipt",
      "payment_submitted_at",
      "payment_status",
      "updated_at",
      "service_id",
      "quantity",
      "price",
      "file_name",
      "file_type",
      "file_size",
      "file_data",
      "china_status",
      "china_proof",
      "china_proof_uploaded_at",
      "vietnam_status",
      "vietnam_proof",
      "vietnam_proof_uploaded_at",
    ],
  },

  {
    name: "order_items",
    columns: [
      "id",
      "order_id",
      "service_id",
      "quantity",
      "price",
      "total",
      "approved_date",
      "notes",
      "file_name",
      "file_type",
      "file_size",
      "file_data",
      "created_at",
    ],
  },

  {
    name: "order_item_files",
    columns: [
      "id",
      "order_item_id",
      "file_name",
      "file_type",
      "file_size",
      "file_data",
      "created_at",
    ],
  },

  {
    name: "receipts",
    columns: [
      "id",
      "receipt_number",
      "customer_id",
      "total",
      "payment_status",
      "created_at",
    ],
  },

  {
    name: "payments",
    columns: [
      "id",
      "customer_id",
      "type",
      "amount",
      "payment_image",
      "status",
      "created_at",
      "loan_id",
      "payment_method",
    ],
  },

  {
    name: "wallets",
    columns: [
      "id",
      "customer_id",
      "balance",
      "created_at",
      "updated_at",
    ],
  },

  {
    name: "wallet_transactions",
    columns: [
      "id",
      "customer_id",
      "amount",
      "type",
      "description",
      "created_at",
    ],
  },

  {
    name: "wallet_withdrawals",
    columns: [
      "id",
      "customer_id",
      "amount",
      "qr_code",
      "note",
      "status",
      "created_at",
      "updated_at",
    ],
  },

  {
    name: "customer_loans",
    columns: [
      "id",
      "customer_id",
      "enabled",
      "total_amount",
      "paid_amount",
      "notes",
      "created_at",
      "updated_at",
      "start_date",
      "end_date",
      "interest_type",
      "interest_value",
      "weekly_interest",
      "principal_remaining",
      "payoff_date",
      "status",
      "remaining_balance",
      "loan_status",
      "repayment_frequency",
    ],
  },

  {
    name: "loan_payments",
    columns: [
      "id",
      "loan_id",
      "payment_type",
      "amount",
      "due_date",
      "paid_date",
      "status",
      "notes",
      "created_at",
    ],
  },

  {
    name: "loan_transactions",
    columns: [
      "id",
      "loan_id",
      "amount",
      "type",
      "description",
      "created_at",
    ],
  },

  {
    name: "customer_requests",
    columns: [
      "id",
      "customer_id",
      "request_type",
      "service_id",
      "product_link",
      "quantity",
      "details",
      "deadline",
      "status",
      "quote_amount",
      "quote_currency",
      "quote_status",
      "quote_note",
      "quoted_at",
      "accepted_at",
      "declined_at",
      "order_id",
      "created_at",
      "updated_at",
    ],
  },

  {
    name: "customer_request_files",
    columns: [
      "id",
      "request_id",
      "file_name",
      "file_type",
      "file_size",
      "file_data",
      "created_at",
    ],
  },

  {
    name: "customer_request_messages",
    columns: [
      "id",
      "request_id",
      "sender_type",
      "sender_id",
      "message",
      "created_at",
    ],
  },

  {
    name: "customer_coupons",
    columns: [
      "id",
      "customer_id",
      "code",
      "discount_type",
      "discount_value",
      "expires_at",
      "notes",
      "created_at",
    ],
  },
];

async function tableExists(tableName) {
  const result = await pg.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = $1
    ) AS exists
    `,
    [tableName]
  );

  return result.rows[0].exists;
}

async function getSupabaseColumns(tableName) {
  const result = await pg.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = $1
    ORDER BY ordinal_position
    `,
    [tableName]
  );

  return result.rows.map((row) => row.column_name);
}

function normalizeValue(value, columnName = "") {
  if (value === undefined || value === null) {
    return null;
  }

  // SQLite integers used as booleans
  if (typeof value === "number") {
    return value;
  }

  /*
   * SQLite may contain dates such as:
   *
   *   2026-08-22 10:30:00 GMT+0700
   *
   * PostgreSQL does not understand the "GMT+0700" suffix.
   *
   * Convert it to an ISO-8601 timestamp.
   */
  if (
    typeof value === "string" &&
    /(?:^|_)(date|at|time|created|updated|paid|due|quoted|accepted|declined|approved|uploaded|payoff)(?:$|_)/i.test(
      columnName
    )
  ) {
    const trimmed = value.trim();

    // Convert GMT+0700 / GMT-0700 to +07:00 / -07:00
    const normalizedTimezone = trimmed.replace(
      /\sGMT([+-])(\d{2})(\d{2})$/i,
      " $1$2:$3"
    );

    const parsed = new Date(normalizedTimezone);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    /*
     * If PostgreSQL cannot parse it as a timestamp,
     * leave it alone rather than corrupting the data.
     */
    return value;
  }

  return value;
}

async function migrateTable(table) {
  const exists = await tableExists(table.name);

  if (!exists) {
    throw new Error(
      `Supabase table "${table.name}" does not exist.`
    );
  }

  // Some installations of the original SQLite database are older and may
  // not contain every table present in the current Supabase schema. In that
  // case, skip the missing SQLite table instead of aborting the whole
  // migration. The original SQLite database is never modified.
  const sqliteTable = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table.name);

  if (!sqliteTable) {
    console.log(`\n${table.name}: skipped (not present in SQLite database)`);
    return 0;
  }

  const supabaseColumns = await getSupabaseColumns(table.name);

  /*
   * Only migrate columns that actually exist in Supabase.
   *
   * This protects us from harmless differences between
   * the SQLite schema and PostgreSQL schema.
   */
  const columns = table.columns.filter((column) =>
    supabaseColumns.includes(column)
  );

  if (!columns.includes("id")) {
    throw new Error(
      `Table "${table.name}" does not have an id column.`
    );
  }

  const rows = sqlite
    .prepare(`SELECT * FROM "${table.name}"`)
    .all();

  console.log(`\n${table.name}: ${rows.length} row(s)`);

  if (rows.length === 0) {
    return 0;
  }

  let inserted = 0;

  for (const row of rows) {
   const values = columns.map((column) =>
  normalizeValue(row[column], column)
);

    const placeholders = values
      .map((_, index) => `$${index + 1}`)
      .join(", ");

    const quotedColumns = columns
      .map((column) => `"${column}"`)
      .join(", ");

    /*
     * ON CONFLICT DO NOTHING means this script is safe to
     * run again if a row was already migrated.
     */
    const sql = `
      INSERT INTO "${table.name}" (${quotedColumns})
      VALUES (${placeholders})
      ON CONFLICT DO NOTHING
    `;

    const result = await pg.query(sql, values);

    if (result.rowCount > 0) {
      inserted++;
    }
  }

  console.log(
    `  ✓ inserted ${inserted}/${rows.length}`
  );

  return inserted;
}

async function resetSequence(tableName) {
  const hasId = await pg.query(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = 'id'
    ) AS exists
    `,
    [tableName]
  );

  if (!hasId.rows[0].exists) return;

  await pg.query(
    `
    SELECT setval(
      pg_get_serial_sequence($1, 'id'),
      COALESCE((SELECT MAX(id) FROM "${tableName}"), 0) + 1,
      false
    )
    `,
    [tableName]
  );
}

async function verifyCounts() {
  console.log("\n==============================");
  console.log("VERIFYING DATA");
  console.log("==============================");

  for (const table of tables) {
    const sqliteCount = sqlite
      .prepare(`SELECT COUNT(*) AS count FROM "${table.name}"`)
      .get().count;

    const pgResult = await pg.query(
      `SELECT COUNT(*)::int AS count FROM "${table.name}"`
    );

    const pgCount = pgResult.rows[0].count;

    const status =
      Number(sqliteCount) === Number(pgCount)
        ? "✓"
        : "⚠";

    console.log(
      `${status} ${table.name}: SQLite=${sqliteCount}, Supabase=${pgCount}`
    );
  }
}

async function main() {
  console.log("======================================");
  console.log("YN STUDIO SQLITE → SUPABASE MIGRATION");
  console.log("======================================");

  try {
    await pg.connect();

    console.log("✓ Connected to Supabase");

    /*
     * IMPORTANT:
     * We use a transaction so that if something fails,
     * we roll back the entire migration.
     */
    await pg.query("BEGIN");

    /*
     * Parent tables must be migrated before child tables.
     */
    for (const table of tables) {
      await migrateTable(table);
    }

    /*
     * Reset PostgreSQL identity sequences so future inserts
     * don't collide with the migrated IDs.
     */
    console.log("\nResetting ID sequences...");

    for (const table of tables) {
      await resetSequence(table.name);
    }

    await pg.query("COMMIT");

    console.log("\n✓ Migration transaction committed.");

    await verifyCounts();

    console.log("\n======================================");
    console.log("MIGRATION COMPLETE");
    console.log("======================================");

  } catch (error) {
    console.error("\n❌ MIGRATION FAILED");
    console.error(error);

    try {
      await pg.query("ROLLBACK");
      console.log("✓ Supabase transaction rolled back.");
    } catch (rollbackError) {
      console.error(
        "Rollback error:",
        rollbackError.message
      );
    }

    process.exitCode = 1;
  } finally {
    sqlite.close();

    try {
      await pg.end();
    } catch {}
  }
}

main();