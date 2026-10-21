/**
 * Client-safe upload rules.
 *
 * The dropzone (a client component) needs to validate a file and format its
 * size BEFORE anything is sent to the server, so the shared limits live here
 * instead of in `storage.ts`, which touches the filesystem and `node:crypto`.
 */

const configuredMaxMb = Number(process.env.MAX_UPLOAD_MB ?? 10);
const effectiveMaxMb = Number.isFinite(configuredMaxMb) && configuredMaxMb > 0
  ? Math.min(configuredMaxMb, 25)
  : 10;
export const MAX_UPLOAD_BYTES = effectiveMaxMb * 1024 * 1024;

export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;

/** Client hint only. The server independently verifies the file signature. */
export function isAllowedType(mimeType: string, fileName: string): boolean {
  const type = mimeType.toLowerCase();
  const extension = fileName.split(".").pop()?.toLowerCase();
  const expected = extension === "pdf" ? "application/pdf"
    : extension === "jpg" || extension === "jpeg" ? "image/jpeg"
      : extension === "png" ? "image/png" : null;
  if (!expected) return false;
  return !type || type === "application/octet-stream" || type === expected || (expected === "image/jpeg" && type === "image/jpg");
}

export function formatBytes(bytes: number, locale = "en-IN"): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[index]}`;
}
