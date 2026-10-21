import { classifyLabResult, CLASSIFICATION_RULE_VERSION, metricKeyForTestName, parseReferenceRange } from "@/lib/health/metrics";
import { RECORD_TYPES, type RecordType } from "@/types/domain";
import type { ExtractedDocument, ExtractedLabValue, ExtractedMedicine, OcrPage, OcrTextResult } from "./types";

/**
 * Text → structure.
 *
 * This parser is the same one used for real OCR output, so the demo exercises
 * the production code path: whatever the OCR provider returns as text is turned
 * into medicines, lab values, dates and doctor details here, with a per-field
 * confidence score so the review screen can highlight what to double-check.
 */

const DOSE_SLOT_PATTERNS: { pattern: RegExp; slots: string[]; frequency: string }[] = [
  { pattern: /\b(qid|qds|four times|4 times)\b/i, slots: ["MORNING", "AFTERNOON", "EVENING", "NIGHT"], frequency: "Four times daily" },
  { pattern: /\b(tds|tid|thrice|three times|3 times)\b/i, slots: ["MORNING", "AFTERNOON", "NIGHT"], frequency: "Three times daily" },
  { pattern: /\b(bd|bid|twice|two times|2 times)\b/i, slots: ["MORNING", "NIGHT"], frequency: "Twice daily" },
  { pattern: /\b(od|qd|once daily|once a day|daily)\b/i, slots: ["MORNING"], frequency: "Once daily" },
  { pattern: /\b(hs|at bedtime|bedtime|night)\b/i, slots: ["NIGHT"], frequency: "At night" },
  { pattern: /\b(sos|prn|as needed|if needed)\b/i, slots: [], frequency: "When needed" },
];

const SLOT_ORDER = ["MORNING", "AFTERNOON", "EVENING", "NIGHT"] as const;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

// ── Dates ───────────────────────────────────────────────────────────────────

function makeValidDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

export function parseDateFromText(text: string): Date | null {
  const numeric = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    const year = Number(numeric[3]);
    const date = makeValidDate(year, month, day);
    if (date) return date;
  }

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = makeValidDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (date) return date;
  }

  const written = text.match(/\b(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{4})\b/);
  if (written) {
    const month = MONTHS[written[2].toLowerCase()];
    if (month !== undefined) {
      const date = makeValidDate(Number(written[3]), month, Number(written[1]));
      if (date) return date;
    }
  }

  const monthFirst = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    if (month !== undefined) {
      const date = makeValidDate(Number(monthFirst[3]), month, Number(monthFirst[2]));
      if (date) return date;
    }
  }

  return null;
}

// ── Medicines ───────────────────────────────────────────────────────────────

const DOSAGE_PATTERN = /\b(\d+(?:\.\d+)?)\s?(mg|mcg|g|ml|iu|units?|tabs?|tablets?|caps?|capsules?|drops?|puffs?)\b/i;
const DURATION_PATTERN =
  /\b(?:x|×|for|duration:?)?\s*(\d{1,3})\s*(day|days|week|weeks|month|months)\b/i;
const FORM_PREFIX = /^(tab\.?|tablet|caps?\.?|capsule|syp\.?|syrup|susp\.?|inj\.?|injection|oint\.?|ointment|drops?|inhaler|spray|cream|gel)\b\.?\s*/i;

function slotsFromFrequencyPhrase(phrase: string): { slots: string[]; frequency: string } | null {
  const ratio = phrase.match(/\b([01])\s*[-–]\s*([01])\s*[-–]\s*([01])\s*(?:[-–]\s*([01]))?\b/);
  if (ratio) {
    const values = [ratio[1], ratio[2], ratio[3], ratio[4] ?? "0"].map(Number);
    const slots = SLOT_ORDER.filter((_slot, index) => values[index] === 1);
    const count = values.slice(0, 3).reduce((sum, v) => sum + v, 0);
    const frequency =
      count === 4 ? "Four times daily" : count === 3 ? "Three times daily" : count === 2 ? "Twice daily" : "Once daily";
    return { slots: [...slots], frequency };
  }
  for (const entry of DOSE_SLOT_PATTERNS) {
    if (entry.pattern.test(phrase)) return { slots: [...entry.slots], frequency: entry.frequency };
  }
  return null;
}

