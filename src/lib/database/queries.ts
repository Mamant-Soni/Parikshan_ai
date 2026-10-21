import { prisma } from "./client";
import { evaluateAgainstRange, getMetric, metricKeyForTestName, METRICS, parseReferenceRange, unitsCompatible } from "@/lib/health/metrics";
import { buildInsights, type Insight, type MetricLike } from "@/lib/health/insights";
import { toDayKey } from "@/lib/i18n/format";
import type { AIContext, AIContextMetric, AIContextRecord } from "@/lib/ai/types";
import type { HealthSummarySections, Language } from "@/types/domain";

/**
 * Read-side data access.
 *
 * Every function takes a profile id that has already been ownership-checked by
 * the caller (see src/lib/auth/guards.ts) so a page can never read another
 * person's records. Nothing here logs medical payloads.
 */

const metricLike = (row: {
  metricKey: string;
  label: string;
  value: number;
  unit: string;
  recordedAt: Date;
  sourceRecordId: string | null;
  referenceRange?: string | null;
  sourceRecordTitle?: string | null;
}): MetricLike => ({
  metricKey: row.metricKey,
  label: row.label,
  value: row.value,
  unit: row.unit,
  recordedAt: row.recordedAt,
  referenceRange: row.referenceRange ?? null,
  sourceRecordId: row.sourceRecordId,
  sourceRecordTitle: row.sourceRecordTitle ?? null,
});

/** Latest value per metric, plus the previous reading for comparison. */
export async function getMetricSummaries(profileId: string) {
  const [rows, labResults] = await Promise.all([
    prisma.healthMetric.findMany({
      where: { profileId },
      orderBy: { recordedAt: "desc" },
      include: { sourceRecord: { select: { id: true, title: true, recordDate: true } } },
    }),
    prisma.labResult.findMany({
      where: { profileId },
      orderBy: { date: "desc" },
      select: { healthRecordId: true, testName: true, referenceRange: true, status: true, criticalFlag: true, confidence: true, date: true },
    }),
  ]);

  // Only use the reference range attached to the report that produced the
  // latest reading, so no general or unrelated clinical thresholds are implied.
  const rangeByRecordAndMetric = new Map<string, (typeof labResults)[number]>();
  for (const result of labResults) {
    const key = metricKeyForTestName(result.testName);
    const recordMetricKey = key ? `${result.healthRecordId}:${key}` : null;
    if (recordMetricKey && !rangeByRecordAndMetric.has(recordMetricKey)) {
      rangeByRecordAndMetric.set(recordMetricKey, result);
    }
  }

  type Group = { latest: (typeof rows)[number]; previous?: (typeof rows)[number] };
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const group = groups.get(row.metricKey);
    if (!group) groups.set(row.metricKey, { latest: row });
    else if (!group.previous) group.previous = row;
  }

  return [...groups.entries()]
    .map(([metricKey, group]) => {
      const definition = getMetric(metricKey);
      const latestReport = group.latest.sourceRecordId
        ? rangeByRecordAndMetric.get(`${group.latest.sourceRecordId}:${metricKey}`)
        : undefined;
      const parsedRange = parseReferenceRange(latestReport?.referenceRange);
      const unitsMatch = !parsedRange?.unit || unitsCompatible(group.latest.unit, parsedRange.unit);
      const derivedStatus = latestReport?.criticalFlag && (latestReport.confidence ?? 0) >= 0.65
        ? "CRITICAL"
        : unitsMatch
          ? evaluateAgainstRange(group.latest.value, latestReport?.referenceRange, group.latest.unit)
          : "UNKNOWN";
      const storedStatus = latestReport?.status;
      const status = derivedStatus !== "UNKNOWN"
        ? derivedStatus
        : unitsMatch && (storedStatus === "WITHIN_RANGE" || storedStatus === "BELOW_RANGE" || storedStatus === "ABOVE_RANGE")
          ? storedStatus
          : "UNKNOWN";
      const delta = group.previous ? group.latest.value - group.previous.value : undefined;
      return {
        metricKey,
        label: group.latest.label,
        unit: group.latest.unit,
        value: group.latest.value,
        status,
        recordedAt: group.latest.recordedAt,
        previousValue: group.previous?.value,
        previousDate: group.previous?.recordedAt,
        delta,
        direction: delta === undefined ? "unknown" : Math.abs(delta) < 0.05 ? "flat" : delta > 0 ? "up" : "down",
        sourceRecordId: group.latest.sourceRecordId,
        sourceRecordTitle: group.latest.sourceRecord?.title ?? null,
        isFeatured: Boolean(definition?.featured),
        pairedWith: definition?.pairedWith ?? null,
        decimals: definition?.decimals,
      };
    })
    .sort((a, b) => {
      if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
      return b.recordedAt.getTime() - a.recordedAt.getTime();
    });
}

