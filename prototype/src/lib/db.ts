import "server-only";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

// Server-only Prisma client. Never import this file from a "use client" module.
// The SQLite path mirrors prisma.config.ts: DATABASE_URL or prisma/dev.db,
// resolved relative to the project root (the directory `next` runs from).
function sqliteUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const file = raw.replace(/^file:/, "");
  return path.isAbsolute(file) ? file : path.resolve(/*turbopackIgnore: true*/ process.cwd(), file);
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: sqliteUrl() }) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