function normaliseMedicineName(raw: string): string {
  return raw
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(FORM_PREFIX, "")
    .replace(/\s{2,}.*$/, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

export function parseMedicines(lines: string[]): ExtractedMedicine[] {
  const medicines: ExtractedMedicine[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 4) continue;
    const withoutIndex = trimmed.replace(/^\d+[.)]\s*/, "");
    const looksLikeMedicine =
      FORM_PREFIX.test(withoutIndex) ||
      /\b\d+(\.\d+)?\s?(mg|mcg|ml|g|iu)\b/i.test(trimmed) ||
      /\b(od|bd|tds|qid|hs|sos|prn)\b/i.test(trimmed);
    if (!looksLikeMedicine) continue;
    if (/^(diet|advice|follow|investigation|note|next visit)/i.test(withoutIndex)) continue;

    const dosageMatch = trimmed.match(DOSAGE_PATTERN);
    const durationMatch = trimmed.match(DURATION_PATTERN);
    const frequencyInfo = slotsFromFrequencyPhrase(trimmed);

    // The medicine name is everything before the first dosage / frequency marker.
    const nameCutIndex = [dosageMatch?.index, frequencyInfo ? trimmed.search(/\b(od|bd|tds|qid|hs|sos|prn)\b|\b[01]\s*[-–]\s*[01]/i) : -1]
      .filter((index): index is number => typeof index === "number" && index > 0)
      .sort((a, b) => a - b)[0];
    const namePart = nameCutIndex ? trimmed.slice(0, nameCutIndex) : trimmed;
    const name = normaliseMedicineName(namePart);
    if (!name || name.length < 2 || /^[^a-z]+$/i.test(name)) continue;
    if (medicines.some((m) => m.name.toLowerCase() === name.toLowerCase())) continue;

    const duration = durationMatch
      ? `${durationMatch[1]} ${Number(durationMatch[1]) === 1 ? durationMatch[2].replace(/s$/, "") : durationMatch[2]}`
      : null;

    const frequency = frequencyInfo?.frequency ?? null;
    const confidence = (dosageMatch ? 0.3 : 0) + (frequency ? 0.4 : 0) + (duration ? 0.2 : 0) + 0.1;

    medicines.push({
      name,
      dosage: dosageMatch ? `${dosageMatch[1]} ${dosageMatch[2].toLowerCase()}` : null,
      frequency,
      duration,
      slots: frequencyInfo?.slots ?? [],
      confidence: Math.min(0.98, Number(confidence.toFixed(2))),
    });
  }

  return medicines;
}

// ── Lab values ──────────────────────────────────────────────────────────────

const LAB_FLAGS = /^(?:HH|LL|CRITICAL(?:\s+(?:HIGH|LOW))?|PANIC|H|HIGH|L|LOW|↑|↓)$/i;
const UNIT_PATTERN =
  /^(g\/dl|gm\/dl|g\/l|mg\/dl|mg\/l|mmol\/l|µiu\/ml|μiu\/ml|uiu\/ml|miu\/l|iu\/l|ng\/ml|pg\/ml|%|bpm|kg|cm|mmhg|10\^?3\/[µu]l|cells\/[µu]l|million\/[µu]l|fl|pg|sec|mm\/hr|ratio|units?\/l)$/i;
const QUALITATIVE_VALUE = /^(?:positive|negative|not\s+detected|detected|non[- ]?reactive|reactive|present|absent|trace|normal|abnormal|indeterminate|equivocal)$/i;

function normalizeRangeText(text: string): string {
  const value = text.trim().replace(/(\d),(\d)/g, "$1$2");
  return parseReferenceRange(value) ? value : "";
}

