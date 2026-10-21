import { mkdir, writeFile, readFile, unlink, stat, chmod } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_UPLOAD_BYTES } from "./limits";

/** Private local storage. Production deployments should provide encrypted object storage. */
export { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, formatBytes, isAllowedType } from "./limits";

export function uploadRoot(): string {
  const configured = process.env.UPLOAD_DIR ?? "./data/uploads";
  return path.resolve(configured);
}

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf": return ".pdf";
    case "image/png": return ".png";
    case "image/jpeg": return ".jpg";
    default: throw new Error("UNSUPPORTED_DOCUMENT");
  }
}

export type StoredFile = { relativePath: string; absolutePath: string; size: number };

export async function saveUploadedFile(
  buffer: Buffer,
  _originalName: string,
  mimeType: string,
  profileId: string,
): Promise<StoredFile> {
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) throw new Error("INVALID_FILE_SIZE");
  const root = uploadRoot();
  const safeProfileId = profileId.replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeProfileId || safeProfileId !== profileId) throw new Error("INVALID_PROFILE_PATH");
  const directory = path.join(root, safeProfileId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);

  const fileName = `${Date.now()}-${randomUUID()}${extensionFor(mimeType)}`;
  const absolutePath = path.join(directory, fileName);
  await writeFile(absolutePath, buffer, { mode: 0o600, flag: "wx" });
  const info = await stat(absolutePath);
  return { relativePath: path.join(safeProfileId, fileName), absolutePath, size: info.size };
}

function resolveStoredPath(relativePath: string): string {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error("INVALID_PATH");
  const root = uploadRoot();
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    throw new Error("INVALID_PATH");
  }
  return absolute;
}

export async function readUploadedFile(relativePath: string): Promise<Buffer> {
  return readFile(resolveStoredPath(relativePath));
}

export async function removeUploadedFile(relativePath: string): Promise<void> {
  try {
    await unlink(resolveStoredPath(relativePath));
  } catch {
    // Missing files should not block record/account cleanup.
  }
}
