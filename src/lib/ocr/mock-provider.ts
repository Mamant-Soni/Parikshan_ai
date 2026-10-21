import type { OcrInput, OcrProvider, OcrTextResult } from "./types";

/**
 * Demo OCR provider.
 *
 * It returns realistic document text so the whole pipeline (upload → OCR →
 * parse → review → save → summarise → trends) can be demonstrated without any
 * external API or credentials.
 *
 * HONESTY NOTE: this provider does not actually read the pixels of the uploaded
 * file. It composes a plausible document based on the file name / sample hint,
 * which is exactly why the review screen always asks the user to confirm the
 * extracted values before they are saved. Replace it via OCR_PROVIDER (see
 * ./index.ts and the README section "How to replace mock OCR with production OCR").
 */

export type SampleKey =
  | "blood-report"
  | "lipid-profile"
  | "diabetes-panel"
  | "thyroid-panel"
  | "vitamin-panel"
  | "prescription"
  | "doctor-visit"
  | "vaccination"
  | "bp-log";

export const SAMPLE_KEYS: SampleKey[] = [
  "prescription",
  "blood-report",
  "lipid-profile",
  "diabetes-panel",
  "thyroid-panel",
  "vitamin-panel",
  "doctor-visit",
  "vaccination",
  "bp-log",
];

const KEYWORD_TO_SAMPLE: { keywords: string[]; sample: SampleKey }[] = [
  { keywords: ["prescription", "rx", "medicine", "meds", "dawai", "दवा", "opd-slip"], sample: "prescription" },
  { keywords: ["lipid", "cholesterol", "heart", "ldl"], sample: "lipid-profile" },
  { keywords: ["sugar", "diabet", "glucose", "hba1c", "fasting"], sample: "diabetes-panel" },
  { keywords: ["thyroid", "tsh", "t3", "t4"], sample: "thyroid-panel" },
  { keywords: ["vitamin", "d3", "b12", "calcium"], sample: "vitamin-panel" },
  { keywords: ["visit", "consult", "clinic-note", "opd"], sample: "doctor-visit" },
  { keywords: ["bp", "pressure", "heart-rate", "pulse"], sample: "bp-log" },
  { keywords: ["vaccin", "immunis", "immuniz", "booster", "dose-card"], sample: "vaccination" },
  { keywords: ["blood", "cbc", "haemogram", "hemogram", "anemia", "report"], sample: "blood-report" },
];

function hash(input: string): number {
  let h = 0;
  for (let index = 0; index < input.length; index += 1) {
    h = (h * 31 + input.charCodeAt(index)) >>> 0;
  }
  return h;
}

function shiftDays(base: Date, days: number): Date {
  const date = new Date(base);
  date.setDate(date.getDate() - days);
  return date;
}

function formatDateLike(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(date.getDate()).padStart(2, "0")} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/** Chooses a document template. Samples win over file-name keywords, else hashed. */
/** Document type → representative demo template, used when no sample is given. */
const TYPE_TO_SAMPLE: Record<string, SampleKey> = {
  PRESCRIPTION: "prescription",
  LAB_REPORT: "blood-report",
  DOCTOR_VISIT: "doctor-visit",
  VACCINATION: "vaccination",
  DISCHARGE_SUMMARY: "doctor-visit",
  IMAGING: "doctor-visit",
  OTHER: "blood-report",
};

export function pickSample(input: {
  fileName: string;
  sampleKey?: string;
  documentType?: string;
}): SampleKey {
  if (input.sampleKey && (SAMPLE_KEYS as string[]).includes(input.sampleKey)) {
    return input.sampleKey as SampleKey;
  }
  // The user told us what the document is — honour that before guessing from
  // the file name ("scan.pdf" tells us nothing).
  const byType = input.documentType ? TYPE_TO_SAMPLE[input.documentType] : undefined;
  if (byType) return byType;

  const name = input.fileName.toLowerCase();
  for (const entry of KEYWORD_TO_SAMPLE) {
    if (entry.keywords.some((keyword) => name.includes(keyword))) return entry.sample;
  }
  return SAMPLE_KEYS[hash(name) % SAMPLE_KEYS.length];
}

type TemplateContext = { patientName: string; date: Date };