function parseResultValue(raw: string): { value: string; numericValue: number | null } | null {
  const value = raw.trim().replace(/\s+/g, " ");
  if (!value) return null;
  // Keep inequalities as text: assigning the comparator's number as if it were
  // the measured value could create a false normal/abnormal classification.
  if (/^(?:<|>|≤|≥|<=|>=)\s*-?\d+(?:\.\d+)?$/.test(value)) {
    return { value, numericValue: null };
  }
  if (/^\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?$/.test(value)) {
    return { value: value.replace(/\s/g, ""), numericValue: Number(value.split("/")[0]) };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return { value, numericValue: Number(value) };
  if (QUALITATIVE_VALUE.test(value)) return { value, numericValue: null };
  return null;
}

export function parseLabValues(lines: string[], page?: OcrPage): ExtractedLabValue[] {
  const values: ExtractedLabValue[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 5) continue;
    if (/^(test|investigation|parameter|result|reference|unit|method)\b/i.test(trimmed)) continue;

    const cells = trimmed.split(/\s{2,}|\t+/).filter(Boolean);
    let testName = "";
    let rawResult = "";
    let unit: string | null = null;
    let referenceRange: string | null = null;
    let flag: string | null = null;

    if (cells.length >= 2) {
      testName = cells[0].trim().replace(/[:=]+$/, "");
      const rest = cells.slice(1).map((cell) => cell.trim());
      rawResult = rest.shift() ?? "";
      for (const cell of rest) {
        const range = normalizeRangeText(cell);
        if (range) referenceRange = range;
        else if (UNIT_PATTERN.test(cell)) unit = cell;
        else if (LAB_FLAGS.test(cell)) flag = cell.toUpperCase();
      }
    } else {
      const qualitative = trimmed.match(/^([A-Za-z][A-Za-z0-9 ,()\/.+\-]{2,60}?)\s*[:=]\s*(not\s+detected|detected|non[- ]?reactive|positive|negative|reactive|present|absent|trace|normal|abnormal|indeterminate|equivocal)$/i);
      if (qualitative) {
        testName = qualitative[1].trim();
        rawResult = qualitative[2].trim();
      } else {
        const compact = trimmed.replace(/(\d),(\d)/g, "$1$2").match(
          /^([A-Za-z][A-Za-z0-9 ,()\/.+\-]{2,60}?)\s+((?:<=|>=|[<>≤≥]\s*)?-?\d+(?:\.\d+)?|not\s+detected|non[- ]?reactive|positive|negative|detected|reactive|present|absent|trace|normal|abnormal|indeterminate|equivocal)(?:\s+([A-Za-zµμ%0-9/^³]+))?(?:\s+(.+?))?\s*$/i,
        );
        if (!compact) continue;
        testName = compact[1].trim();
        rawResult = compact[2].trim();
        if (compact[3] && UNIT_PATTERN.test(compact[3])) unit = compact[3];
        const trailing = compact[4]?.trim();
        if (trailing) {
          const range = normalizeRangeText(trailing);
          if (range) referenceRange = range;
          else if (LAB_FLAGS.test(trailing)) flag = trailing.toUpperCase();
        }
      }
    }

    // If the result cell contains a value followed by its unit, split only when
    // the entire trailing token is a recognized unit; never guess conversions.
    const unitInValue = rawResult.match(/^(.*?)(?:\s+)([A-Za-zµμ%0-9/^³]+)$/);
    if (!unit && unitInValue && UNIT_PATTERN.test(unitInValue[2])) {
      rawResult = unitInValue[1].trim();
      unit = unitInValue[2];
    }
    const parsed = parseResultValue(rawResult);
    if (!parsed) continue;

    const cleanName = testName.replace(/[.,;:]+$/, "").trim();
    if (cleanName.length < 3 || /^(date|name|age|sex|patient|doctor|lab no|sample|ref by|printed)/i.test(cleanName)) continue;
    const metricKey = metricKeyForTestName(cleanName);
    const rawConfidence = 0.55 + (unit ? 0.12 : 0) + (referenceRange ? 0.16 : 0) + (metricKey ? 0.12 : 0) + (flag ? 0.05 : 0);
    const confidence = Math.min(0.99, rawConfidence * (page?.confidence ?? 0.9));
    const classification = classifyLabResult({
      value: parsed.numericValue,
      unit,
      referenceRange,
      sourceFlag: flag,
      confidence,
    });
    const warnings: string[] = [];
    if (confidence < 0.75) warnings.push("Extraction confidence is low; compare this value with the source document.");
    if (classification.status === "UNKNOWN" && parsed.numericValue !== null) warnings.push(classification.reason);

    if (values.some((value) => value.testName.toLowerCase() === cleanName.toLowerCase())) continue;
    values.push({
      testName: cleanName,
      metricKey,
      value: parsed.value,
      numericValue: parsed.numericValue,
      unit,
      referenceRange,
      status: classification.status,
      classificationReason: classification.reason,
      classificationRuleVersion: CLASSIFICATION_RULE_VERSION,
      criticalFlag: classification.criticalFlag,
      confidence: Number(confidence.toFixed(2)),
      sourceText: trimmed,
      sourcePage: page?.pageNumber ?? null,
      warnings,
    });
  }
  return values;
}

// ── Header fields ───────────────────────────────────────────────────────────

