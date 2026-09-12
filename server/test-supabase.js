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

    const result = await client.query(
      "SELECT NOW() AS current_time"
    );

    console.log("✅ SUPABASE CONNECTION SUCCESSFUL");
    console.log("Database time:", result.rows[0].current_time);

    await client.end();
  } catch (error) {
    console.error("❌ SUPABASE CONNECTION FAILED");
    console.error(error.message);

    try {
      await client.end();
    } catch {}
  }
}

test();