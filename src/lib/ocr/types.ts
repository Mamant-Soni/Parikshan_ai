import type { RecordType, ResultStatus } from "@/types/domain";

/**
 * OCR abstraction.
 *
 * The rest of the application never talks to a vendor SDK directly: it calls
 * `getOcrProvider()` (see ./index.ts) and receives normalised text + a
 * confidence score. Swapping the demo provider for Tesseract, Google Vision,
 * Azure Document Intelligence or AWS Textract is a change in this folder only.
 *
 * Pipeline contract:
 *   file bytes  ->  extractText()  ->  parseDocument() (../ocr/parser.ts)
 *               ->  candidate record  ->  human review  ->  save
 */

export type OcrInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  /** Optional hint from the user ("this is a prescription"). */
  hint?: RecordType;
  /** Document type the user selected on the upload screen. */
  documentType?: RecordType;
};

export type OcrTextResult = {
  text: string;
  /** 0..1 — surfaced in the review screen so users know what to double-check. */
  confidence: number;
  provider: string;
  pageCount: number;
  /** Human-readable reasons a field may be wrong (handwriting, blur, low light). */
  warnings: string[];
  /** Provider could not read the document at all. */
  failed?: boolean;
};

export interface OcrProvider {
  readonly name: string;
  readonly isMock: boolean;
  extractTextFromImage(input: OcrInput): Promise<OcrTextResult>;
  extractTextFromPdf(input: OcrInput): Promise<OcrTextResult>;
  /** Providers with native document understanding can bypass the regex parser. */
  extractStructuredFields?(input: OcrInput): Promise<Partial<ExtractedDocument> | null>;
}

// ── Structured extraction produced by the parser ────────────────────────────

export type ExtractedMedicine = {
  name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  slots: string[];
  confidence: number;
};

export type ExtractedLabValue = {
  testName: string;
  metricKey: string | null;
  value: string;
  numericValue: number | null;
  unit: string | null;
  referenceRange: string | null;
  status: ResultStatus;
  confidence: number;
};

export type ExtractedDocument = {
  documentType: RecordType;
  recordDate: Date | null;
  doctorName: string | null;
  facilityName: string | null;
  medicines: ExtractedMedicine[];
  labValues: ExtractedLabValue[];
  diagnosisTerms: string[];
  /** Free-text notes the parser could not classify (e.g. advice lines). */
  notes: string[];
  confidence: number;
  lowConfidenceFields: string[];
  warnings: string[];
  provider: string;
  rawText: string;
};
