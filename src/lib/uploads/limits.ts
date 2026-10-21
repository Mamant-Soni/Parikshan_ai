/**
 * Client-safe upload rules.
 *
 * The dropzone (a client component) needs to validate a file and format its
 * size BEFORE anything is sent to the server, so the shared limits live here
 * instead of in `storage.ts`, which touches the filesystem and `node:crypto`.
 */

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

export function isAllowedType(mimeType: string, fileName: string): boolean {
  if (ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) return true;
  // Some browsers send an empty type for camera captures / HEIC files.
  return /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(fileName) && (!mimeType || mimeType === "application/octet-stream");
}

export function formatBytes(bytes: number, locale = "en-IN"): string {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[index]}`;
}