export async function getInsights(profileId: string, max = 3): Promise<Insight[]> {
  const rows = await prisma.healthMetric.findMany({
    where: { profileId },
    include: {
      sourceRecord: { select: { id: true, title: true } },
    },
    orderBy: { recordedAt: "asc" },
  });
  return buildInsights(rows.map(metricLike), max);
}

export async function getRecentRecords(profileId: string, take = 4) {
  const records = await prisma.healthRecord.findMany({
    where: { profileId },
    orderBy: [{ recordDate: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      _count: { select: { labResults: true, medications: true } },
    },
  });
  return records.map((record) => ({
    id: record.id,
    type: record.type,
    title: record.title,
    recordDate: record.recordDate,
    doctorName: record.doctorName,
    facilityName: record.facilityName,
    status: record.status,
    labCount: record._count.labResults,
    medicineCount: record._count.medications,
    hasSummary: Boolean(record.aiSummary),
    filePath: record.filePath,
  }));
}

export type RecordSummaryCard = Awaited<ReturnType<typeof getRecentRecords>>[number];

export async function getRecordDetail(recordId: string) {
  return prisma.healthRecord.findUnique({
    where: { id: recordId },
    include: {
      labResults: { orderBy: { id: "asc" } },
      medications: { orderBy: { createdAt: "asc" } },
      profile: { select: { id: true, name: true, kind: true, userId: true } },
    },
  });
}

export async function getMedicationsWithDoses(profileId: string, day = toDayKey()) {
  const medications = await prisma.medication.findMany({
    where: { profileId },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: {
      doseLogs: { where: { day } },
      healthRecord: { select: { id: true, title: true } },
    },
  });
  return medications.map((medication) => ({
    ...medication,
    slotsList: safeJsonArray(medication.slots),
    todayLogs: medication.doseLogs,
  }));
}

export type MedicationWithDoses = Awaited<ReturnType<typeof getMedicationsWithDoses>>[number];

export async function getMedicationsList(profileId: string) {
  return prisma.medication.findMany({
    where: { profileId },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });
}

/** Metric series for the trends screen; returns everything the chart needs. */
export async function getMetricSeries(profileId: string) {
  const rows = await prisma.healthMetric.findMany({
    where: { profileId },
    orderBy: { recordedAt: "asc" },
    include: { sourceRecord: { select: { id: true, title: true } } },
  });

  const grouped = new Map<
    string,
    { metricKey: string; label: string; unit: string; points: { date: string; value: number; recordId: string | null; recordTitle: string | null }[]; referenceRanges: string[] }
  >();

  for (const row of rows) {
    const entry = grouped.get(row.metricKey) ?? {
      metricKey: row.metricKey,
      label: row.label,
      unit: row.unit,
      points: [],
      referenceRanges: [],
    };
    entry.points.push({
      date: row.recordedAt.toISOString(),
      value: row.value,
      recordId: row.sourceRecordId,
      recordTitle: row.sourceRecord?.title ?? null,
    });
    grouped.set(row.metricKey, entry);
  }

  // Reference ranges come from the LabResult rows of the same metric.
  const ranges = await prisma.labResult.findMany({
    where: { profileId, referenceRange: { not: null } },
    select: { testName: true, referenceRange: true },
  });
  for (const row of ranges) {
    const metric = METRICS.find((definition) =>
      definition.aliases.some((alias) => row.testName.toLowerCase().includes(alias)),
    );
    if (!metric) continue;
    const entry = grouped.get(metric.key);
    if (entry?.referenceRanges.length === 0 && row.referenceRange) entry.referenceRanges.push(row.referenceRange);
  }

  return [...grouped.values()].map((entry) => ({
    ...entry,
    referenceRange: entry.referenceRanges[0] ?? null,
  }));
}

export type MetricSeries = Awaited<ReturnType<typeof getMetricSeries>>[number];

export async function getTimelineRecords(profileId: string) {
  const records = await prisma.healthRecord.findMany({
    where: { profileId },
    orderBy: [{ recordDate: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { labResults: true, medications: true } } },
  });
  return records.map((record) => ({
    id: record.id,
    type: record.type,
    title: record.title,
    recordDate: record.recordDate,
    doctorName: record.doctorName,
    facilityName: record.facilityName,
    diagnosisTerms: safeJsonArray(record.diagnosisTerms),
    labCount: record._count.labResults,
    medicineCount: record._count.medications,
    plainSummary: extractPlainSummary(record.aiSummary),
  }));
}

export type TimelineRecord = Awaited<ReturnType<typeof getTimelineRecords>>[number];

export async function getProfilesOverview(userId: string) {
  const profiles = await prisma.healthProfile.findMany({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { records: true, medications: true, metrics: true } },
    },
  });
  return profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    relationship: profile.relationship,
    kind: profile.kind,
    dateOfBirth: profile.dateOfBirth,
    avatarEmoji: profile.avatarEmoji,
    isPrimary: profile.isPrimary,
    isDemo: profile.isDemo,
    recordCount: profile._count.records,
    medicationCount: profile._count.medications,
    metricCount: profile._count.metrics,
  }));
}

