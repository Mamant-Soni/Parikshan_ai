import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

/**
 * Creates a throw-away SQLite database for service-level tests. The schema is
 * pushed once into a template file (cached per schema hash in the OS temp dir)
 * and copied for each test file, so tests never touch prisma/dev.db.
 * Must be called BEFORE the Prisma client module is imported (the client reads
 * DATABASE_URL on import).
 */
export function useTempDatabase(): string {
  const schema = readFileSync(path.join(process.cwd(), "prisma/schema.prisma"));
  const hash = createHash("sha256").update(schema).digest("hex").slice(0, 16);
  const template = path.join(os.tmpdir(), `phc-schema-${hash}.db`);
  if (!existsSync(template)) {
    execFileSync(process.execPath, [path.join(process.cwd(), "node_modules/prisma/build/index.js"), "db", "push", "--skip-generate", "--accept-data-loss"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: `file:${template}`,
        CHECKPOINT_DISABLE: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
        PRISMA_SCHEMA_ENGINE_BINARY: "/bin/true",
        PRISMA_QUERY_ENGINE_LIBRARY: "/bin/true",
      },
      stdio: "pipe",
    });
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), "phc-test-"));
  const file = path.join(dir, "test.db");
  copyFileSync(template, file);
  const url = `file:${file}`;
  process.env.DATABASE_URL = url;
  return url;
}

export async function makeUser(prisma: import("@prisma/client").PrismaClient, label: string) {
  const user = await prisma.user.create({
    data: { name: `Test ${label}`, email: `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test` },
  });
  const profile = await prisma.healthProfile.create({
    data: { userId: user.id, name: `Profile ${label}`, isPrimary: true, isDemo: false },
  });
  await prisma.user.update({ where: { id: user.id }, data: { activeProfileId: profile.id } });
  return { user, profile };
}
