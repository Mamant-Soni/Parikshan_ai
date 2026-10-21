import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { readUploadedFile, removeUploadedFile, saveUploadedFile } from "@/lib/uploads/storage";

test("private upload storage uses random profile-scoped paths and rejects traversal", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "parikshan-uploads-"));
  const previousRoot = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = root;
  try {
    const content = Buffer.from("synthetic document bytes");
    const stored = await saveUploadedFile(content, "patient-report.pdf", "application/pdf", "profile_1");
    assert.equal(stored.relativePath.startsWith(`profile_1${path.sep}`), true);
    assert.equal(path.basename(stored.relativePath).includes("patient-report"), false);
    assert.deepEqual(await readUploadedFile(stored.relativePath), content);
    assert.deepEqual(await readFile(stored.absolutePath), content);
    assert.equal((await stat(stored.absolutePath)).mode & 0o777, 0o600);
    assert.equal((await stat(path.dirname(stored.absolutePath))).mode & 0o777, 0o700);
    await assert.rejects(readUploadedFile("../outside.pdf"), /INVALID_PATH/);
    await removeUploadedFile(stored.relativePath);
    await assert.rejects(stat(stored.absolutePath));
  } finally {
    if (previousRoot === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});
