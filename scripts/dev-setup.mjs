#!/usr/bin/env node
/**
 * First-run setup for `npm run dev`.
 *
 * A fresh clone has no `.env` and no SQLite file. Instead of failing with
 * "no such table: User", this script (wired as `predev`) prepares both, then
 * lets the dev server start. Everything here is best-effort and non-fatal: if
 * it cannot prepare the database it prints what to run manually and continues.
 *
 * Safe to run repeatedly — `prisma db seed` is idempotent.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

function log(message) {
  console.log(`[setup] ${message}`);
}

/** 1. Environment file. */
if (!existsSync(envPath) && existsSync(examplePath)) {
  copyFileSync(examplePath, envPath);
  log("created .env from .env.example (demo values only)");
}

/** DATABASE_URL is resolved the same way as src/lib/database/client.ts. */
function sqliteFile() {
  try {
    process.loadEnvFile?.(envPath);
  } catch {
    // .env missing or unreadable — fall back to the default path below.
  }
  const raw = process.env.DATABASE_URL?.trim() || "file:./prisma/dev.db";
  if (!raw.startsWith("file:")) return null; // postgres/mysql: nothing to create here
  const filePath = raw.replace(/^file:/, "");
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
}

function needsDatabase(dbFile) {
  if (!dbFile) return false;
  if (!existsSync(dbFile)) return true;
  try {
    return statSync(dbFile).size < 4096; // empty or truncated file
  } catch {
    return true;
  }
}

/** 2. Schema + demo data. */
const dbFile = sqliteFile();
if (needsDatabase(dbFile)) {
  try {
    log("preparing SQLite schema…");
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate"], { stdio: "inherit", cwd: root });
    log("loading demo records, medicines and lab values…");
    execFileSync("npx", ["prisma", "db", "seed"], { stdio: "inherit", cwd: root });
    log("demo data ready — sign in with “Continue with Demo Account”.");
  } catch {
    log(
      "could not prepare the database automatically. Run `npm run setup` manually before using the app.",
    );
  }
}
