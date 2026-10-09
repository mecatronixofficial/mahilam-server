const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { parse } = require("dotenv");
const { Client } = require("pg");

async function main() {
  const env = parse(readFileSync(resolve(__dirname, "../.env")));
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing from .env");
  const url = new URL(connectionString);
  console.log("Database configuration:", JSON.stringify({ protocol: url.protocol, username: decodeURIComponent(url.username), passwordPresent: Boolean(url.password), sslmode: url.searchParams.get("sslmode"), inheritedUrlDiffers: Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL !== connectionString) }));
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log("Database connection successful.");
  } catch (error) {
    console.error("Database connection failed. Code:", error.code || "unknown");
    if (error.code === "28P01") {
      console.error("PostgreSQL rejected the credentials. Update DATABASE_URL in .env using the current connection URI from your database provider, then restart the API.");
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main().catch(() => { console.error("Invalid or unreadable DATABASE_URL configuration."); process.exitCode = 1; });
