import { DocumentInputError, validateDocumentBytes } from "./validation";
import { MockOcrProvider } from "./mock-provider";
import { TesseractOcrProvider } from "./tesseract-provider";
import type { OcrInput, OcrProvider, OcrTextResult, ExtractedDocument } from "./types";
import { parseDocument } from "./parser";
import type { RecordType } from "@/types/domain";

export * from "./types";
export { parseDocument } from "./parser";
export { validateDocumentBytes, DocumentInputError } from "./validation";
export { SAMPLE_KEYS, pickSample, buildMockDocumentText } from "./mock-provider";
export type { SampleKey } from "./mock-provider";

let cached: OcrProvider | null = null;

/**
 * OCR provider boundary. Local Tesseract is the default and never sends the
 * document to a third party. Demo OCR is opt-in only; unknown provider names
 * fail closed instead of silently manufacturing mock results.
 */
export function getOcrProvider(): OcrProvider {
  if (cached) return cached;
  const requested = (process.env.OCR_PROVIDER ?? "tesseract").trim().toLowerCase();
  if (requested === "mock") cached = new MockOcrProvider();
  else if (requested === "tesseract" || requested === "local-tesseract") cached = new TesseractOcrProvider();
  else throw new DocumentInputError("OCR_PROVIDER_UNAVAILABLE", `OCR provider '${requested}' is not implemented.`);
  return cached;
}

export function isMockOcr(): boolean {
  return getOcrProvider().isMock;
}

export async function readDocument(
  input: OcrInput,
  hint?: RecordType,
): Promise<{ extracted: ExtractedDocument; ocr: OcrTextResult }> {
  const detected = await validateDocumentBytes(input.buffer, input.mimeType);
  const provider = getOcrProvider();
  const validatedInput = { ...input, mimeType: detected.mimeType };
  const ocr = detected.mimeType === "application/pdf"
    ? await provider.extractTextFromPdf(validatedInput)
    : await provider.extractTextFromImage(validatedInput);

  if (!ocr.text.trim() || ocr.failed) throw new DocumentInputError("OCR_EMPTY");
  return { extracted: parseDocument(ocr, hint), ocr };
}
