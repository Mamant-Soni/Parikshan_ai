import path from "node:path";
import { defineConfig } from "prisma/config";

// When a `prisma.config.ts` is present the CLI no longer auto-loads `.env`, so
// we load it ourselves (Node 20.12+ ships `process.loadEnvFile`).
try {
  process.loadEnvFile?.(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional — defaults below keep the demo working without it.
}

/**
 * Prisma configuration.
 *
 * We run the *JavaScript/WASM* schema engine (`engine: "js"`) together with the
 * official SQLite driver adapter. This keeps the toolchain fully portable:
 * `prisma generate`, `prisma db push` and `prisma migrate` all work without
 * downloading native engine binaries, which matters for hackathon judges on
 * locked-down or offline machines.
 *
 * The application runtime uses the same adapter (see src/lib/database/client.ts)
 * so dev and prod use one code path.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  engine: "js",
  experimental: { adapter: true },
  adapter: async () => {
    const { PrismaBetterSQLite3 } = await import("@prisma/adapter-better-sqlite3");
    return new PrismaBetterSQLite3({ url: sqliteUrl() });
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});

/** Resolves `file:...` URLs relative to the project root, not the schema folder. */
function sqliteUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  if (!raw.startsWith("file:")) return raw;
  const filePath = raw.replace(/^file:/, "");
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
  return `file:${absolute}`;
}