export type ProfileOverview = Awaited<ReturnType<typeof getProfilesOverview>>[number];

export async function getChatHistory(profileId: string, take = 50) {
  const messages = await prisma.chatMessage.findMany({
    where: { profileId },
    orderBy: { createdAt: "asc" },
    take,
  });
  return messages.map((message) => ({
    id: message.id,
    role: message.role === "user" ? ("user" as const) : ("assistant" as const),
    content: message.content,
    sources: parseSources(message.sources),
    grounded: message.grounded,
    intent: message.intent,
    createdAt: message.createdAt.toISOString(),
  }));
}

export type ChatHistoryMessage = Awaited<ReturnType<typeof getChatHistory>>[number];

/**
 * Recent turns for the assistant prompt.
 *
 * Scoped to a profile id that was already ownership-checked, so a follow-up
 * question can only reuse history from the same person. Returns the oldest first
 * because providers read the conversation top-to-bottom.
 */
export async function getRecentChatHistory(profileId: string, take = 6) {
  const messages = await prisma.chatMessage.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    take,
    select: { role: true, content: true },
  });
  return messages
    .reverse()
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: message.content,
    }));
}

export async function getDashboardSnapshot(userId: string, profileId: string, profileName: string) {
  const [metricSummaries, insights, records, medications, dosesToday] = await Promise.all([
    getMetricSummaries(profileId),
    getInsights(profileId),
    getRecentRecords(profileId),
    getMedicationsWithDoses(profileId),
    prisma.doseLog.count({ where: { profileId, day: toDayKey(), status: "TAKEN" } }),
  ]);
  void userId;

  const activeMedications = medications.filter((medication) => medication.status === "ACTIVE");
  const scheduledToday = medications.flatMap((medication) =>
    medication.slotsList.map((slot) => ({ medicationId: medication.id, name: medication.name, slot })),
  );

  return {
    profileName,
    metricSummaries,
    insights,
    records,
    activeMedications,
    allMedications: medications,
    dosesTakenToday: dosesToday,
    dosesScheduledToday: scheduledToday.length,
  };
}

export type DashboardSnapshot = Awaited<ReturnType<typeof getDashboardSnapshot>>;

