"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/database/client";
import { assertProfileOwnership, assertRecordOwnership, writeAuditLog } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { readDocument } from "@/lib/ocr";
import { saveUploadedFile, removeUploadedFile } from "@/lib/uploads/storage";
import { isAllowedType, MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";
import { recordCorrectionSchema, recordMetaSchema } from "@/lib/validation";
import { toDate } from "@/lib/i18n/format";
import { generateSummarySafely } from "@/lib/ai";
import { getAIContext, getRecordDetail } from "@/lib/database/queries";
import { getMetric, evaluateAgainstRange } from "@/lib/health/metrics";
import type { ExtractedDocument } from "@/lib/ocr/types";

/**
 * Upload pipeline (server side).
 *
 *   file → validate → store → OCR → parse → save record + labs + metrics
 *
 * The user reviews the extraction on screen and can correct every field; the
 * corrections are written back through `saveRecordCorrectionAction` and are kept
 * in an audit column so we always know what OCR produced vs what the human fixed.
 */

export type UploadState = {
  ok: boolean;
  error?: string;
  recordId?: string;
};

export async function uploadRecordAction(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const profileId = String(formData.get("profileId") ?? "");
  try {
    await assertProfileOwnership(user.id, profileId);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const file = formData.get("file");
  const hintType = String(formData.get("recordType") ?? "").trim();
  const sampleKey = String(formData.get("sampleKey") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "NO_FILE" };
  }
  if (!isAllowedType(file.type, file.name)) {
    return { ok: false, error: "INVALID_TYPE" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "TOO_LARGE" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let stored;
  try {
    stored = await saveUploadedFile(buffer, file.name, file.type || "image/jpeg", profileId);
  } catch (error) {
    console.error("[upload] failed to store file", error);
    return { ok: false, error: "STORAGE_FAILED" };
  }

  try {
    const hint = /^(PRESCRIPTION|LAB_REPORT|DOCTOR_VISIT|DISCHARGE_SUMMARY|VACCINATION|IMAGING|OTHER)$/.test(hintType)
      ? (hintType as ExtractedDocument["documentType"])
      : undefined;

    const { extracted, ocr } = await readDocument(
      {
        buffer,
        fileName: sampleKey ? `${sampleKey}.pdf` : file.name,
        mimeType: file.type || "image/jpeg",
        // The sample hint drives the demo OCR template; real providers ignore it.
        hint: (sampleKey as never) ?? hint,
        documentType: hint,
      },
      hint,
    );

    const meta = recordMetaSchema.safeParse({
      type: extracted.documentType,
      recordDate: extracted.recordDate?.toISOString(),
      doctorName: extracted.doctorName ?? undefined,
      facilityName: extracted.facilityName ?? undefined,
      diagnosisTerms: extracted.diagnosisTerms,
    });

    const title = buildTitle(extracted);
    const recordDate = toDate(String(formData.get("recordDate") ?? "")) ?? extracted.recordDate ?? new Date();

    const record = await prisma.healthRecord.create({
      data: {
        profileId,
        type: meta.success ? meta.data.type : extracted.documentType,
        title,
        recordDate,
        doctorName: extracted.doctorName,
        facilityName: extracted.facilityName,
        diagnosisTerms: JSON.stringify(extracted.diagnosisTerms),
        status: extracted.lowConfidenceFields.length ? "NEEDS_REVIEW" : "READY",
        fileName: file.name,
        filePath: stored.relativePath,
        mimeType: file.type || "application/octet-stream",
        fileSize: stored.size,
        rawText: extracted.rawText,
        ocrProvider: ocr.provider,
        ocrConfidence: extracted.confidence,
        extraction: JSON.stringify(extracted),
      },
    });

    // Lab values → rows + time-series metrics.
    for (const value of extracted.labValues) {
      if (value.numericValue === null) {
        await prisma.labResult.create({
          data: {
            healthRecordId: record.id,
            profileId,
            testName: value.testName,
            value: value.value,
            numericValue: null,
            unit: value.unit,
            referenceRange: value.referenceRange,
            status: value.status,
            date: recordDate,
          },
        });
        continue;
      }

      await prisma.labResult.create({
        data: {
          healthRecordId: record.id,
          profileId,
          testName: value.testName,
          value: value.value,
          numericValue: value.numericValue,
          unit: value.unit,
          referenceRange: value.referenceRange,
          status: value.status,
          date: recordDate,
        },
      });

      if (value.metricKey) {
        const definition = getMetric(value.metricKey);
        await prisma.healthMetric.create({
          data: {
            profileId,
            metricKey: value.metricKey,
            label: definition?.unit ? metricLabel(value.metricKey, value.testName) : value.testName,
            value: value.numericValue,
            unit: value.unit ?? definition?.unit ?? "",
            recordedAt: recordDate,
            sourceRecordId: record.id,
          },
        });
      }
    }

    // "120/80" is stored as two metrics so the trends chart can plot both lines.
    const composite = extracted.labValues.find((value) => value.metricKey === "bp_systolic" && value.value.includes("/"));
    if (composite) {
      const [systolic, diastolic] = composite.value.split("/").map((part) => Number(part.trim()));
      if (Number.isFinite(systolic) && Number.isFinite(diastolic)) {
        await prisma.healthMetric.updateMany({
          where: { profileId, metricKey: "bp_systolic", recordedAt: recordDate, sourceRecordId: record.id },
          data: { value: systolic },
        });
        await prisma.healthMetric.create({
          data: {
            profileId,
            metricKey: "bp_diastolic",
            label: "Blood Pressure",
            value: diastolic,
            unit: "mmHg",
            recordedAt: recordDate,
            sourceRecordId: record.id,
          },
        });
      }
    }

    // Medicines found on a prescription.
    for (const medicine of extracted.medicines) {
      const durationDays = parseDurationDays(medicine.duration);
      await prisma.medication.create({
        data: {
          profileId,
          healthRecordId: record.id,
          name: medicine.name,
          dosage: medicine.dosage,
          frequency: medicine.frequency,
          duration: medicine.duration,
          startDate: recordDate,
          endDate: durationDays ? new Date(recordDate.getTime() + durationDays * 86_400_000) : null,
          status: "ACTIVE",
          slots: JSON.stringify(medicine.slots),
          isVerified: false,
        },
      });
    }

    await writeAuditLog({
      userId: user.id,
      action: "record.upload",
      entityType: "HealthRecord",
      entityId: record.id,
      meta: { provider: ocr.provider, labValues: extracted.labValues.length, medicines: extracted.medicines.length },
    });

    revalidatePath("/dashboard");
    revalidatePath("/timeline");
    revalidatePath("/trends");
    revalidatePath("/medications");
    return { ok: true, recordId: record.id };
  } catch (error) {
    console.error("[upload] processing failed", error);
    await removeUploadedFile(stored.relativePath);
    return { ok: false, error: "PROCESSING_FAILED" };
  }
}

function metricLabel(metricKey: string, fallback: string): string {
  const names: Record<string, string> = {
    hemoglobin: "Hemoglobin",
    glucose_fasting: "Blood Glucose (fasting)",
    glucose_random: "Blood Glucose",
    hba1c: "HbA1c",
    bp_systolic: "Blood Pressure",
    bp_diastolic: "Blood Pressure",
    heart_rate: "Heart Rate",
    weight: "Weight",
    height: "Height",
    vitamin_d: "Vitamin D",
    cholesterol_total: "Total Cholesterol",
    cholesterol_ldl: "LDL Cholesterol",
    cholesterol_hdl: "HDL Cholesterol",
    triglycerides: "Triglycerides",
    creatinine: "Creatinine",
    tsh: "TSH (thyroid)",
    platelets: "Platelets",
    wbc: "White Blood Cells",
    rbc: "Red Blood Cells",
    uric_acid: "Uric Acid",
  };
  return names[metricKey] ?? fallback;
}

function parseDurationDays(duration: string | null): number | null {
  if (!duration) return null;
  const match = duration.match(/(\d+)\s*(day|week|month)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("day")) return amount;
  if (unit.startsWith("week")) return amount * 7;
  return amount * 30;
}

function buildTitle(extracted: ExtractedDocument): string {
  const date = extracted.recordDate
    ? extracted.recordDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "Undated";
  switch (extracted.documentType) {
    case "PRESCRIPTION":
      return `Prescription — ${extracted.doctorName ?? "Uploaded"} (${date})`;
    case "LAB_REPORT":
      return `Lab Report — ${extracted.facilityName ?? "Uploaded"} (${date})`;
    case "DOCTOR_VISIT":
      return `Doctor Visit — ${extracted.doctorName ?? "Uploaded"} (${date})`;
    case "DISCHARGE_SUMMARY":
      return `Discharge Summary (${date})`;
    case "VACCINATION":
      return `Vaccination Record (${date})`;
    case "IMAGING":
      return `Imaging Report (${date})`;
    default:
      return `Health Record (${date})`;
  }
}

// ── Corrections, meta updates, deletion ─────────────────────────────────────

export async function saveRecordCorrectionAction(input: unknown) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" };

  const parsed = recordCorrectionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "INVALID_INPUT" };

  const { recordId, field, value, target, targetId } = parsed.data;
  let record;
  try {
    record = await assertRecordOwnership(user.id, recordId);
  } catch {
    return { ok: false as const, error: "FORBIDDEN" };
  }

  const previousCorrections = safeJson<{ field: string; from: unknown; to: unknown; at: string }[]>(
    record.corrections,
  );

  if (target === "labResult" && targetId) {
    const lab = await prisma.labResult.findFirst({ where: { id: targetId, healthRecordId: record.id } });
    if (!lab) return { ok: false as const, error: "NOT_FOUND" };
    const numeric = typeof value === "number" ? value : Number.parseFloat(value);
    const referenceRange = field === "referenceRange" ? String(value) : lab.referenceRange;
    await prisma.labResult.update({
      where: { id: lab.id },
      data: {
        [field === "value" ? "value" : field]: field === "value" ? String(value) : String(value),
        numericValue: Number.isFinite(numeric) ? numeric : lab.numericValue,
        status: evaluateAgainstRange(Number.isFinite(numeric) ? numeric : lab.numericValue, referenceRange),
        isVerified: true,
      },
    });
    await syncMetricFromLab(record.profileId, record.id, lab.testName, Number.isFinite(numeric) ? numeric : null);
  } else if (target === "medication" && targetId) {
    const medication = await prisma.medication.findFirst({ where: { id: targetId, healthRecordId: record.id } });
    if (!medication) return { ok: false as const, error: "NOT_FOUND" };
    await prisma.medication.update({
      where: { id: medication.id },
      data: { [field]: String(value), isVerified: true },
    });
  } else {
    const allowed = new Set(["title", "doctorName", "facilityName", "recordDate", "notes"]);
    if (!allowed.has(field)) return { ok: false as const, error: "INVALID_FIELD" };
    await prisma.healthRecord.update({
      where: { id: record.id },
      data: {
        [field]: field === "recordDate" ? new Date(String(value)) : String(value),
      },
    });
  }

  previousCorrections.push({ field, from: null, to: value, at: new Date().toISOString() });
  await prisma.healthRecord.update({
    where: { id: record.id },
    data: {
      corrections: JSON.stringify(previousCorrections),
      status: "READY",
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "record.correct",
    entityType: "HealthRecord",
    entityId: record.id,
    meta: { field, target },
  });

  revalidatePath(`/records/${record.id}`);
  revalidatePath("/trends");
  revalidatePath("/dashboard");
  return { ok: true as const };
}

async function syncMetricFromLab(profileId: string, recordId: string, testName: string, value: number | null) {
  if (value === null) return;
  const metric = getMetricKeyForTest(testName);
  if (!metric) return;
  await prisma.healthMetric.updateMany({
    where: { profileId, sourceRecordId: recordId, metricKey: metric },
    data: { value },
  });
}

function getMetricKeyForTest(testName: string): string | null {
  const needle = testName.toLowerCase();
  const entries: [string, string][] = [
    ["hemoglobin", "hemoglobin"],
    ["glucose, fasting", "glucose_fasting"],
    ["glucose", "glucose_random"],
    ["hba1c", "hba1c"],
    ["blood pressure", "bp_systolic"],
    ["heart rate", "heart_rate"],
    ["weight", "weight"],
    ["height", "height"],
    ["vitamin d", "vitamin_d"],
    ["cholesterol", "cholesterol_total"],
    ["ldl", "cholesterol_ldl"],
    ["hdl", "cholesterol_hdl"],
    ["triglyceride", "triglycerides"],
    ["creatinine", "creatinine"],
    ["tsh", "tsh"],
    ["platelet", "platelets"],
    ["leucocyte", "wbc"],
    ["rbc", "rbc"],
  ];
  return entries.find(([alias]) => needle.includes(alias))?.[1] ?? null;
}

export async function updateRecordMetaAction(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const recordId = String(formData.get("recordId") ?? "");
  let record;
  try {
    record = await assertRecordOwnership(user.id, recordId);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const parsed = recordMetaSchema.safeParse({
    type: String(formData.get("type") ?? record.type),
    title: String(formData.get("title") ?? record.title),
    recordDate: String(formData.get("recordDate") ?? record.recordDate.toISOString()),
    doctorName: String(formData.get("doctorName") ?? ""),
    facilityName: String(formData.get("facilityName") ?? ""),
  });
  if (!parsed.success) return { ok: false, error: "VALIDATION" };

  await prisma.healthRecord.update({
    where: { id: record.id },
    data: {
      type: parsed.data.type,
      title: parsed.data.title ?? record.title,
      recordDate: toDate(parsed.data.recordDate ?? "") ?? record.recordDate,
      doctorName: parsed.data.doctorName || null,
      facilityName: parsed.data.facilityName || null,
      status: "READY",
    },
  });

  revalidatePath(`/records/${record.id}`);
  revalidatePath("/timeline");
  return { ok: true, recordId: record.id };
}

export async function generateSummaryAction(recordId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" };

  let record;
  try {
    record = await assertRecordOwnership(user.id, recordId);
  } catch {
    return { ok: false as const, error: "FORBIDDEN" };
  }

  const detail = await getRecordDetail(record.id);
  if (!detail) return { ok: false as const, error: "NOT_FOUND" };

  const language = (user.preferences?.language === "hi" ? "hi" : "en") as "en" | "hi";
  const context = await getAIContext(
    detail.profileId,
    { name: detail.profile.name, kind: detail.profile.kind },
    language,
  );

  const response = await generateSummarySafely({
    context,
    record: {
      id: detail.id,
      type: detail.type,
      title: detail.title,
      date: detail.recordDate,
      doctorName: detail.doctorName,
      facilityName: detail.facilityName,
      diagnosisTerms: safeJson<string[]>(detail.diagnosisTerms),
      labValues: detail.labResults.map((lab) => ({
        testName: lab.testName,
        metricKey: null,
        value: lab.value,
        numericValue: lab.numericValue,
        unit: lab.unit,
        referenceRange: lab.referenceRange,
        status: lab.status as never,
      })),
      medicines: detail.medications.map((medicine) => ({
        name: medicine.name,
        dosage: medicine.dosage,
        frequency: medicine.frequency,
        duration: medicine.duration,
        status: medicine.status,
      })),
      summary: null,
    },
  });

  await prisma.healthRecord.update({
    where: { id: record.id },
    data: {
      aiSummary: JSON.stringify(response.summary),
      aiSummaryAt: new Date(),
      aiProvider: response.provider,
    },
  });

  await writeAuditLog({
    userId: user.id,
    action: "record.summarise",
    entityType: "HealthRecord",
    entityId: record.id,
    meta: { provider: response.provider, isMock: response.isMock },
  });

  revalidatePath(`/records/${record.id}`);
  return { ok: true as const, summary: response.summary, provider: response.provider, isMock: response.isMock };
}

export async function deleteRecordAction(recordId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHENTICATED" };

  try {
    const record = await assertRecordOwnership(user.id, recordId);
    if (record.filePath) await removeUploadedFile(record.filePath);
    await prisma.healthRecord.delete({ where: { id: record.id } });
    await writeAuditLog({
      userId: user.id,
      action: "record.delete",
      entityType: "HealthRecord",
      entityId: record.id,
    });
  } catch {
    return { ok: false as const, error: "FORBIDDEN" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/timeline");
  revalidatePath("/trends");
  revalidatePath("/records");
  return { ok: true as const };
}

function safeJson<T>(value: string | null | undefined): T {
  if (!value) return [] as unknown as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return [] as unknown as T;
  }
}

export const __recordHelpers = { parseDurationDays, buildTitle, z };
