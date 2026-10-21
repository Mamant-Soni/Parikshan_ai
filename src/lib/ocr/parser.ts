import { evaluateAgainstRange, metricKeyForTestName } from "@/lib/health/metrics";
import { RECORD_TYPES, type RecordType } from "@/types/domain";
import type { ExtractedDocument, ExtractedLabValue, ExtractedMedicine, OcrTextResult } from "./types";

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

export function parseDateFromText(text: string): Date | null {
  const numeric = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    const year = Number(numeric[3]);
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime()) && day <= 31 && month >= 0 && month <= 11) return date;
  }

  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const written = text.match(/\b(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,-]+(\d{4})\b/);
  if (written) {
    const month = MONTHS[written[2].toLowerCase()];
    if (month !== undefined) {
      const date = new Date(Number(written[3]), month, Number(written[1]));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  const monthFirst = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (monthFirst) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    if (month !== undefined) {
      const date = new Date(Number(monthFirst[3]), month, Number(monthFirst[2]));
      if (!Number.isNaN(date.getTime())) return date;
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

const LAB_FLAGS = /^(h|high|l|low|hh|ll|critical|abnormal|↑|↓)\b/i;
const UNIT_PATTERN =
  /^(g\/dl|gm\/dl|mg\/dl|mg\/l|mmol\/l|µiu\/ml|uiu\/ml|miu\/l|iu\/l|ng\/ml|pg\/ml|%|bpm|kg|cm|mmhg|10\^?3\/[µu]l|cells\/[µu]l|million\/[µu]l|fl|pg|sec|mm\/hr|ratio|units?\/l)$/i;

export function parseLabValues(lines: string[]): ExtractedLabValue[] {
  const values: ExtractedLabValue[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 6) continue;
    if (/^(test|investigation|parameter|result|reference|unit|method)\b/i.test(trimmed)) continue;

    // Split on 2+ spaces (the way lab reports are laid out) or on the first digit run.
    const cells = trimmed.split(/\s{2,}|\t+/).filter(Boolean);
    let testName = "";
    let valueToken = "";
    let unit: string | null = null;
    let referenceRange: string | null = null;
    let flag: string | null = null;

    if (cells.length >= 2) {
      testName = cells[0];
      const rest = cells.slice(1).map((cell) => cell.trim().replace(/(\d),(\d)/g, "$1$2"));
      valueToken = rest[0] ?? "";
      for (const cell of rest.slice(1)) {
        if (UNIT_PATTERN.test(cell)) unit = cell;
        else if (/^-?\d+(\.\d+)?\s*(-|to|–)\s*-?\d+(\.\d+)?$/.test(cell)) referenceRange = cell;
        else if (LAB_FLAGS.test(cell)) flag = cell.toUpperCase();
      }
    } else {
      const single = trimmed.replace(/(\d),(\d)/g, "$1$2").match(
        /^([A-Za-z][A-Za-z0-9 ,()\/.\-]{2,60}?)\s+(-?\d+(?:\.\d+)?)\s*([A-Za-z%µ\/^0-9]{0,12})?\s*([<>]?\s*-?\d+(?:\.\d+)?\s*(?:-|to|–)\s*-?\d+(?:\.\d+)?)?\s*(H|L|HIGH|LOW)?$/i,
      );
      if (!single) continue;
      testName = single[1];
      valueToken = single[2];
      unit = single[3] && UNIT_PATTERN.test(single[3]) ? single[3] : null;
      referenceRange = single[4]?.trim() ?? null;
      flag = single[5]?.toUpperCase() ?? null;
    }

    if (!valueToken) continue;
    const numericMatch = valueToken.match(/-?\d+(?:\.\d+)?/);
    if (!numericMatch) continue;
    const numericValue = Number(numericMatch[0]);
    if (!Number.isFinite(numericValue)) continue;

    const cleanName = testName.replace(/[.,;:]+$/, "").trim();
    if (cleanName.length < 3) continue;
    if (/^(date|name|age|sex|patient|doctor|lab no|sample|ref by|printed)/i.test(cleanName)) continue;

    const metricKey = metricKeyForTestName(cleanName);
    let status = evaluateAgainstRange(numericValue, referenceRange);
    if (status === "UNKNOWN" && flag) {
      if (flag.startsWith("H")) status = "ABOVE_RANGE";
      else if (flag.startsWith("L")) status = "BELOW_RANGE";
    }

    if (values.some((v) => v.testName.toLowerCase() === cleanName.toLowerCase())) continue;

    const confidence = 0.6 + (unit ? 0.2 : 0) + (referenceRange ? 0.15 : 0) + (metricKey ? 0.05 : 0);

    values.push({
      testName: cleanName,
      metricKey,
      value: numericMatch[0],
      numericValue,
      unit,
      referenceRange,
      status,
      confidence: Math.min(0.98, Number(confidence.toFixed(2))),
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
  const lines = ocr.text.split(/\r?\n/).map((line) => line.replace(/\s+$/, ""));
  const documentType = inferDocumentType(ocr.text, hint);

  const medicines = documentType === "PRESCRIPTION" || /\b(tab\.|syp\.|caps\.|rx)\b/i.test(ocr.text)
    ? parseMedicines(lines)
    : [];
  const labValues = parseLabValues(lines);
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