export function parseDoctorName(text: string): string | null {
  const match = text.match(/\b(?:dr|doctor)\.?\s*([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/);
  if (!match) return null;
  const name = match[1].replace(/\s+/g, " ").trim();
  if (/^(dr|doctor)/i.test(name)) return null;
  // Drop trailing qualification noise like "MD" / "MBBS" when it got captured.
  return name.replace(/\s+(md|mbbs|ms|dnb|dm|frca|mph)$/i, "").trim() || null;
}

export function parseFacilityName(lines: string[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 5 || trimmed.length > 80) continue;
    if (/\b(hospital|clinic|diagnostics?|laboratory|lab|medical cent(er|re)|health cent(er|re)|nursing home|pathology)\b/i.test(trimmed)) {
      if (/\b(dr|doctor)\b/i.test(trimmed) && !/\b(hospital|clinic|diagnostics|lab)\b/i.test(trimmed)) continue;
      return trimmed.replace(/\s{2,}.*$/, "").replace(/[|•]+$/, "").trim();
    }
  }
  return null;
}

const DIAGNOSIS_LABEL = /^(diagnosis|provisional diagnosis|impression|complaint[s]?|chief complaint[s]?|advice|assessment)\b\s*[:\-]?\s*(.*)$/i;

export function parseDiagnosisTerms(lines: string[]): string[] {
  const terms: string[] = [];
  for (const line of lines) {
    const match = line.trim().match(DIAGNOSIS_LABEL);
    if (!match) continue;
    const body = (match[2] || "").trim();
    const label = match[1].toLowerCase();
    if (!body) continue;
    const pieces = body
      .split(/[,;•]|\s+and\s+/i)
      .map((piece) => piece.trim())
      .filter((piece) => piece.length > 2 && piece.length < 80);
    for (const piece of pieces) {
      const cleaned = piece.replace(/^\d+[.)]\s*/, "").trim();
      if (!cleaned) continue;
      if (/^advice$/i.test(label) && terms.length > 6) continue;
      if (!terms.some((term) => term.toLowerCase() === cleaned.toLowerCase())) terms.push(cleaned);
    }
  }
  return terms.slice(0, 12);
}

export function inferDocumentType(text: string, hint?: RecordType): RecordType {
  if (hint) return hint;
  const t = text.toLowerCase();
  if (/\b(prescription|rx|advice|tab\.|syp\.|dose|dosage|sig)\b/.test(t) && !/\b(hb|haemoglobin|hemoglobin)\b/.test(t)) {
    return "PRESCRIPTION";
  }
  if (/\b(discharge|admitted|admission|ip no|date of discharge)\b/.test(t)) return "DISCHARGE_SUMMARY";
  if (/\b(vaccine|vaccination|immunis|immuniz|dose no)\b/.test(t)) return "VACCINATION";
  if (/\b(x-ray|ultrasound|usg|ct scan|mri|scan report|impression:)\b/.test(t)) return "IMAGING";
  if (/\b(lab|pathology|reference (range|value)|investigation|report)\b/.test(t)) return "LAB_REPORT";
  if (/\b(consultation|visit|opd|follow up)\b/.test(t)) return "DOCTOR_VISIT";
  return "LAB_REPORT";
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function parseDocument(ocr: OcrTextResult, hint?: RecordType): ExtractedDocument {
  const pages = ocr.pages?.length ? ocr.pages : [{ pageNumber: 1, text: ocr.text, confidence: ocr.confidence, source: "TESSERACT" as const }];
  const lines = pages.flatMap((page) => page.text.split(/\r?\n/).map((line) => line.replace(/\s+$/, "")));
  const documentType = inferDocumentType(ocr.text, hint);

  const medicines = documentType === "PRESCRIPTION" || /\b(tab\.|syp\.|caps\.|rx)\b/i.test(ocr.text)
    ? parseMedicines(lines)
    : [];
  const labValues = pages.flatMap((page) =>
    parseLabValues(page.text.split(/\r?\n/).map((line) => line.replace(/\s+$/, "")), page),
  );
  const diagnosisTerms = parseDiagnosisTerms(lines);
  const doctorName = parseDoctorName(ocr.text);
  const facilityName = parseFacilityName(lines);
  const recordDate = parseDateFromText(ocr.text);

  const lowConfidenceFields: string[] = [];
  if (!recordDate) lowConfidenceFields.push("recordDate");
  if (!doctorName) lowConfidenceFields.push("doctorName");
  if (!facilityName) lowConfidenceFields.push("facilityName");
  medicines.forEach((medicine, index) => {
    if (medicine.confidence < 0.7) lowConfidenceFields.push(`medicines.${index}`);
  });
  labValues.forEach((value, index) => {
    if (value.confidence < 0.7) lowConfidenceFields.push(`labValues.${index}`);
  });

  const fieldConfidences = [
    ...medicines.map((m) => m.confidence),
    ...labValues.map((v) => v.confidence),
    recordDate ? 0.95 : 0.4,
  ];
  const confidence = fieldConfidences.length
    ? fieldConfidences.reduce((sum, value) => sum + value, 0) / fieldConfidences.length
    : ocr.confidence;

  const notes = lines
    .map((line) => line.trim())
    .filter((line) => /^(advice|note|diet|follow up|review after)\b/i.test(line))
    .slice(0, 6);

  return {
    documentType: RECORD_TYPES.includes(documentType) ? documentType : "OTHER",
    recordDate,
    doctorName,
    facilityName,
    medicines,
    labValues,
    diagnosisTerms,
    notes,
    confidence: Number(confidence.toFixed(2)),
    lowConfidenceFields,
    warnings: ocr.warnings,
    provider: ocr.provider,
    rawText: ocr.text,
  };
}
