/**
 * YN Studio database adapter
 *
 * - Supabase PostgreSQL is the only database mode used by this build.
 * - The adapter exposes the same small synchronous
 * interface used by the existing application (prepare().get/all/run,
 * exec(), transaction(), pragma()). This lets the existing routes keep
 * their behavior instead of deleting/replacing application functions.
 *
 * NOTE: PostgreSQL queries are executed in a dedicated worker so the
 * existing synchronous route code can remain intact. This is a
 * compatibility bridge, not a high-throughput database abstraction.
 */

const fs = require("fs");
const path = require("path");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

if (!isMainThread) {
  const { connectionString, control, data, maxBytes } = workerData;
  const { Client, types } = require("pg");

  // Keep BIGINT/BIGSERIAL values behaving like SQLite integer IDs.
  types.setTypeParser(20, (value) => Number(value));

  const controlView = new Int32Array(control);
  const dataView = new Uint8Array(data);
  let client;

  function writeResult(payload, ok = true) {
    const text = JSON.stringify(payload);
    const encoded = Buffer.from(text, "utf8");

    if (encoded.length > maxBytes) {
      const errorPayload = JSON.stringify({
        ok: false,
        error: "Database response is too large for the compatibility buffer.",
      });
      const errBytes = Buffer.from(errorPayload, "utf8");
      dataView.set(errBytes.subarray(0, maxBytes));
      Atomics.store(controlView, 1, Math.min(errBytes.length, maxBytes));
      Atomics.store(controlView, 0, -1);
      Atomics.notify(controlView, 0);
      return;
    }

    dataView.set(encoded);
    Atomics.store(controlView, 1, encoded.length);
    Atomics.store(controlView, 0, ok ? 1 : -1);
    Atomics.notify(controlView, 0);
  }

  function normalizeSql(sql) {
    let text = String(sql || "").trim();

    // SQLite placeholders -> PostgreSQL placeholders.
    let index = 0;
    text = text.replace(/\?/g, () => `$${++index}`);

    // SQLite-only schema keywords.
    text = text.replace(/\bAUTOINCREMENT\b/gi, "");
    text = text.replace(/\bDATETIME\b/gi, "TIMESTAMPTZ");
    text = text.replace(/\bREAL\b/gi, "DOUBLE PRECISION");

    // SQLite INSERT OR IGNORE.
    if (/^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(text)) {
      text = text.replace(
        /^INSERT\s+OR\s+IGNORE\s+INTO\b/i,
        "INSERT INTO"
      );

      // Place ON CONFLICT before RETURNING, if RETURNING exists.
      if (/\bRETURNING\b/i.test(text)) {
        text = text.replace(/\bRETURNING\b/i, "ON CONFLICT DO NOTHING RETURNING");
      } else {
        text += " ON CONFLICT DO NOTHING";
      }
    }

    // SQLite's UPDATE OR IGNORE has no exact PostgreSQL equivalent.
    text = text.replace(/^UPDATE\s+OR\s+IGNORE\s+/i, "UPDATE ");

    // SQLite's INSERT OR REPLACE is not currently used by YN Studio,
    // but keeping a safe translation here makes the adapter more tolerant.
    if (/^INSERT\s+OR\s+REPLACE\s+INTO\b/i.test(text)) {
      text = text.replace(
        /^INSERT\s+OR\s+REPLACE\s+INTO\b/i,
        "INSERT INTO"
      );
    }

    return text;
  }

  async function tableInfo(tableName) {
    const result = await client.query(
      `
      SELECT
        ordinal_position AS cid,
        column_name AS name,
        data_type AS type,
        CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
        column_default AS dflt_value,
        0 AS pk
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
      `,
      [String(tableName).replace(/"/g, "")]
    );

    // Mark primary-key columns.
    const pk = await client.query(
      `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      `,
      [String(tableName).replace(/"/g, "")]
    );

    const pkNames = new Set(pk.rows.map((row) => row.column_name));
    return result.rows.map((row) => ({
      ...row,
      pk: pkNames.has(row.name) ? 1 : 0,
    }));
  }

  async function execute(message) {
    const type = message.type;

    if (type === "close") {
      if (client) await client.end();
      writeResult({ ok: true });
      process.exit(0);
    }

    if (!client) {
      client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        application_name: "yn-studio",
      });
      await client.connect();

      // Create/migrate the Supabase schema automatically on first connection.
      // This keeps deployment simple and is safe because the schema uses
      // IF NOT EXISTS / IF NOT EXISTS column additions.
      const schemaPath = path.join(__dirname, "supabase-schema.sql");
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, "utf8");
        await client.query(schemaSql);
      }
    }

    if (type === "query") {
      const sql = String(message.sql || "").trim();

      if (/^PRAGMA\s+table_info\s*\(/i.test(sql)) {
        const match = sql.match(/^PRAGMA\s+table_info\s*\(\s*["']?([^"')]+)["']?\s*\)/i);
        const rows = await tableInfo(match ? match[1] : "");
        return { rows, rowCount: rows.length };
      }

      // Other PRAGMA statements are SQLite-only and are harmless in
      // PostgreSQL mode.
      if (/^PRAGMA\b/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }

      let normalized = normalizeSql(sql);

      // Preserve the existing application's SQLite-style insert-id API.
      // All application tables use an id primary key.
      if (/^\s*INSERT\b/i.test(normalized) && !/\bRETURNING\b/i.test(normalized)) {
        normalized = `${normalized} RETURNING id`;
      }

      const result = await client.query({
        text: normalized,
        values: message.params || [],
      });

      let lastInsertRowid = null;

      if (/^\s*INSERT\b/i.test(normalized)) {
        // The application expects SQLite-style lastInsertRowid.
        // PostgreSQL does not have that concept, so ask the inserted
        // row for its id whenever the caller did not already request it.
        if (/\bRETURNING\b/i.test(normalized)) {
          lastInsertRowid = result.rows?.[0]?.id ?? null;
        } else {
          try {
            const last = await client.query("SELECT LASTVAL() AS id");
            lastInsertRowid = last.rows?.[0]?.id ?? null;
          } catch {
            // Some inserts do not touch a sequence.
          }
        }
      }

      return {
        rows: result.rows || [],
        rowCount: result.rowCount || 0,
        lastInsertRowid,
      };
    }

    throw new Error(`Unknown database worker operation: ${type}`);
  }

  parentPort.on("message", async (message) => {
    try {
      const result = await execute(message);
      writeResult({ ok: true, result });
    } catch (error) {
      writeResult({
        ok: false,
        error: error?.message || String(error),
        code: error?.code || null,
        detail: error?.detail || null,
      }, false);
    }
  });

  return;
}

require("dotenv").config();

const connectionString = String(process.env.SUPABASE_DATABASE_URL || "").trim();

if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL is required. YN Studio is configured for Supabase PostgreSQL only."
  );
}

