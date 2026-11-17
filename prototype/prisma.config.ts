// Prisma 7 configuration. The connection URL lives here (not in schema.prisma).
// DATABASE_URL may be set in `.env`; otherwise the prototype falls back to the
// local SQLite file at prisma/dev.db (resolved relative to this config file).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
