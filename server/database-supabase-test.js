require("dotenv").config();

const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function test() {
  try {
    await client.connect();

    console.log("======================================");
    console.log("SUPABASE DATABASE LAYER TEST");
    console.log("======================================");

    const tables = [
      "users",
      "customers",
      "services",
      "orders",
      "order_items",
      "payments",
      "customer_loans",
      "loan_payments",
      "loan_transactions",
      "customer_requests",
      "customer_request_messages",
    ];

    for (const table of tables) {
      const result = await client.query(
        `SELECT COUNT(*)::int AS count FROM "${table}"`
      );

      console.log(
        `✓ ${table}: ${result.rows[0].count}`
      );
    }

    // Test a real SELECT
    const customerResult = await client.query(`
      SELECT
        id,
        customer_code,
        full_name,
        email
      FROM customers
      ORDER BY id
      LIMIT 5
    `);

    console.log("\nCustomers:");
    console.table(customerResult.rows);

    // Test a parameterized query
    const parameterTest = await client.query(
      `
      SELECT id, full_name
      FROM customers
      WHERE id = $1
      `,
      [1]
    );

    console.log("\nParameterized query test:");
    console.table(parameterTest.rows);

    console.log("\n======================================");
    console.log("✅ SUPABASE DATABASE TEST PASSED");
    console.log("======================================");

  } catch (error) {
    console.error("\n❌ SUPABASE DATABASE TEST FAILED");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

test();