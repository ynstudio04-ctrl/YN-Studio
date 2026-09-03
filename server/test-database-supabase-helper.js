require("dotenv").config();

const db = require("./database-supabase");

async function test() {
  try {
    console.log("Testing Supabase helper...");

    const result = await db.query(
      `
      SELECT
        id,
        customer_code,
        full_name,
        email
      FROM customers
      ORDER BY id
      `
    );

    console.table(result.rows);

    console.log("");
    console.log("======================================");
    console.log("✅ DATABASE HELPER WORKS");
    console.log("======================================");

  } catch (error) {
    console.error("");
    console.error("❌ DATABASE HELPER FAILED");
    console.error(error);
    process.exitCode = 1;
  }
}

test();