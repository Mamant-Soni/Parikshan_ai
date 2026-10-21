import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_UPLOAD_BYTES } from "./limits";

/**
 * Uploaded-file storage.
 *
 * Files are written OUTSIDE the web root (default ./data/uploads) and are only
 * ever streamed back through /api/records/[id]/file, which checks profile
 * ownership first. Nothing in this folder is publicly addressable, and file
 * names are randomised so an uploaded prescription cannot be guessed by URL.
 *
 * PRODUCTION: replace this module with object storage (S3/GCS) using
 * server-side encryption, customer-managed keys, signed short-lived URLs and
 * an audit trail per access — see the README deployment section.
 */

// Upload limits and MIME rules are also needed by the browser-side dropzone,
// so they live in a client-safe module and are re-exported here for the server.
export { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, formatBytes, isAllowedType } from "./limits";

export function uploadRoot(): string {
  const configured = process.env.UPLOAD_DIR ?? "./data/uploads";
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function extensionFor(fileName: string, mimeType: string): string {
  const fromName = path.extname(fileName).toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/heic":
    case "image/heif":
      return ".heic";
    default:
      return ".jpg";
  }
}

export type StoredFile = {
  /** Path relative to the upload root — stored in the database. */
  relativePath: string;
  absolutePath: string;
  size: number;
};

export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  profileId: string,
): Promise<StoredFile> {
  const directory = path.join(uploadRoot(), profileId);
  await mkdir(directory, { recursive: true });

  const fileName = `${Date.now()}-${randomUUID()}${extensionFor(originalName, mimeType)}`;
  const absolutePath = path.join(directory, fileName);
  await writeFile(absolutePath, buffer, { mode: 0o600 });

  const info = await stat(absolutePath);
  return {
    relativePath: path.join(profileId, fileName),
    absolutePath,
    size: info.size,
  };
}

export async function readUploadedFile(relativePath: string): Promise<Buffer> {
  const absolute = path.join(uploadRoot(), relativePath);
  // Guard against path traversal in a stored value.
  if (!absolute.startsWith(uploadRoot())) throw new Error("INVALID_PATH");
  return readFile(absolute);
}

export async function removeUploadedFile(relativePath: string): Promise<void> {
  try {
    const absolute = path.join(uploadRoot(), relativePath);
    if (!absolute.startsWith(uploadRoot())) return;
    await unlink(absolute);
  } catch {
    // A missing file must not block account deletion.
  }
}