/** Builds the grounded context handed to the AI providers. */
export async function getAIContext(
  profileId: string,
  profile: { name: string; kind: string },
  language: Language,
): Promise<AIContext> {
  const [records, medications, metrics] = await Promise.all([
    prisma.healthRecord.findMany({
      where: { profileId },
      orderBy: { recordDate: "desc" },
      take: 25,
      include: {
        labResults: { orderBy: { id: "asc" } },
        medications: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.medication.findMany({
      where: { profileId },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
    }),
    prisma.healthMetric.findMany({
      where: { profileId },
      orderBy: { recordedAt: "asc" },
      include: { sourceRecord: { select: { id: true, title: true } } },
    }),
  ]);

  const contextRecords: AIContextRecord[] = records.map((record) => ({
    id: record.id,
    type: record.type,
    title: record.title,
    date: record.recordDate,
    doctorName: record.doctorName,
    facilityName: record.facilityName,
    diagnosisTerms: safeJsonArray(record.diagnosisTerms),
    status: record.status,
    ocrConfidence: record.ocrConfidence,
    labValues: record.labResults.map((value) => ({
      testName: value.testName,
      metricKey: value.numericValue !== null ? getMetricKeyFor(value.testName) : null,
      value: value.value,
      numericValue: value.numericValue,
      unit: value.unit,
      referenceRange: value.referenceRange,
      status: value.status as AIContextRecord["labValues"][number]["status"],
      isVerified: value.isVerified,
    })),
    medicines: record.medications.map((medicine) => ({
      name: medicine.name,
      dosage: medicine.dosage,
      frequency: medicine.frequency,
      duration: medicine.duration,
      status: medicine.status,
    })),
    summary: extractPlainSummary(record.aiSummary),
  }));

  const contextMetrics: AIContextMetric[] = metrics.map((metric) => ({
    metricKey: metric.metricKey,
    label: metric.label,
    value: metric.value,
    unit: metric.unit,
    recordedAt: metric.recordedAt,
    referenceRange: null,
    sourceRecordId: metric.sourceRecordId,
    sourceRecordTitle: metric.sourceRecord?.title ?? null,
  }));

  // Attach the reference range printed on the report to the matching metric.
  const ranges = await prisma.labResult.findMany({
    where: { profileId, referenceRange: { not: null } },
    select: { testName: true, referenceRange: true },
  });
  for (const metric of contextMetrics) {
    const match = ranges.find(
      (range) => range.referenceRange && getMetricKeyFor(range.testName) === metric.metricKey,
    );
    metric.referenceRange = match?.referenceRange ?? null;
  }

  return {
    profileName: profile.name,
    isChild: profile.kind === "CHILD",
    isElder: profile.kind === "ELDER",
    language,
    records: contextRecords,
    medications: medications.map((medicine) => ({
      name: medicine.name,
      dosage: medicine.dosage,
      frequency: medicine.frequency,
      duration: medicine.duration,
      status: medicine.status,
    })),
    metrics: contextMetrics,
    today: new Date(),
  };
}

function getMetricKeyFor(testName: string): string | null {
  return getMetricKeyCached(testName);
}

const metricKeyCache = new Map<string, string | null>();
function getMetricKeyCached(testName: string): string | null {
  if (metricKeyCache.has(testName)) return metricKeyCache.get(testName) ?? null;
  const needle = testName.toLowerCase();
  const metric = METRICS.find((definition) =>
    definition.aliases.some((alias) => needle.includes(alias)),
  );
  const key = metric?.key ?? null;
  metricKeyCache.set(testName, key);
  return key;
}

// ── Small helpers ───────────────────────────────────────────────────────────

export function safeJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Reads a stored AI summary back out of the database.
 *
 * Stored summaries are trusted exactly as much as the OCR text they came from,
 * so every field is validated here and a malformed blob degrades to `null`
 * (the UI then offers to regenerate) instead of crashing the page.
 */
export function parseSummarySections(value: string | null | undefined): HealthSummarySections | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<HealthSummarySections>;
    if (!parsed || typeof parsed.whatItSays !== "string") return null;
    const strings = (input: unknown): string[] =>
      Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
    return {
      whatItSays: parsed.whatItSays,
      looksNormal: strings(parsed.looksNormal),
      needsAttention: strings(parsed.needsAttention),
      termExplanations: Array.isArray(parsed.termExplanations)
        ? parsed.termExplanations.filter(
            (item): item is { term: string; explanation: string } =>
              Boolean(item) && typeof item.term === "string" && typeof item.explanation === "string",
          )
        : [],
      discussWithDoctor: strings(parsed.discussWithDoctor),
      plainSummary: typeof parsed.plainSummary === "string" ? parsed.plainSummary : parsed.whatItSays,
    };
  } catch {
    return null;
  }
}

/** Mirrors `parseSummarySections` for the plain-language line only. */
export function parseCorrectionCount(value: string | null | undefined): number {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Parses persisted source references.
 *
 * Old rows only have `{recordId,title,date,type}`. New rows also carry facts,
 * OCR confidence and a review flag. Everything is validated because the stored
 * JSON came from a provider at some point and must not be trusted blindly.
 */
function parseSources(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.recordId === "string")
      .map((item) => {
        const facts = Array.isArray(item.facts)
          ? item.facts
              .filter(
                (fact: unknown): fact is Record<string, unknown> =>
                  Boolean(fact) &&
                  typeof (fact as Record<string, unknown>).testName === "string" &&
                  typeof (fact as Record<string, unknown>).value === "string",
              )
              .slice(0, 6)
              .map((fact: Record<string, unknown>) => ({
                testName: String(fact.testName),
                value: String(fact.value),
                unit: typeof fact.unit === "string" ? fact.unit : null,
                referenceRange:
                  typeof fact.referenceRange === "string" ? fact.referenceRange : null,
                status:
                  fact.status === "WITHIN_RANGE" ||
                  fact.status === "BELOW_RANGE" ||
                  fact.status === "ABOVE_RANGE"
                    ? fact.status
                    : ("UNKNOWN" as const),
                isVerified: fact.isVerified === true,
              }))
          : undefined;
        return {
          recordId: item.recordId,
          title: typeof item.title === "string" ? item.title : "",
          date: typeof item.date === "string" ? item.date : "",
          type: typeof item.type === "string" ? item.type : "OTHER",
          ...(facts && facts.length ? { facts } : {}),
          ...(typeof item.ocrConfidence === "number" ? { ocrConfidence: item.ocrConfidence } : {}),
          ...(item.needsReview === true ? { needsReview: true } : {}),
        };
      });
  } catch {
    return [];
  }
}

export function extractPlainSummary(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { plainSummary?: string };
    return typeof parsed.plainSummary === "string" ? parsed.plainSummary : null;
  } catch {
    return null;
  }
}
