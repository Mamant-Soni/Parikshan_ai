import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { DEMO_ABHA_NUMBER, DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_NAME } from "./account";

/**
 * Demo account seeding.
 *
 * Shared by `prisma/seed.ts` (CLI) and the "Try Demo Patient" button, so the
 * hackathon demo data can be created on demand even on a fresh database.
 *
 * Everything here is FICTIONAL sample data: invented patient, doctor and
 * facility names with plausible lab values. No external service is called.
 */

export { DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_NAME, DEMO_ABHA_NUMBER } from "./account";

const DEMO_EMAIL = DEMO_ACCOUNT_EMAIL;
const DEMO_ABHA = DEMO_ABHA_NUMBER; // Verhoeff-valid, fictional

const day = (iso: string) => new Date(`${iso}T09:30:00.000Z`);

type LabSeed = {
  testName: string;
  metricKey: string | null;
  value: string;
  numeric: number | null;
  unit: string | null;
  referenceRange: string | null;
  status: "WITHIN_RANGE" | "BELOW_RANGE" | "ABOVE_RANGE" | "UNKNOWN";
  /** Also recorded as a time-series metric for the trends screen. */
  asMetric?: { label: string; unit: string };
};

export async function seedDemoAccount(prisma: PrismaClient) {
  console.log("[demo] seeding Personal Health Copilot demo data");

  // Idempotent: wipe the demo account (never touching other accounts).
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      name: "Demo Patient",
      email: DEMO_EMAIL,
      abhaNumber: DEMO_ABHA,
      abhaLinked: true, // demo placeholder link only
      isDemo: true,
      preferences: {
        create: {
          language: "en",
          easyRead: false,
          largeText: false,
          highContrast: false,
          readAloud: true,
          notifyMeds: true,
          notifyRecords: false,
        },
      },
      consents: {
        create: {
          purpose: "SELF_CARE",
          status: "GRANTED",
          version: "demo-1.0",
        },
      },
    },
  });

  const self = await prisma.healthProfile.create({
    data: {
      userId: user.id,
      name: "Demo Patient",
      relationship: "SELF",
      kind: "ADULT",
      dateOfBirth: day("1992-03-18"),
      gender: "Male",
      bloodGroup: "B+",
      avatarEmoji: "🙂",
      isPrimary: true,
      isDemo: true,
    },
  });

  const child = await prisma.healthProfile.create({
    data: {
      userId: user.id,
      name: "Aarav (Demo Child)",
      relationship: "CHILD",
      kind: "CHILD",
      dateOfBirth: day("2019-07-02"),
      gender: "Male",
      bloodGroup: "O+",
      avatarEmoji: "🧒",
      isDemo: true,
    },
  });

  const elder = await prisma.healthProfile.create({
    data: {
      userId: user.id,
      name: "Savitri Devi (Demo Elder)",
      relationship: "PARENT",
      kind: "ELDER",
      dateOfBirth: day("1958-01-09"),
      gender: "Female",
      bloodGroup: "A+",
      avatarEmoji: "👵",
      isDemo: true,
    },
  });

  await prisma.user.update({ where: { id: user.id }, data: { activeProfileId: self.id } });

  // ── Self: four blood reports so trends have a real story ──────────────────
  const reportSeeds: {
    date: string;
    title: string;
    doctor: string;
    facility: string;
    labs: LabSeed[];
    notes?: string;
  }[] = [
    {
      date: "2026-01-12",
      title: "Blood Test — Complete Health Panel",
      doctor: "Dr. Anil Mehta",
      facility: "City Diagnostics Centre",
      labs: [
        { testName: "Hemoglobin", metricKey: "hemoglobin", value: "14.5", numeric: 14.5, unit: "g/dL", referenceRange: "13.0 - 17.0", status: "WITHIN_RANGE", asMetric: { label: "Hemoglobin", unit: "g/dL" } },
        { testName: "Glucose, Fasting", metricKey: "glucose_fasting", value: "101", numeric: 101, unit: "mg/dL", referenceRange: "70 - 100", status: "ABOVE_RANGE", asMetric: { label: "Blood Glucose (fasting)", unit: "mg/dL" } },
        { testName: "Total Cholesterol", metricKey: "cholesterol_total", value: "196", numeric: 196, unit: "mg/dL", referenceRange: "125 - 200", status: "WITHIN_RANGE", asMetric: { label: "Total Cholesterol", unit: "mg/dL" } },
        { testName: "Total Leucocyte Count", metricKey: "wbc", value: "7400", numeric: 7400, unit: "10³/µL", referenceRange: "4000 - 11000", status: "WITHIN_RANGE" },
        { testName: "Platelet Count", metricKey: "platelets", value: "255000", numeric: 255000, unit: "10³/µL", referenceRange: "150000 - 410000", status: "WITHIN_RANGE" },
        { testName: "RBC Count", metricKey: "rbc", value: "4.9", numeric: 4.9, unit: "million/µL", referenceRange: "4.5 - 5.5", status: "WITHIN_RANGE" },
        { testName: "Hematocrit", metricKey: null, value: "43.1", numeric: 43.1, unit: "%", referenceRange: "40 - 50", status: "WITHIN_RANGE" },
        { testName: "MCV", metricKey: null, value: "88.0", numeric: 88, unit: "fL", referenceRange: "80 - 100", status: "WITHIN_RANGE" },
        { testName: "Creatinine", metricKey: "creatinine", value: "0.85", numeric: 0.85, unit: "mg/dL", referenceRange: "0.7 - 1.3", status: "WITHIN_RANGE" },
        { testName: "Vitamin D (25-OH)", metricKey: "vitamin_d", value: "22.0", numeric: 22, unit: "ng/mL", referenceRange: "30 - 100", status: "BELOW_RANGE", asMetric: { label: "Vitamin D", unit: "ng/mL" } },
        { testName: "TSH", metricKey: "tsh", value: "2.4", numeric: 2.4, unit: "µIU/mL", referenceRange: "0.4 - 4.0", status: "WITHIN_RANGE" },
        { testName: "Blood Pressure", metricKey: "bp_systolic", value: "126/84", numeric: 126, unit: "mmHg", referenceRange: "90 - 120", status: "ABOVE_RANGE", asMetric: { label: "Blood Pressure", unit: "mmHg" } },
      ],
    },
    {
      date: "2026-04-10",
      title: "Blood Test — Follow-up",
      doctor: "Dr. Anil Mehta",
      facility: "City Diagnostics Centre",
      labs: [
        { testName: "Hemoglobin", metricKey: "hemoglobin", value: "13.8", numeric: 13.8, unit: "g/dL", referenceRange: "13.0 - 17.0", status: "WITHIN_RANGE", asMetric: { label: "Hemoglobin", unit: "g/dL" } },
        { testName: "Glucose, Fasting", metricKey: "glucose_fasting", value: "104", numeric: 104, unit: "mg/dL", referenceRange: "70 - 100", status: "ABOVE_RANGE", asMetric: { label: "Blood Glucose (fasting)", unit: "mg/dL" } },
        { testName: "Total Cholesterol", metricKey: "cholesterol_total", value: "204", numeric: 204, unit: "mg/dL", referenceRange: "125 - 200", status: "ABOVE_RANGE", asMetric: { label: "Total Cholesterol", unit: "mg/dL" } },
        { testName: "Blood Pressure", metricKey: "bp_systolic", value: "130/86", numeric: 130, unit: "mmHg", referenceRange: "90 - 120", status: "ABOVE_RANGE", asMetric: { label: "Blood Pressure", unit: "mmHg" } },
        { testName: "Vitamin D (25-OH)", metricKey: "vitamin_d", value: "19.5", numeric: 19.5, unit: "ng/mL", referenceRange: "30 - 100", status: "BELOW_RANGE", asMetric: { label: "Vitamin D", unit: "ng/mL" } },
      ],
    },
    {
      date: "2026-08-14",
      title: "Blood Test — Annual Health Check",
      doctor: "Dr. Anil Mehta",
      facility: "City Diagnostics Centre",
      labs: [
        { testName: "Hemoglobin", metricKey: "hemoglobin", value: "12.6", numeric: 12.6, unit: "g/dL", referenceRange: "13.0 - 17.0", status: "BELOW_RANGE", asMetric: { label: "Hemoglobin", unit: "g/dL" } },
        { testName: "Glucose, Fasting", metricKey: "glucose_fasting", value: "106", numeric: 106, unit: "mg/dL", referenceRange: "70 - 100", status: "ABOVE_RANGE", asMetric: { label: "Blood Glucose (fasting)", unit: "mg/dL" } },
        { testName: "Total Cholesterol", metricKey: "cholesterol_total", value: "218", numeric: 218, unit: "mg/dL", referenceRange: "125 - 200", status: "ABOVE_RANGE", asMetric: { label: "Total Cholesterol", unit: "mg/dL" } },
        { testName: "LDL Cholesterol", metricKey: "cholesterol_ldl", value: "141", numeric: 141, unit: "mg/dL", referenceRange: "50 - 130", status: "ABOVE_RANGE", asMetric: { label: "LDL Cholesterol", unit: "mg/dL" } },
        { testName: "HDL Cholesterol", metricKey: "cholesterol_hdl", value: "43", numeric: 43, unit: "mg/dL", referenceRange: "40 - 60", status: "WITHIN_RANGE" },
        { testName: "Triglycerides", metricKey: "triglycerides", value: "158", numeric: 158, unit: "mg/dL", referenceRange: "50 - 150", status: "ABOVE_RANGE" },
        { testName: "Blood Pressure", metricKey: "bp_systolic", value: "128/82", numeric: 128, unit: "mmHg", referenceRange: "90 - 120", status: "ABOVE_RANGE", asMetric: { label: "Blood Pressure", unit: "mmHg" } },
        { testName: "Heart Rate", metricKey: "heart_rate", value: "78", numeric: 78, unit: "bpm", referenceRange: "60 - 100", status: "WITHIN_RANGE", asMetric: { label: "Heart Rate", unit: "bpm" } },
        { testName: "Weight", metricKey: "weight", value: "72.4", numeric: 72.4, unit: "kg", referenceRange: null, status: "UNKNOWN", asMetric: { label: "Weight", unit: "kg" } },
        { testName: "Vitamin D (25-OH)", metricKey: "vitamin_d", value: "17.8", numeric: 17.8, unit: "ng/mL", referenceRange: "30 - 100", status: "BELOW_RANGE", asMetric: { label: "Vitamin D", unit: "ng/mL" } },
      ],
    },
    {
      date: "2026-09-12",
      title: "Blood Test — Latest Report",
      doctor: "Dr. Anil Mehta",
      facility: "City Diagnostics Centre",
      labs: [
        { testName: "Hemoglobin", metricKey: "hemoglobin", value: "11.0", numeric: 11.0, unit: "g/dL", referenceRange: "13.0 - 17.0", status: "BELOW_RANGE", asMetric: { label: "Hemoglobin", unit: "g/dL" } },
        { testName: "Glucose, Fasting", metricKey: "glucose_fasting", value: "108", numeric: 108, unit: "mg/dL", referenceRange: "70 - 100", status: "ABOVE_RANGE", asMetric: { label: "Blood Glucose (fasting)", unit: "mg/dL" } },
        { testName: "Total Leucocyte Count", metricKey: "wbc", value: "7600", numeric: 7600, unit: "10³/µL", referenceRange: "4000 - 11000", status: "WITHIN_RANGE" },
        { testName: "Platelet Count", metricKey: "platelets", value: "245000", numeric: 245000, unit: "10³/µL", referenceRange: "150000 - 410000", status: "WITHIN_RANGE" },
        { testName: "RBC Count", metricKey: "rbc", value: "4.5", numeric: 4.5, unit: "million/µL", referenceRange: "4.5 - 5.5", status: "WITHIN_RANGE" },
        { testName: "Hematocrit", metricKey: null, value: "38.2", numeric: 38.2, unit: "%", referenceRange: "40 - 50", status: "BELOW_RANGE" },
        { testName: "MCV", metricKey: null, value: "84.0", numeric: 84, unit: "fL", referenceRange: "80 - 100", status: "WITHIN_RANGE" },
        { testName: "Creatinine", metricKey: "creatinine", value: "0.90", numeric: 0.9, unit: "mg/dL", referenceRange: "0.7 - 1.3", status: "WITHIN_RANGE" },
        { testName: "Blood Pressure", metricKey: "bp_systolic", value: "120/80", numeric: 120, unit: "mmHg", referenceRange: "90 - 120", status: "WITHIN_RANGE", asMetric: { label: "Blood Pressure", unit: "mmHg" } },
        { testName: "Heart Rate", metricKey: "heart_rate", value: "74", numeric: 74, unit: "bpm", referenceRange: "60 - 100", status: "WITHIN_RANGE", asMetric: { label: "Heart Rate", unit: "bpm" } },
        { testName: "Weight", metricKey: "weight", value: "71.5", numeric: 71.5, unit: "kg", referenceRange: null, status: "UNKNOWN", asMetric: { label: "Weight", unit: "kg" } },
        { testName: "Vitamin D (25-OH)", metricKey: "vitamin_d", value: "16.5", numeric: 16.5, unit: "ng/mL", referenceRange: "30 - 100", status: "BELOW_RANGE", asMetric: { label: "Vitamin D", unit: "ng/mL" } },
      ],
    },
  ];

  for (const seed of reportSeeds) {
    const record = await prisma.healthRecord.create({
      data: {
        profileId: self.id,
        type: "LAB_REPORT",
        title: seed.title,
        recordDate: day(seed.date),
        doctorName: seed.doctor,
        facilityName: seed.facility,
        status: "READY",
        fileName: `${seed.date}-${seed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`,
        mimeType: "application/pdf",
        rawText: seed.labs
          .map(
            (lab) =>
              `${lab.testName.padEnd(36)}${String(lab.value).padEnd(14)}${(lab.unit ?? "").padEnd(12)}${lab.referenceRange ?? ""}`,
          )
          .join("\n"),
        ocrProvider: "Demo OCR (built-in mock)",
        ocrConfidence: 0.93,
        extraction: JSON.stringify({ seeded: true, labCount: seed.labs.length }),
        notes: seed.notes ?? null,
      },
    });

    for (const lab of seed.labs) {
      await prisma.labResult.create({
        data: {
          healthRecordId: record.id,
          profileId: self.id,
          testName: lab.testName,
          value: lab.value,
          numericValue: lab.numeric,
          unit: lab.unit,
          referenceRange: lab.referenceRange,
          status: lab.status,
          date: day(seed.date),
          isVerified: true,
        },
      });

      if (lab.asMetric && lab.numeric !== null) {
        await prisma.healthMetric.create({
          data: {
            profileId: self.id,
            metricKey: lab.metricKey ?? "custom",
            label: lab.asMetric.label,
            value: lab.numeric,
            unit: lab.asMetric.unit,
            recordedAt: day(seed.date),
            sourceRecordId: record.id,
          },
        });
        // Blood pressure is stored as two series so the chart can render both.
        if (lab.metricKey === "bp_systolic" && lab.value.includes("/")) {
          const [systolic, diastolic] = lab.value.split("/").map(Number);
          await prisma.healthMetric.updateMany({
            where: { profileId: self.id, metricKey: "bp_systolic", recordedAt: day(seed.date) },
            data: { value: systolic },
          });
          await prisma.healthMetric.create({
            data: {
              profileId: self.id,
              metricKey: "bp_diastolic",
              label: "Blood Pressure",
              value: diastolic,
              unit: "mmHg",
              recordedAt: day(seed.date),
              sourceRecordId: record.id,
            },
          });
        }
      }
    }
  }

  // ── Doctor visit + prescription ───────────────────────────────────────────
  const visit = await prisma.healthRecord.create({
    data: {
      profileId: self.id,
      type: "DOCTOR_VISIT",
      title: "Doctor Visit — Dr. Anil Mehta",
      recordDate: day("2026-09-02"),
      doctorName: "Dr. Anil Mehta",
      facilityName: "Sunrise Family Clinic",
      status: "READY",
      diagnosisTerms: JSON.stringify(["Tiredness", "Evaluation in progress"]),
      rawText: [
        "Chief Complaint: Tiredness and occasional breathlessness on exertion.",
        "Examination:",
        "Blood Pressure 120/80 mmHg",
        "Heart Rate 76 bpm",
        "Weight 71.5 kg",
        "Provisional Diagnosis: Tiredness, evaluation in progress",
        "Advice: Repeat complete blood count after 2 weeks.",
      ].join("\n"),
      ocrProvider: "Demo OCR (built-in mock)",
      ocrConfidence: 0.95,
      notes: "Follow-up in two weeks.",
    },
  });

  const prescription = await prisma.healthRecord.create({
    data: {
      profileId: self.id,
      type: "PRESCRIPTION",
      title: "Prescription — Sunrise Family Clinic",
      recordDate: day("2026-09-08"),
      doctorName: "Dr. Anil Mehta",
      facilityName: "Sunrise Family Clinic",
      status: "READY",
      diagnosisTerms: JSON.stringify(["Acute upper respiratory infection"]),
      rawText: [
        "Rx",
        "1. Tab. Paracetamol 500 mg        1-0-1        x 5 days",
        "2. Tab. Amoxicillin 500 mg        1-1-1        x 7 days",
        "3. Tab. Cholecalciferol 60000 IU  once weekly  x 8 weeks",
      ].join("\n"),
      ocrProvider: "Demo OCR (built-in mock)",
      ocrConfidence: 0.9,
    },
  });

  const medicationSeeds: {
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    startDate: string;
    endDate: string | null;
    status: "ACTIVE" | "COMPLETED" | "UPCOMING";
    slots: string[];
    recordId: string | null;
    notes?: string;
  }[] = [
    { name: "Paracetamol", dosage: "500 mg", frequency: "Twice daily", duration: "5 days", startDate: "2026-09-08", endDate: "2026-09-13", status: "ACTIVE", slots: ["MORNING", "NIGHT"], recordId: prescription.id },
    { name: "Amoxicillin", dosage: "500 mg", frequency: "Three times daily", duration: "7 days", startDate: "2026-09-08", endDate: "2026-09-15", status: "ACTIVE", slots: ["MORNING", "AFTERNOON", "NIGHT"], recordId: prescription.id },
    { name: "Cholecalciferol (Vitamin D3)", dosage: "60000 IU", frequency: "Weekly", duration: "8 weeks", startDate: "2026-09-08", endDate: "2026-11-03", status: "ACTIVE", slots: ["MORNING"], recordId: prescription.id, notes: "Take with milk after food." },
    { name: "Telmisartan", dosage: "40 mg", frequency: "Once daily", duration: "Ongoing", startDate: "2026-09-02", endDate: null, status: "ACTIVE", slots: ["MORNING"], recordId: visit.id, notes: "Prescribed for blood pressure." },
    { name: "Ibuprofen", dosage: "400 mg", frequency: "When needed", duration: "5 days", startDate: "2026-09-08", endDate: "2026-09-13", status: "ACTIVE", slots: [], recordId: prescription.id, notes: "Only if there is pain or fever." },
    { name: "Cetirizine", dosage: "10 mg", frequency: "At night", duration: "5 days", startDate: "2026-08-20", endDate: "2026-08-25", status: "COMPLETED", slots: ["NIGHT"], recordId: null },
    { name: "Calcium + Vitamin D3", dosage: "500 mg", frequency: "Once daily", duration: "3 months", startDate: "2026-10-12", endDate: "2027-01-12", status: "UPCOMING", slots: ["MORNING"], recordId: null, notes: "Starts next week as discussed with the doctor." },
  ];

  for (const medication of medicationSeeds) {
    await prisma.medication.create({
      data: {
        profileId: self.id,
        healthRecordId: medication.recordId,
        name: medication.name,
        dosage: medication.dosage,
        frequency: medication.frequency,
        duration: medication.duration,
        startDate: day(medication.startDate),
        endDate: medication.endDate ? day(medication.endDate) : null,
        status: medication.status,
        slots: JSON.stringify(medication.slots),
        notes: medication.notes ?? null,
        isVerified: true,
      },
    });
  }

  // Today's dose log: the morning doses are already ticked off.
  const today = new Date();
  const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const activeMeds = await prisma.medication.findMany({ where: { profileId: self.id, status: "ACTIVE" } });
  for (const medication of activeMeds) {
    const slots = JSON.parse(medication.slots) as string[];
    for (const [index, slot] of slots.entries()) {
      await prisma.doseLog.create({
        data: {
          medicationId: medication.id,
          profileId: self.id,
          day: dayKey,
          slot,
          time: slot === "MORNING" ? "08:00" : slot === "AFTERNOON" ? "14:00" : slot === "EVENING" ? "18:00" : "20:00",
          status: index === 0 && slot === "MORNING" ? "TAKEN" : "PENDING",
          takenAt: index === 0 && slot === "MORNING" ? new Date() : null,
        },
      });
    }
  }

  // ── Child profile: growth + vaccination ──────────────────────────────────
  const childSeeds: { date: string; title: string; weight: number; height: number; note: string }[] = [
    { date: "2025-07-05", title: "Growth Check-up (Age 6)", weight: 19.8, height: 116.0, note: "Healthy growth for age." },
    { date: "2026-01-10", title: "Growth Check-up (Age 6.5)", weight: 21.0, height: 119.5, note: "Following the expected growth curve." },
    { date: "2026-07-08", title: "Growth Check-up (Age 7)", weight: 22.6, height: 123.0, note: "Growing well. Vaccinations up to date." },
  ];

  for (const seed of childSeeds) {
    const record = await prisma.healthRecord.create({
      data: {
        profileId: child.id,
        type: "DOCTOR_VISIT",
        title: seed.title,
        recordDate: day(seed.date),
        doctorName: "Dr. Priya Kulkarni",
        facilityName: "Little Steps Child Clinic",
        status: "READY",
        diagnosisTerms: JSON.stringify(["Routine growth monitoring"]),
        rawText: `Weight ${seed.weight} kg\nHeight ${seed.height} cm\nNote: ${seed.note}`,
        ocrProvider: "Demo OCR (built-in mock)",
        ocrConfidence: 0.94,
        notes: seed.note,
      },
    });

    await prisma.labResult.createMany({
      data: [
        {
          healthRecordId: record.id,
          profileId: child.id,
          testName: "Weight",
          value: String(seed.weight),
          numericValue: seed.weight,
          unit: "kg",
          referenceRange: null,
          status: "UNKNOWN",
          date: day(seed.date),
          isVerified: true,
        },
        {
          healthRecordId: record.id,
          profileId: child.id,
          testName: "Height",
          value: String(seed.height),
          numericValue: seed.height,
          unit: "cm",
          referenceRange: null,
          status: "UNKNOWN",
          date: day(seed.date),
          isVerified: true,
        },
      ],
    });

    await prisma.healthMetric.createMany({
      data: [
        { profileId: child.id, metricKey: "weight", label: "Weight", value: seed.weight, unit: "kg", recordedAt: day(seed.date), sourceRecordId: record.id },
        { profileId: child.id, metricKey: "height", label: "Height", value: seed.height, unit: "cm", recordedAt: day(seed.date), sourceRecordId: record.id },
      ],
    });
  }

  await prisma.healthRecord.create({
    data: {
      profileId: child.id,
      type: "VACCINATION",
      title: "Vaccination Record — DTP Booster",
      recordDate: day("2026-07-08"),
      doctorName: "Dr. Priya Kulkarni",
      facilityName: "Little Steps Child Clinic",
      status: "READY",
      diagnosisTerms: JSON.stringify(["Routine immunisation"]),
      rawText: "Vaccine: DTP booster\nDose no: 2\nGiven on: 08 Jul 2026\nNext due: after 5 years",
      ocrProvider: "Demo OCR (built-in mock)",
      ocrConfidence: 0.96,
    },
  });

  // ── Elder profile ────────────────────────────────────────────────────────
  const elderRecord = await prisma.healthRecord.create({
    data: {
      profileId: elder.id,
      type: "LAB_REPORT",
      title: "Blood Test — Elder Health Panel",
      recordDate: day("2026-09-20"),
      doctorName: "Dr. Ramesh Iyer",
      facilityName: "Sunrise Family Clinic",
      status: "READY",
      rawText: [
        "Hemoglobin                               11.8          g/dL          12.0 - 15.0        L",
        "Glucose, Fasting                         132           mg/dL         70 - 100           H",
        "HbA1c                                    7.9           %             4.0 - 5.6          H",
        "Blood Pressure                           138/86        mmHg          90 - 120           H",
        "Creatinine                               1.05          mg/dL         0.6 - 1.1",
      ].join("\n"),
      ocrProvider: "Demo OCR (built-in mock)",
      ocrConfidence: 0.91,
    },
  });

  const elderLabs: LabSeed[] = [
    { testName: "Hemoglobin", metricKey: "hemoglobin", value: "11.8", numeric: 11.8, unit: "g/dL", referenceRange: "12.0 - 15.0", status: "BELOW_RANGE", asMetric: { label: "Hemoglobin", unit: "g/dL" } },
    { testName: "Glucose, Fasting", metricKey: "glucose_fasting", value: "132", numeric: 132, unit: "mg/dL", referenceRange: "70 - 100", status: "ABOVE_RANGE", asMetric: { label: "Blood Glucose (fasting)", unit: "mg/dL" } },
    { testName: "HbA1c", metricKey: "hba1c", value: "7.9", numeric: 7.9, unit: "%", referenceRange: "4.0 - 5.6", status: "ABOVE_RANGE", asMetric: { label: "HbA1c", unit: "%" } },
    { testName: "Blood Pressure", metricKey: "bp_systolic", value: "138/86", numeric: 138, unit: "mmHg", referenceRange: "90 - 120", status: "ABOVE_RANGE", asMetric: { label: "Blood Pressure", unit: "mmHg" } },
    { testName: "Creatinine", metricKey: "creatinine", value: "1.05", numeric: 1.05, unit: "mg/dL", referenceRange: "0.6 - 1.1", status: "WITHIN_RANGE" },
  ];

  for (const lab of elderLabs) {
    await prisma.labResult.create({
      data: {
        healthRecordId: elderRecord.id,
        profileId: elder.id,
        testName: lab.testName,
        value: lab.value,
        numericValue: lab.numeric,
        unit: lab.unit,
        referenceRange: lab.referenceRange,
        status: lab.status,
        date: day("2026-09-20"),
        isVerified: true,
      },
    });
    if (lab.asMetric && lab.numeric !== null) {
      await prisma.healthMetric.create({
        data: {
          profileId: elder.id,
          metricKey: lab.metricKey ?? "custom",
          label: lab.asMetric.label,
          value: lab.metricKey === "bp_systolic" && lab.value.includes("/") ? Number(lab.value.split("/")[0]) : lab.numeric,
          unit: lab.asMetric.unit,
          recordedAt: day("2026-09-20"),
          sourceRecordId: elderRecord.id,
        },
      });
      if (lab.metricKey === "bp_systolic" && lab.value.includes("/")) {
        await prisma.healthMetric.create({
          data: {
            profileId: elder.id,
            metricKey: "bp_diastolic",
            label: "Blood Pressure",
            value: Number(lab.value.split("/")[1]),
            unit: "mmHg",
            recordedAt: day("2026-09-20"),
            sourceRecordId: elderRecord.id,
          },
        });
      }
    }
  }

  for (const medication of [
    { name: "Metformin", dosage: "500 mg", frequency: "Twice daily", duration: "Ongoing", slots: ["MORNING", "NIGHT"], startDate: "2025-11-01", notes: "For blood sugar." },
    { name: "Amlodipine", dosage: "5 mg", frequency: "Once daily", duration: "Ongoing", slots: ["MORNING"], startDate: "2025-11-01", notes: "For blood pressure." },
  ]) {
    await prisma.medication.create({
      data: {
        profileId: elder.id,
        healthRecordId: null,
        name: medication.name,
        dosage: medication.dosage,
        frequency: medication.frequency,
        duration: medication.duration,
        startDate: day(medication.startDate),
        endDate: null,
        status: "ACTIVE",
        slots: JSON.stringify(medication.slots),
        notes: medication.notes,
        isVerified: true,
      },
    });
  }

  // ── Drug interaction demo dataset ────────────────────────────────────────
  // DEMO DATA ONLY. Tiny, hand-written, not a clinical reference.
  const interactions: {
    a: string;
    b: string;
    severity: "MINOR" | "MODERATE" | "MAJOR";
    description: string;
    descriptionHi: string;
    action: string;
    actionHi: string;
  }[] = [
    {
      a: "telmisartan",
      b: "ibuprofen",
      severity: "MODERATE",
      description:
        "Non-steroidal anti-inflammatory painkillers like ibuprofen can reduce the blood-pressure effect of telmisartan and may put extra strain on the kidneys, especially when taken regularly.",
      descriptionHi:
        "आइबुप्रोफेन जैसी दर्द निवारक दवाइयाँ टेल्मिसार्टन का रक्तचाप कम करने वाला असर घटा सकती हैं और नियमित रूप से लेने पर गुर्दों पर अतिरिक्त दबाव डाल सकती हैं।",
      action: "Discuss this combination with your doctor or pharmacist before taking the painkiller regularly.",
      actionHi: "दर्द निवारक नियमित रूप से लेने से पहले इस संयोजन पर अपने डॉक्टर या फार्मासिस्ट से बात करें।",
    },
    {
      a: "paracetamol",
      b: "ibuprofen",
      severity: "MINOR",
      description:
        "Paracetamol and ibuprofen are both pain and fever medicines. Taking them together or in overlapping doses can add up, and the daily limits should be respected.",
      descriptionHi:
        "पैरासिटामोल और आइबुप्रोफेन दोनों दर्द और बुखार की दवाइयाँ हैं। इन्हें साथ लेने पर असर जुड़ सकता है, इसलिए दैनिक सीमा का ध्यान रखना ज़रूरी है।",
      action: "Ask your pharmacist how to space these two medicines so the daily limits are not exceeded.",
      actionHi: "फार्मासिस्ट से पूछें कि दोनों दवाइयों के बीच कितना अंतर रखें ताकि दैनिक सीमा न बढ़े।",
    },
    {
      a: "ibuprofen",
      b: "aspirin",
      severity: "MODERATE",
      description:
        "Ibuprofen can reduce the heart-protective effect of low-dose aspirin and increase the chance of stomach irritation when used together.",
      descriptionHi:
        "आइबुप्रोफेन, कम मात्रा वाली एस्पिरिन का हृदय-सुरक्षा प्रभाव घटा सकती है और साथ लेने पर पेट में जलन की संभावना बढ़ सकती है।",
      action: "Discuss the timing of these medicines with your doctor or pharmacist.",
      actionHi: "इन दवाइयों का समय तय करने के लिए डॉक्टर या फार्मासिस्ट से बात करें।",
    },
    {
      a: "ibuprofen",
      b: "warfarin",
      severity: "MAJOR",
      description:
        "Ibuprofen with warfarin is listed as a higher-risk combination because both can increase bleeding risk. This combination should be reviewed by a qualified doctor or pharmacist.",
      descriptionHi:
        "आइबुप्रोफेन और वॉरफ़ेरिन का संयोजन अधिक जोखिम वाला माना जाता है क्योंकि दोनों से रक्तस्राव का खतरा बढ़ सकता है। इस संयोजन की समीक्षा योग्य डॉक्टर या फार्मासिस्ट द्वारा होनी चाहिए।",
      action: "Discuss this combination with your doctor or pharmacist before any change.",
      actionHi: "कोई भी बदलाव करने से पहले इस संयोजन पर डॉक्टर या फार्मासिस्ट से चर्चा करें।",
    },
    {
      a: "amoxicillin",
      b: "warfarin",
      severity: "MODERATE",
      description:
        "Antibiotics like amoxicillin may change how strongly warfarin acts, which can affect blood clotting tests.",
      descriptionHi:
        "अमोक्सिसिलिन जैसी एंटीबायोटिक दवाइयाँ वॉरफ़ेरिन का असर बदल सकती हैं, जिससे खून के थक्के बनने से जुड़ी जाँच प्रभावित हो सकती है।",
      action: "Tell your doctor you are taking an antibiotic so clotting tests can be reviewed.",
      actionHi: "डॉक्टर को बताएँ कि आप एंटीबायोटिक ले रहे हैं, ताकि जाँच की समीक्षा हो सके।",
    },
    {
      a: "calcium",
      b: "levothyroxine",
      severity: "MODERATE",
      description:
        "Calcium supplements can reduce how much thyroid medicine is absorbed if both are taken at the same time.",
      descriptionHi:
        "कैल्शियम सप्लीमेंट और थायरॉइड की दवा एक साथ लेने पर दवा का अवशोषण घट सकता है।",
      action: "Ask your doctor or pharmacist how many hours apart these should be taken.",
      actionHi: "डॉक्टर या फार्मासिस्ट से पूछें कि दोनों के बीच कितने घंटे का अंतर रखें।",
    },
    {
      a: "clopidogrel",
      b: "pantoprazole",
      severity: "MODERATE",
      description:
        "Some stomach-acid medicines can reduce the effect of clopidogrel, a medicine used to prevent clots.",
      descriptionHi:
        "पेट की कुछ दवाइयाँ क्लोपिडोग्रेल का असर कम कर सकती हैं, जो खून के थक्के रोकने के लिए दी जाती है।",
      action: "Ask your doctor whether a different stomach medicine is more suitable with clopidogrel.",
      actionHi: "डॉक्टर से पूछें कि क्लोपिडोग्रेल के साथ कौन सी पेट की दवा अधिक उपयुक्त रहेगी।",
    },
    {
      a: "metformin",
      b: "alcohol",
      severity: "MODERATE",
      description:
        "Alcohol can increase the risk of low blood sugar and stomach upset when taking metformin.",
      descriptionHi: "मेटफॉर्मिन लेते समय शराब से ब्लड शुगर कम होने और पेट की तकलीफ का खतरा बढ़ सकता है।",
      action: "Ask your doctor what is safe for you regarding alcohol.",
      actionHi: "शराब के बारे में अपने लिए क्या सुरक्षित है, यह डॉक्टर से पूछें।",
    },
    {
      a: "atorvastatin",
      b: "azithromycin",
      severity: "MODERATE",
      description:
        "Some antibiotics are listed with statins because muscle-related side effects may become more likely.",
      descriptionHi:
        "कुछ एंटीबायोटिक और स्टैटिन साथ लेने पर मांसपेशियों से जुड़े दुष्प्रभावों की संभावना बढ़ सकती है।",
      action: "Tell your doctor about muscle pain or weakness while taking both.",
      actionHi: "दोनों दवाइयाँ लेते समय मांसपेशियों में दर्द या कमज़ोरी हो तो डॉक्टर को बताएँ।",
    },
  ];

  for (const interaction of interactions) {
    const [first, second] = [interaction.a, interaction.b].sort();
    const pairKey = `${first}|${second}`;
    await prisma.drugInteraction.upsert({
      where: { pairKey },
      update: {
        medicineA: first,
        medicineB: second,
        severity: interaction.severity,
        description: interaction.description,
        descriptionHi: interaction.descriptionHi,
        action: interaction.action,
        actionHi: interaction.actionHi,
        source: "DEMO_DATASET",
      },
      create: {
        pairKey,
        medicineA: first,
        medicineB: second,
        severity: interaction.severity,
        description: interaction.description,
        descriptionHi: interaction.descriptionHi,
        action: interaction.action,
        actionHi: interaction.actionHi,
        source: "DEMO_DATASET",
      },
    });
  }

  // A consent row stands in for the ABDM consent artefact in this demo.
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "demo.seed",
      entityType: "User",
      entityId: user.id,
      meta: JSON.stringify({
        profiles: 3,
        records: reportSeeds.length + 3,
        interactions: interactions.length,
        fingerprint: createHash("sha256").update(user.id).digest("hex").slice(0, 12),
      }),
    },
  });

  const counts = {
    profiles: await prisma.healthProfile.count({ where: { userId: user.id } }),
    records: await prisma.healthRecord.count({ where: { profile: { userId: user.id } } }),
    labResults: await prisma.labResult.count({ where: { profile: { userId: user.id } } }),
    medications: await prisma.medication.count({ where: { profile: { userId: user.id } } }),
    metrics: await prisma.healthMetric.count({ where: { profile: { userId: user.id } } }),
    interactions: await prisma.drugInteraction.count(),
  };

  console.log("[demo] demo data ready (all fictional):", counts);
  return counts;
}
