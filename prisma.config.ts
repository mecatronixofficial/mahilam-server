import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // process.env rather than env(): `prisma generate` needs no database, so builds (e.g. on Vercel) work without
  // DATABASE_URL. Commands that connect (migrate, seed) still fail clearly when it is missing.
  datasource: { url: process.env.DATABASE_URL },
});
