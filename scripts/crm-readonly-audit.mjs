import { Client } from "pg";
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
config({quiet:true});
const client = new Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:5000});
const output = { checkedAt:new Date().toISOString(), readOnly:true, configured:Boolean(process.env.DATABASE_URL), isolatedTestConfigured:Boolean(process.env.CRM_TEST_DATABASE_URL) };
try {
 if(!process.env.DATABASE_URL) throw new Error("not-configured");
 await client.connect();
 await client.query("BEGIN READ ONLY");
 output.tables=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")).rows.map(row=>row.table_name);
 output.migrations=(await client.query('SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at')).rows;
 output.compatibility=(await client.query(`SELECT
 (SELECT count(*)::int FROM "AcademicYear" WHERE "current" = true) AS "currentAcademicYears",
 (SELECT count(*)::int FROM (SELECT "studentId" FROM "StudentGuardian" WHERE "primary" = true GROUP BY "studentId" HAVING count(*) > 1) x) AS "multiplePrimaryGuardianGroups",
 (SELECT count(*)::int FROM (SELECT "enquiryId" FROM "Admission" WHERE "enquiryId" IS NOT NULL AND "status" NOT IN ('REJECTED','CANCELLED') GROUP BY "enquiryId" HAVING count(*) > 1) x) AS "multipleActiveApplicationGroups",
 (SELECT count(*)::int FROM "Enquiry" e LEFT JOIN "User" u ON e."assignedStaffId" = u."id" WHERE e."assignedStaffId" IS NOT NULL AND u."id" IS NULL) AS "orphanAssignments",
 (SELECT count(*)::int FROM "Admission" a LEFT JOIN "Enquiry" e ON a."enquiryId" = e."id" WHERE a."enquiryId" IS NOT NULL AND e."id" IS NULL) AS "orphanApplicationEnquiries"`)).rows[0];
 output.foreignKeys=(await client.query("SELECT conrelid::regclass::text AS table_name, conname AS constraint_name, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY 1,2")).rows;
 output.serverVersion=(await client.query("SHOW server_version")).rows[0].server_version;
 await client.query("COMMIT"); output.status="metadata-read-success";
} catch(error) { output.status="blocked"; output.errorCode=typeof error.code==="string"?error.code:"connection-unavailable"; }
finally { await client.end().catch(()=>{}); }
if (process.argv[2]) writeFileSync(process.argv[2],JSON.stringify(output,null,2));
console.log(JSON.stringify(output));