/** Builds the raw text an OCR engine would return for the chosen sample. */
export function buildMockDocumentText(sample: SampleKey, ctx: TemplateContext): string {
  const d = formatDateLike(ctx.date);
  const patient = ctx.patientName;

  switch (sample) {
    case "prescription":
      return [
        "SUNRISE FAMILY CLINIC",
        "12 Gandhi Road, Pune 411001   Ph: 020-2456 7788",
        `Date: ${d}`,
        "",
        `Patient: ${patient}          Age/Sex: 34/M`,
        "OPD No: 2291",
        "",
        "Diagnosis: Acute upper respiratory infection",
        "",
        "Rx",
        "1. Tab. Paracetamol 500 mg        1-0-1        x 5 days",
        "2. Tab. Amoxicillin 500 mg        1-1-1        x 7 days",
        "3. Tab. Cetirizine 10 mg          HS           x 5 days",
        "",
        "Advice: Take rest and drink warm water.",
        "Follow up after 1 week if fever persists.",
        "",
        "Dr. Anil Mehta",
        "MBBS, MD (General Medicine)",
      ].join("\n");

    case "blood-report":
      return [
        "CITY DIAGNOSTICS CENTRE",
        "NABL Accredited Pathology Laboratory",
        `Report Date: ${d}`,
        `Patient Name: ${patient}        Age/Sex: 34/M`,
        "Patient ID: CD-22911",
        "Referred By: Dr. Anil Mehta",
        "",
        "COMPLETE BLOOD COUNT",
        "Test Name                                Result        Unit          Reference Range",
        "Hemoglobin                               11.0          g/dL          13.0 - 17.0        L",
        "Total Leucocyte Count                    7600          10^3/uL       4000 - 11000",
        "Platelet Count                           245000        10^3/uL       150000 - 410000",
        "RBC Count                                4.5           million/uL    4.5 - 5.5",
        "Hematocrit                               38.2          %             40 - 50            L",
        "MCV                                      84.0          fL            80 - 100",
        "",
        "BIOCHEMISTRY",
        "Glucose, Fasting                         108           mg/dL         70 - 100           H",
        "Creatinine                               0.9           mg/dL         0.7 - 1.3",
        "",
        "Reported by: Dr. S. Nair (Pathologist)",
        "End of report",
      ].join("\n");

    case "lipid-profile":
      return [
        "CITY DIAGNOSTICS CENTRE",
        `Report Date: ${d}`,
        `Patient Name: ${patient}`,
        "Referred By: Dr. Anil Mehta",
        "",
        "LIPID PROFILE",
        "Test Name                                Result        Unit          Reference Range",
        "Total Cholesterol                        212           mg/dL         125 - 200          H",
        "LDL Cholesterol                          138           mg/dL         50 - 130           H",
        "HDL Cholesterol                          42            mg/dL         40 - 60",
        "Triglycerides                            165           mg/dL         50 - 150           H",
        "Total Cholesterol / HDL Ratio            5.0           ratio         3.0 - 5.0",
        "",
        "End of report",
      ].join("\n");

    case "diabetes-panel":
      return [
        "METRO PATHOLOGY LAB",
        `Report Date: ${d}`,
        `Patient Name: ${patient}`,
        "",
        "DIABETES MONITORING PANEL",
        "Test Name                                Result        Unit          Reference Range",
        "Glucose, Fasting                         124           mg/dL         70 - 100           H",
        "Glucose, Post Prandial                   178           mg/dL         70 - 140           H",
        "HbA1c                                    7.4           %             4.0 - 5.6          H",
        "",
        "Note: HbA1c reflects average blood glucose over the last 3 months.",
        "Refer to your physician for interpretation.",
      ].join("\n");

    case "thyroid-panel":
      return [
        "METRO PATHOLOGY LAB",
        `Report Date: ${d}`,
        `Patient Name: ${patient}`,
        "",
        "THYROID FUNCTION TEST",
        "Test Name                                Result        Unit          Reference Range",
        "TSH                                      6.8           uIU/mL        0.4 - 4.0          H",
        "Total T3                                 1.1           ng/mL         0.8 - 2.0",
        "Total T4                                 7.2           ug/dL         5.1 - 14.1",
        "",
        "End of report",
      ].join("\n");

    case "vitamin-panel":
      return [
        "METRO PATHOLOGY LAB",
        `Report Date: ${d}`,
        `Patient Name: ${patient}`,
        "",
        "VITAMIN PANEL",
        "Test Name                                Result        Unit          Reference Range",
        "Vitamin D (25-OH)                        16.5          ng/mL         30 - 100           L",
        "Vitamin B12                              310           pg/mL         200 - 900",
        "Calcium                                  9.1           mg/dL         8.6 - 10.3",
        "",
        "End of report",
      ].join("\n");

    case "doctor-visit":
      return [
        "SUNRISE FAMILY CLINIC",
        `Date of Visit: ${d}`,
        `Patient: ${patient}          Age/Sex: 34/M`,
        "Consultation: General Medicine",
        "",
        "Chief Complaint: Tiredness and occasional breathlessness on exertion.",
        "History: Similar episode 6 months ago, improved after treatment.",
        "Examination:",
        "Blood Pressure                          120/80        mmHg",
        "Heart Rate                               76           bpm",
        "Weight                                   71.5         kg",
        "Provisional Diagnosis: Tiredness, evaluation in progress",
        "Advice: Repeat complete blood count after 2 weeks.",
        "Follow up: 2 weeks",
        "",
        "Dr. Anil Mehta",
      ].join("\n");

    case "vaccination":
      return [
        "SUNRISE FAMILY CLINIC",
        "IMMUNISATION RECORD",
        `Date Given: ${d}`,
        `Patient Name: ${patient}          Age/Sex: 34/M`,
        "",
        "Vaccine                                  Dose        Batch No        Site",
        "Influenza (Quadrivalent, 2026 season)    Booster     4F7A29          Left deltoid",
        "Tetanus-Diphtheria (Td)                  2nd          TD8812          Right deltoid",
        "",
        "Given By: Sister R. Kulkarni",
        "Advice: Apply a cold compress if the arm is sore. Report fever above 38.5 C.",
        "Next dose: Influenza booster after 12 months.",
        "",
        "Dr. Anil Mehta",
      ].join("\n");

    case "bp-log":
      return [
        "HOME HEALTH MONITORING SHEET",
        `Date: ${d}`,
        `Patient Name: ${patient}`,
        "",
        "Test Name                                Result        Unit",
        "Blood Pressure                           120/80        mmHg",
        "Heart Rate                               74           bpm",
        "Weight                                   71.0         kg",
        "",
        "Recorded at home using a digital monitor.",
      ].join("\n");

    default:
      return [
        "CITY DIAGNOSTICS CENTRE",
        `Report Date: ${d}`,
        `Patient Name: ${patient}`,
        "",
        "Test Name                                Result        Unit          Reference Range",
        "Hemoglobin                               12.4          g/dL          13.0 - 17.0        L",
        "",
        "End of report",
      ].join("\n");
  }
}

export class MockOcrProvider implements OcrProvider {
  readonly name = "Demo OCR (built-in mock)";
  readonly isMock = true;

  private build(input: OcrInput, pageCount = 1): OcrTextResult {
    const sample = pickSample({
      fileName: input.fileName,
      sampleKey: input.hint,
      documentType: input.documentType,
    });
    const text = buildMockDocumentText(sample, {
      patientName: "Demo Patient",
      // Recent dates keep the demo timeline looking alive.
      date: shiftDays(new Date(), 3 + (hash(input.fileName) % 9)),
    });

    const warnings: string[] = [
      "Demo OCR provider: text is composed from a sample template rather than read from your file.",
    ];
    // Surface the "please double-check" path the review screen depends on.
    if (hash(input.fileName) % 3 === 0) {
      warnings.push("One dosage was low confidence in the source document — please verify it.");
    }

    return {
      text,
      confidence: 0.82 + (hash(input.fileName) % 10) / 100,
      provider: this.name,
      pageCount,
      warnings,
    };
  }

  async extractTextFromImage(input: OcrInput): Promise<OcrTextResult> {
    return this.build(input, 1);
  }

  async extractTextFromPdf(input: OcrInput): Promise<OcrTextResult> {
    return this.build(input, 2);
  }
}
