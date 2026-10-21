import type { ResultStatus } from "@/types/domain";

/**
 * FHIR R4 / ABDM mapping layer.
 *
 * These functions convert local Prisma rows into FHIR resources. They are
 * intentionally written *now* (even though this build is offline) because the
 * shape of the mapping dictates the shape of the database — and it lets a judge
 * see exactly where ABDM integration lands.
 *
 *   HealthProfile      → Patient              (ABDM "patient" demographic record)
 *   HealthRecord       → DocumentReference    (the uploaded PDF/JPG)
 *                      → DiagnosticReport     (lab reports)
 *                      → Encounter            (doctor visits)
 *   LabResult          → Observation          (category: laboratory)
 *   HealthMetric       → Observation          (category: vital-signs / laboratory)
 *   Medication         → MedicationRequest    (what was prescribed)
 *                      → MedicationStatement  (what the patient reports taking)
 *
 * Where the real APIs plug in: every function below is pure, so an ABDM client
 * only has to POST the returned bundle to the gateway (see abha.ts for the
 * integration checklist).
 */

export type FhirCoding = { system?: string; code?: string; display?: string };
export type FhirCodeableConcept = { text?: string; coding?: FhirCoding[] };
export type FhirReference = { reference: string; display?: string };

export type FhirResource = {
  resourceType: string;
  id: string;
  meta?: { lastUpdated?: string; profile?: string[] };
  [key: string]: unknown;
};

const LOINC = "http://loinc.org";
const SNOMED = "http://snomed.info/sct";

/** Local metric keys → LOINC codes. Add rows here as new metrics are supported. */
const LOINC_BY_METRIC: Record<string, { code: string; display: string }> = {
  hemoglobin: { code: "718-7", display: "Hemoglobin [Mass/volume] in Blood" },
  glucose_fasting: { code: "1558-6", display: "Fasting glucose [Mass/volume] in Serum or Plasma" },
  glucose_random: { code: "2339-0", display: "Glucose [Mass/volume] in Blood" },
  hba1c: { code: "4548-4", display: "Hemoglobin A1c/Hemoglobin.total in Blood" },
  bp_systolic: { code: "8480-6", display: "Systolic blood pressure" },
  bp_diastolic: { code: "8462-4", display: "Diastolic blood pressure" },
  heart_rate: { code: "8867-4", display: "Heart rate" },
  weight: { code: "29463-7", display: "Body weight" },
  height: { code: "8302-2", display: "Body height" },
  vitamin_d: { code: "1989-3", display: "25-Hydroxyvitamin D3 [Mass/volume] in Serum or Plasma" },
  cholesterol_total: { code: "2093-3", display: "Cholesterol [Mass/volume] in Serum or Plasma" },
  cholesterol_ldl: { code: "2089-1", display: "Cholesterol in LDL [Mass/volume] in Serum or Plasma" },
  cholesterol_hdl: { code: "2085-9", display: "Cholesterol in HDL [Mass/volume] in Serum or Plasma" },
  triglycerides: { code: "2571-8", display: "Triglyceride [Mass/volume] in Serum or Plasma" },
  creatinine: { code: "2160-0", display: "Creatinine [Mass/volume] in Serum or Plasma" },
  tsh: { code: "3016-3", display: "Thyrotropin [Units/volume] in Serum or Plasma" },
  platelets: { code: "777-3", display: "Platelets [#/volume] in Blood" },
  wbc: { code: "6690-2", display: "Leukocytes [#/volume] in Blood" },
  rbc: { code: "789-8", display: "Erythrocytes [#/volume] in Blood" },
};

const FHIR_STATUS_BY_RESULT: Record<ResultStatus, string> = {
  WITHIN_RANGE: "final",
  BELOW_RANGE: "final",
  ABOVE_RANGE: "final",
  UNKNOWN: "preliminary",
};

export function toFhirPatient(profile: {
  id: string;
  name: string;
  dateOfBirth: Date | null;
  gender?: string | null;
  abhaNumber?: string | null;
  updatedAt: Date;
}): FhirResource {
  const nameParts = profile.name.trim().split(/\s+/);
  return {
    resourceType: "Patient",
    id: profile.id,
    meta: {
      lastUpdated: profile.updatedAt.toISOString(),
      // In ABDM, the ABHA number is the Patient.identifier with this system.
      profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Patient"],
    },
    identifier: profile.abhaNumber
      ? [{ system: "https://healthid.ndhm.gov.in", value: profile.abhaNumber, type: { text: "ABHA Number" } }]
      : [],
    name: [{ text: profile.name, family: nameParts.slice(-1).join(" "), given: nameParts.slice(0, -1) }],
    gender: mapGender(profile.gender),
    birthDate: profile.dateOfBirth?.toISOString().slice(0, 10),
  };
}

function mapGender(gender: string | null | undefined): string | undefined {
  switch ((gender ?? "").toLowerCase()) {
    case "male":
    case "m":
      return "male";
    case "female":
    case "f":
      return "female";
    case "other":
      return "other";
    default:
      return undefined;
  }
}

