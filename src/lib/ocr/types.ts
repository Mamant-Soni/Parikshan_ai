import type { RecordType, ResultStatus } from "@/types/domain";

export type OcrPageSource = "PDF_TEXT" | "TESSERACT" | "DEMO";
export type OcrPage = {
  pageNumber: number;
  text: string;
  /** Engine confidence normalized to 0..1; PDF text layers use 0.98. */
  confidence: number;
  source: OcrPageSource;
};

export type OcrInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  /** Explicit synthetic template key; accepted only by the opt-in demo provider. */
  sampleKey?: string;
  /** Optional explicit document-type hint from the user. */
  hint?: RecordType;
  documentType?: RecordType;
};

export type OcrTextResult = {
  text: string;
  confidence: number;
  provider: string;
  pageCount: number;
  pages: OcrPage[];
  warnings: string[];
  failed?: boolean;
};

export interface OcrProvider {
  readonly name: string;
  readonly isMock: boolean;
  extractTextFromImage(input: OcrInput): Promise<OcrTextResult>;
  extractTextFromPdf(input: OcrInput): Promise<OcrTextResult>;
}

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
  /** Original result as printed, including qualitative values. */
  value: string;
  numericValue: number | null;
  unit: string | null;
  referenceRange: string | null;
  status: ResultStatus;
  classificationReason: string;
  classificationRuleVersion: string;
  criticalFlag: boolean;
  confidence: number;
  sourceText: string;
  sourcePage: number | null;
  warnings: string[];
};

export type ExtractedDocument = {
  documentType: RecordType;
  recordDate: Date | null;
  doctorName: string | null;
  facilityName: string | null;
  medicines: ExtractedMedicine[];
  labValues: ExtractedLabValue[];
  diagnosisTerms: string[];
  notes: string[];
  confidence: number;
  lowConfidenceFields: string[];
  warnings: string[];
  provider: string;
  rawText: string;
};
