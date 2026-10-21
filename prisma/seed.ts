import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSQLite3 } from "@prisma/adapter-better-sqlite3";
import { seedDemoAccount } from "../src/lib/demo/demo-seed";

/**
 * CLI seed: `npm run db:seed` (or `npm run setup`).
 * The actual data lives in src/lib/demo/demo-seed.ts so the demo sign-in button
 * can create the same account on demand.
 */

try {
  process.loadEnvFile?.(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional.
}

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim() || "file:./prisma/dev.db";
  if (!raw.startsWith("file:")) return raw;
  const filePath = raw.replace(/^file:/, "");
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  return `file:${absolute}`;
}

const prisma = new PrismaClient({
  adapter: new PrismaBetterSQLite3({ url: resolveDatabaseUrl() }),
});

seedDemoAccount(prisma)
  .then(() => {
    console.log("Seed complete — sign in with the demo button or demo@healthcopilot.app");
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
