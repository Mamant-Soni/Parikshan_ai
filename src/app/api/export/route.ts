import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/auth/guards";
import type { ResultStatus } from "@/types/domain";
import { prisma } from "@/lib/database/client";
import {
  toFhirBundle,
  toFhirDocumentReference,
  toFhirEncounter,
  toFhirMedicationRequest,
  toFhirObservation,
  toFhirPatient,
} from "@/lib/fhir/mappers";
import { extractPlainSummary, safeJsonArray } from "@/lib/database/queries";

/**
 * Data portability (DPDP-style "right to access").
 *
 * Returns everything the account holds, including a FHIR R4 bundle so the export
 * can be handed to a clinician or imported by another system. Uploaded files
 * themselves are referenced, not inlined — download them from the record page.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const profiles = await prisma.healthProfile.findMany({
    where: { userId: user.id },
    include: {
      records: { include: { labResults: true, medications: true } },
      medications: true,
      metrics: true,
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    notice:
      "Demo export from Personal Health Copilot. AbhaLink/ABDM identifiers are demonstration values only — no ABDM services were contacted.",
    account: {
      name: user.name,
      email: user.email,
      abhaNumber: user.abhaNumber,
      isDemo: user.isDemo,
      createdAt: user.createdAt.toISOString(),
      preferences: user.preferences,
    },
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      relationship: profile.relationship,
      kind: profile.kind,
      dateOfBirth: profile.dateOfBirth?.toISOString() ?? null,
      bloodGroup: profile.bloodGroup,
      records: profile.records.map((record) => ({
        id: record.id,
        type: record.type,
        title: record.title,
        recordDate: record.recordDate.toISOString(),
        doctorName: record.doctorName,
        facilityName: record.facilityName,
        diagnosisTerms: safeJsonArray(record.diagnosisTerms),
        ocrProvider: record.ocrProvider,
        ocrConfidence: record.ocrConfidence,
        rawText: record.rawText,
        file: record.filePath
          ? { name: record.fileName, size: record.fileSize, downloadUrl: `/api/records/${record.id}/file` }
          : null,
        labResults: record.labResults.map((lab) => ({
          testName: lab.testName,
          value: lab.value,
          numericValue: lab.numericValue,
          unit: lab.unit,
          referenceRange: lab.referenceRange,
          status: lab.status,
        })),
        medications: record.medications.map((medication) => ({
          name: medication.name,
          dosage: medication.dosage,
          frequency: medication.frequency,
          duration: medication.duration,
          status: medication.status,
          slots: safeJsonArray(medication.slots),
        })),
      })),
      medications: profile.medications.map((medication) => ({
        name: medication.name,
        dosage: medication.dosage,
        frequency: medication.frequency,
        duration: medication.duration,
        status: medication.status,
        startDate: medication.startDate.toISOString(),
        endDate: medication.endDate?.toISOString() ?? null,
      })),
      metrics: profile.metrics.map((metric) => ({
        metricKey: metric.metricKey,
        label: metric.label,
        value: metric.value,
        unit: metric.unit,
        recordedAt: metric.recordedAt.toISOString(),
      })),
      fhirBundle: toFhirBundle([
        toFhirPatient({
          id: profile.id,
          name: profile.name,
          gender: profile.gender,
          dateOfBirth: profile.dateOfBirth,
          abhaNumber: user.abhaNumber,
          updatedAt: profile.updatedAt,
        }),
        ...profile.records.flatMap((record) => [
          toFhirDocumentReference({
            id: record.id,
            profileId: profile.id,
            title: record.title,
            type: record.type,
            recordDate: record.recordDate,
            mimeType: record.mimeType,
            fileName: record.fileName,
            createdAt: record.createdAt,
            summary: extractPlainSummary(record.aiSummary),
          }),
          ...record.labResults.map((lab) =>
            toFhirObservation({
              id: lab.id,
              profileId: profile.id,
              testName: lab.testName,
              numericValue: lab.numericValue,
              value: lab.value,
              unit: lab.unit,
              referenceRange: lab.referenceRange,
              status: lab.status as ResultStatus,
              date: lab.date,
            }),
          ),
          ...record.medications.map((medication) => toFhirMedicationRequest(medication, record.id)),
          ...(record.type === "DOCTOR_VISIT"
            ? [
                toFhirEncounter({
                  id: record.id,
                  profileId: profile.id,
                  title: record.title,
                  recordDate: record.recordDate,
                  doctorName: record.doctorName,
                  facilityName: record.facilityName,
                  diagnosisTerms: safeJsonArray(record.diagnosisTerms),
                }),
              ]
            : []),
        ]),
      ]),
    })),
  };

  await writeAuditLog({
    userId: user.id,
    action: "account.export",
    entityType: "User",
    entityId: user.id,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="health-copilot-export-${stamp}.json"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
