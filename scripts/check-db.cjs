const { resolve } = require("node:path");
const { config } = require("dotenv");
const { Client } = require("pg");

async function main() {
  // Match the API: inherited environment variables take precedence over .env.
  config({ path: resolve(__dirname, "../.env"), quiet: true });
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is missing");
  const url = new URL(connectionString);
  console.log("Database configuration:", JSON.stringify({ protocol: url.protocol, host: url.hostname, port: url.port || "5432", passwordPresent: Boolean(url.password), sslmode: url.searchParams.get("sslmode") }));
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log("Database connection successful.");
  } catch (error) {
    console.error("Database connection failed. Code:", error.code || "unknown");
    if (error.code === "28P01") {
      console.error("PostgreSQL rejected the credentials. Update DATABASE_URL in the environment or .env using the current connection URI from your database provider, then restart the API.");
    } else if (["ENOTFOUND", "EAI_AGAIN"].includes(error.code)) {
      console.error("The database hostname could not be resolved. Check DATABASE_URL against your provider's current connection URI and check DNS/network access.");
    } else if (["ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET"].includes(error.code) || /timeout|timed out/i.test(error.message || "")) {
      console.error("The database is unreachable or the connection timed out. Check the provider's service status, the hostname and port in DATABASE_URL, and firewall/IP allow-list or VPN restrictions, then retry.");
    } else if (["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"].includes(error.code)) {
      console.error("TLS certificate verification failed. Check the provider's required SSL mode and CA certificate settings; keep certificate verification enabled.");
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main().catch(() => { console.error("Invalid or unreadable DATABASE_URL configuration."); process.exitCode = 1; });