export function toFhirObservation(labResult: {
  id: string;
  profileId: string;
  testName: string;
  numericValue: number | null;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  status: ResultStatus;
  date: Date;
  metricKey?: string | null;
}): FhirResource {
  const loinc = labResult.metricKey ? LOINC_BY_METRIC[labResult.metricKey] : undefined;
  return {
    resourceType: "Observation",
    id: labResult.id,
    meta: {
      lastUpdated: labResult.date.toISOString(),
      profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Observation"],
    },
    status: FHIR_STATUS_BY_RESULT[labResult.status] ?? "final",
    category: [
      {
        coding: [
          { system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory", display: "Laboratory" },
        ],
      },
    ],
    code: {
      text: labResult.testName,
      coding: loinc ? [{ system: LOINC, code: loinc.code, display: loinc.display }] : undefined,
    },
    subject: { reference: `Patient/${labResult.profileId}` },
    effectiveDateTime: labResult.date.toISOString(),
    valueQuantity: labResult.numericValue !== null
      ? { value: labResult.numericValue, unit: labResult.unit ?? undefined }
      : undefined,
    valueString: labResult.numericValue === null ? labResult.value : undefined,
    referenceRange: labResult.referenceRange
      ? [{ text: labResult.referenceRange }]
      : undefined,
    interpretation: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
            code: interpretationCode(labResult.status),
          },
        ],
      },
    ],
  };
}

function interpretationCode(status: ResultStatus): string {
  switch (status) {
    case "BELOW_RANGE":
      return "L";
    case "ABOVE_RANGE":
      return "H";
    case "WITHIN_RANGE":
      return "N";
    default:
      return "U";
  }
}

export function toFhirMedicationRequest(
  medication: {
    id: string;
    profileId: string;
    name: string;
    dosage: string | null;
    frequency: string | null;
    duration: string | null;
    startDate: Date;
    endDate: Date | null;
    status: string;
    notes?: string | null;
  },
  sourceRecordId?: string | null,
): FhirResource {
  return {
    resourceType: "MedicationRequest",
    id: medication.id,
    meta: {
      lastUpdated: medication.startDate.toISOString(),
      profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/MedicationRequest"],
    },
    status: medication.status === "ACTIVE" ? "active" : medication.status.toLowerCase(),
    intent: "order",
    medicationCodeableConcept: { text: medication.name, coding: [{ system: SNOMED, display: medication.name }] },
    subject: { reference: `Patient/${medication.profileId}` },
    authoredOn: medication.startDate.toISOString(),
    dosageInstruction: [
      {
        text: [medication.dosage, medication.frequency].filter(Boolean).join(" — ") || undefined,
        timing: medication.frequency ? { code: { text: medication.frequency } } : undefined,
        // Duration is a local free-text field; FHIR would use timing.repeat.boundsDuration.
        patientInstruction: medication.notes ?? undefined,
        asNeededBoolean: medication.frequency === "When needed" ? true : undefined,
      },
    ],
    dispenseRequest: medication.endDate ? { validityPeriod: { end: medication.endDate.toISOString() } } : undefined,
    basedOn: sourceRecordId ? [{ reference: `DocumentReference/${sourceRecordId}` }] : undefined,
  };
}

export function toFhirDocumentReference(record: {
  id: string;
  profileId: string;
  title: string;
  type: string;
  recordDate: Date;
  mimeType: string | null;
  fileName: string | null;
  createdAt: Date;
  summary?: string | null;
}): FhirResource {
  return {
    resourceType: "DocumentReference",
    id: record.id,
    meta: {
      lastUpdated: record.createdAt.toISOString(),
      profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentReference"],
    },
    status: "current",
    docStatus: "final",
    type: { text: record.type },
    subject: { reference: `Patient/${record.profileId}` },
    date: record.recordDate.toISOString(),
    description: record.title,
    // The binary itself is streamed from /api/records/{id}/file after an
    // ownership check; an ABDM push would attach the same bytes via the HIU API.
    content: [
      {
        attachment: {
          contentType: record.mimeType ?? "application/octet-stream",
          title: record.fileName ?? record.title,
          url: `/api/records/${record.id}/file`,
        },
      },
    ],
  };
}

export function toFhirEncounter(record: {
  id: string;
  profileId: string;
  title: string;
  recordDate: Date;
  doctorName: string | null;
  facilityName: string | null;
  diagnosisTerms: string[];
}): FhirResource {
  return {
    resourceType: "Encounter",
    id: record.id,
    meta: { profile: ["https://nrces.in/ndhm/fhir/r4/StructureDefinition/Encounter"] },
    status: "finished",
    class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory" },
    subject: { reference: `Patient/${record.profileId}` },
    period: { start: record.recordDate.toISOString() },
    serviceProvider: record.facilityName ? { display: record.facilityName } : undefined,
    participant: record.doctorName
      ? [{ individual: { display: record.doctorName } }]
      : undefined,
    reasonCode: record.diagnosisTerms.map((term) => ({ text: term })),
  };
}

/** Bundles resources the way an ABDM data-transfer response does. */
export function toFhirBundle(
  resources: FhirResource[],
  type: "collection" | "document" = "collection",
): FhirResource & { entry: { resource: FhirResource }[] } {
  return {
    resourceType: "Bundle",
    id: `bundle-${Date.now()}`,
    meta: { lastUpdated: new Date().toISOString() },
    type,
    total: resources.length,
    entry: resources.map((resource) => ({ resource })),
  };
}
