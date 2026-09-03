const { Client } = require("pg");

const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL is missing from .env"
  );
}

async function query(text, params = []) {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    await client.connect();

    const result = await client.query(text, params);

    return result;
  } finally {
    await client.end();
  }
}

module.exports = {
  query,
};