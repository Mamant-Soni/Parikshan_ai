import { fileTypeFromBuffer } from "file-type";
import { imageSize } from "image-size";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";

export const MAX_DOCUMENT_PAGES = 20;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const MAX_IMAGE_EDGE = 10_000;

export type SupportedDocumentMime = "application/pdf" | "image/jpeg" | "image/png";

export class DocumentInputError extends Error {
  constructor(
    readonly code:
      | "INVALID_DOCUMENT"
      | "TOO_LARGE"
      | "UNSUPPORTED_DOCUMENT"
      | "MIME_MISMATCH"
      | "IMAGE_DIMENSIONS_INVALID"
      | "IMAGE_TOO_LARGE"
      | "PDF_ENCRYPTED"
      | "PDF_TOO_MANY_PAGES"
      | "OCR_EMPTY"
      | "OCR_PROVIDER_UNAVAILABLE",
    message: string = code,
  ) {
    super(message);
    this.name = "DocumentInputError";
  }
}

/** Validate bytes, not the browser-provided name or Content-Type. */
export async function validateDocumentBytes(
  buffer: Buffer,
  declaredMimeType?: string | null,
): Promise<{ mimeType: SupportedDocumentMime; width?: number; height?: number }> {
  if (buffer.length > MAX_UPLOAD_BYTES) throw new DocumentInputError("TOO_LARGE");
  if (buffer.length < 8) throw new DocumentInputError("INVALID_DOCUMENT");
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) throw new DocumentInputError("INVALID_DOCUMENT");

  const mimeType = detected.mime;
  if (mimeType !== "application/pdf" && mimeType !== "image/jpeg" && mimeType !== "image/png") {
    throw new DocumentInputError("UNSUPPORTED_DOCUMENT");
  }

  const declared = (declaredMimeType ?? "").toLowerCase();
  const compatibleDeclared = !declared || declared === "application/octet-stream" ||
    declared === mimeType || (mimeType === "image/jpeg" && declared === "image/jpg");
  if (!compatibleDeclared) throw new DocumentInputError("MIME_MISMATCH");

  if (mimeType !== "application/pdf") {
    let dimensions: { width?: number; height?: number };
    try {
      dimensions = imageSize(buffer);
    } catch {
      throw new DocumentInputError("INVALID_DOCUMENT");
    }
    const { width, height } = dimensions;
    if (!width || !height || width < 64 || height < 64) {
      throw new DocumentInputError("IMAGE_DIMENSIONS_INVALID");
    }
    if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE || width * height > MAX_IMAGE_PIXELS) {
      throw new DocumentInputError("IMAGE_TOO_LARGE");
    }
    return { mimeType, width, height };
  }

  return { mimeType };
}