try {
  const parsed = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("SUPABASE_DATABASE_URL must use postgres:// or postgresql://");
  }
} catch (error) {
  throw new Error(
    `Invalid SUPABASE_DATABASE_URL. Use the Supabase PostgreSQL connection string. ${error.message}`
  );
}

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const control = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
const data = new SharedArrayBuffer(MAX_RESPONSE_BYTES);
const controlView = new Int32Array(control);
const dataView = new Uint8Array(data);

const worker = new Worker(__filename, {
  workerData: {
    connectionString,
    control,
    data,
    maxBytes: MAX_RESPONSE_BYTES,
  },
});

worker.on("error", (error) => {
  console.error("SUPABASE DATABASE WORKER ERROR:", error);
});

function syncRequest(message) {
  Atomics.store(controlView, 0, 0);
  Atomics.store(controlView, 1, 0);

  worker.postMessage(message);

  while (Atomics.load(controlView, 0) === 0) {
    Atomics.wait(controlView, 0, 0, 30000);
  }

  const length = Atomics.load(controlView, 1);
  const text = Buffer.from(dataView.subarray(0, length)).toString("utf8");

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Invalid response from Supabase database worker.");
  }

  if (!payload.ok) {
    const error = new Error(payload.error || "Supabase database query failed.");
    if (payload.code) error.code = payload.code;
    if (payload.detail) error.detail = payload.detail;
    throw error;
  }

  return payload.result;
}

function prepare(sql) {
  return {
    get(...params) {
      const result = syncRequest({
        type: "query",
        sql,
        params,
      });
      return result.rows?.[0];
    },

    all(...params) {
      const result = syncRequest({
        type: "query",
        sql,
        params,
      });
      return result.rows || [];
    },

    run(...params) {
      const result = syncRequest({
        type: "query",
        sql,
        params,
      });

      return {
        changes: result.rowCount || 0,
        lastInsertRowid: result.lastInsertRowid,
      };
    },
  };
}

function exec(sql) {
  return syncRequest({
    type: "query",
    sql,
    params: [],
  });
}

function transaction(callback) {
  syncRequest({ type: "query", sql: "BEGIN", params: [] });

  try {
    const result = callback();
    syncRequest({ type: "query", sql: "COMMIT", params: [] });
    return result;
  } catch (error) {
    try {
      syncRequest({ type: "query", sql: "ROLLBACK", params: [] });
    } catch {}
    throw error;
  }
}

function pragma() {
  // SQLite-only pragma calls are intentionally ignored in PostgreSQL mode.
  return undefined;
}

function close() {
  try {
    syncRequest({ type: "close", params: [] });
  } catch {}
}

module.exports = {
  prepare,
  exec,
  transaction,
  pragma,
  close,
  mode: "supabase",
};
