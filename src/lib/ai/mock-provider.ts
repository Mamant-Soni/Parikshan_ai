import type { ChatAnswer, ChatSource, HealthSummarySections, Language } from "@/types/domain";
import { findGlossaryEntry } from "@/lib/medical/glossary";
import { getMetric, metricKeyForTestName } from "@/lib/health/metrics";
import { formatDate } from "@/lib/i18n/format";
import { translate } from "@/lib/i18n";
import { isFollowUpQuestion } from "@/lib/voice/transcript";
import { notFoundSentence } from "./prompt";
import type {
  AIContext,
  AIContextMetric,
  AIContextRecord,
  HealthAIProvider,
  QuestionRequest,
  QuestionResponse,
  SummaryRequest,
  SummaryResponse,
} from "./types";

/**
 * MockHealthAIProvider — the default provider.
 *
 * This is NOT a language model: it is a deterministic reasoner over the user's
 * own records. That is exactly what makes it useful for a demo — it can never
 * hallucinate a medicine, a value or a date, because every sentence it produces
 * is derived from a stored row. It also means the app works with no API key.
 */

const pick = (language: Language, en: string, hi: string) => (language === "hi" ? hi : en);

function toSources(records: AIContextRecord[]): ChatSource[] {
  return records.map((record) => ({
    recordId: record.id,
    title: record.title,
    date: record.date.toISOString(),
    type: record.type,
  }));
}

function formatValue(
  value: number,
  unit: string | null,
  language: Language,
  /** The exact string printed on the report, when it is available. */
  displayValue?: string | null,
): string {
  const rounded =
    displayValue?.trim() ||
    (Number.isInteger(value) ? String(value) : value.toFixed(1));
  return unit ? `${rounded} ${unit}` : rounded;
}

/**
 * Metrics are stored as floats, which loses trailing precision ("11.0" → 11).
 * When the source lab row is in the same context, quote its original string so
 * the spoken answer matches what the report actually printed.
 */
function reportValueFor(
  context: AIContext,
  metricKey: string | null | undefined,
  sourceRecordId: string | null | undefined,
  value: number,
): string | null {
  if (!metricKey) return null;
  for (const record of context.records) {
    if (sourceRecordId && record.id !== sourceRecordId) continue;
    for (const lab of record.labValues) {
      if (lab.metricKey === metricKey && lab.numericValue === value && lab.value.trim()) {
        return lab.value.trim();
      }
    }
  }
  return null;
}

const STATUS_TEXT: Record<string, { en: string; hi: string }> = {
  WITHIN_RANGE: { en: "within the reference range on your report", hi: "आपकी रिपोर्ट की संदर्भ सीमा के भीतर" },
  BELOW_RANGE: { en: "below the reference range on your report", hi: "आपकी रिपोर्ट की संदर्भ सीमा से कम" },
  ABOVE_RANGE: { en: "above the reference range on your report", hi: "आपकी रिपोर्ट की संदर्भ सीमा से ज़्यादा" },
  UNKNOWN: { en: "recorded without a reference range", hi: "बिना संदर्भ सीमा के दर्ज" },
};

// ── Intent detection (works for English + Hindi keywords) ───────────────────

type Intent =
  | "medications_active"
  | "medications_history"
  | "lab_lookup"
  | "trend"
  | "last_upload"
  | "explain_report"
  | "browse_records"
  | "provider"
  | "unknown";

const INTENT_PATTERNS: { intent: Intent; patterns: RegExp[] }[] = [
  { intent: "medications_active", patterns: [/medicine|medicines|medication|tablet|capsule|dose|taking|दवा|दवाइय|गोली/i] },
  { intent: "medications_history", patterns: [/prescrib|prescription|which medicines|दवा.*लिख|प्रिस्क्रिप्शन/i] },
  { intent: "last_upload", patterns: [/when did i|last upload|latest report|कब अपलोड|आखिरी|पिछली बार.*अपलोड/i] },
  { intent: "trend", patterns: [/chang|trend|improv|worsen|compar|बदल|रुझान|सुधार|बढ़|घट/i] },
  { intent: "explain_report", patterns: [/explain|simple language|what does.*mean|understand|samjha|समझा|मतलब|आसान भाषा/i] },
  { intent: "provider", patterns: [/doctor|dr\.|hospital|clinic|facility|डॉक्टर|अस्पताल/i] },
  { intent: "browse_records", patterns: [/reports?|records?|uploaded|documents|रिपोर्ट|रिकॉर्ड|दस्तावेज़/i] },
];

function detectIntent(question: string): Intent {
  for (const entry of INTENT_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(question))) return entry.intent;
  }
  return "unknown";
}

/** Finds the metric the question is about, using aliases + glossary terms. */
function detectMetric(question: string): { metricKey: string | null; label: string | null } {
  const direct = metricKeyForTestName(question);
  if (direct) {
    const metric = getMetric(direct);
    return { metricKey: direct, label: metric?.labelKey ? null : null };
  }
  const entry = findGlossaryEntry(question);
  if (entry) {
    const metric = metricKeyForTestName(entry.term);
    if (metric) return { metricKey: metric, label: entry.term };
  }
  // Handle "blood pressure" as the composite metric.
  if (/blood pressure|\bbp\b|रक्तचाप/i.test(question)) return { metricKey: "bp_systolic", label: "Blood Pressure" };
  return { metricKey: null, label: null };
}

/**
 * Follow-up resolution.
 *
 * "And before that?" has no metric of its own. If the current question looks
 * like a follow-up, the most recent user question is used ONLY to find the
 * metric — never to widen the record scope. The context itself is still loaded
 * from the signed-in profile on every request.
 */
function resolveMetric(question: string, history?: QuestionRequest["history"]) {
  const direct = detectMetric(question);
  if (direct.metricKey || !history?.length || !isFollowUpQuestion(question)) return direct;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (turn?.role !== "user") continue;
    const inherited = detectMetric(turn.content);
    if (inherited.metricKey) return inherited;
  }
  return direct;
}

// ── Answer builders ─────────────────────────────────────────────────────────

function answerMedicationsActive(context: AIContext, language: Language): QuestionResponse {
  const active = context.medications.filter((medicine) => medicine.status === "ACTIVE");
  const list = active.length ? active : context.medications;
  if (!list.length) return notFound(context, language, "medications_active", "medicines");

  const lines = list.map((medicine) => {
    const parts = [medicine.name];
    if (medicine.dosage) parts.push(medicine.dosage);
    if (medicine.frequency) parts.push(medicine.frequency);
    if (medicine.duration) parts.push(medicine.duration);
    return `• ${parts.join(" — ")}`;
  });

  const intro = active.length
    ? pick(language, `According to your uploaded records you have ${active.length} active medicine${active.length > 1 ? "s" : ""}:`, `आपके अपलोड किए रिकॉर्ड के अनुसार ${active.length} दवाइयाँ चल रही हैं:`)
    : pick(language, "Your records mention these medicines:", "आपके रिकॉर्ड में ये दवाइयाँ दर्ज हैं:");

  const sourceRecords = context.records.filter((record) => record.medicines.length > 0).slice(0, 3);

  return {
    content: [
      intro,
      ...lines,
      "",
      pick(
        language,
        "This list comes only from your uploaded prescriptions. Do not stop or change any medicine on your own — speak to your doctor or pharmacist.",
        "यह सूची केवल आपके अपलोड किए प्रिस्क्रिप्शन से है। कृपया खुद से कोई दवा बंद या बदलें नहीं — डॉक्टर या फार्मासिस्ट से बात करें।",
      ),
    ].join("\n"),
    sources: toSources(sourceRecords),
    grounded: true,
    intent: "medications_active",
    provider: "mock",
    isMock: true,
  };
}

function answerLabLookup(
  context: AIContext,
  language: Language,
  metricKey: string | null,
  question: string,
): QuestionResponse {
  const metric = metricKey ? getMetric(metricKey) : undefined;
  const series = metricKey
    ? context.metrics.filter((item) => item.metricKey === metricKey)
    : context.metrics.filter((item) => question.toLowerCase().includes(item.label.toLowerCase()));

  if (!series.length) {
    // Fall back to searching lab values inside records (e.g. unusual test names).
    const match = findLabValueInRecords(context, question);
    if (match) {
      const status = STATUS_TEXT[match.value.status] ?? STATUS_TEXT.UNKNOWN;
      return {
        content: [
          `${match.value.testName}: ${match.value.value}${match.value.unit ? ` ${match.value.unit}` : ""}`,
          `${pick(language, "Recorded in", "दर्ज")} ${match.record.title} (${formatDate(match.record.date, language)}).`,
          pick(language, `This result is ${status[language]}.`, `यह परिणाम ${status[language]} है।`),
          pick(language, "Discuss this with your doctor.", "इस पर अपने डॉक्टर से बात करें।"),
        ].join("\n"),
        sources: toSources([match.record]),
        grounded: true,
        intent: "lab_lookup",
        provider: "mock",
        isMock: true,
      };
    }
    return notFound(context, language, "lab_lookup", metricKey ?? question);
  }

  const sorted = [...series].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const latest = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];
  const label = latest.label || metric?.key || "Value";

  const latestDisplay = reportValueFor(context, latest.metricKey ?? metricKey, latest.sourceRecordId, latest.value);
  const previousDisplay = previous
    ? reportValueFor(context, previous.metricKey ?? metricKey, previous.sourceRecordId, previous.value)
    : null;
  const latestText = formatValue(latest.value, latest.unit, language, latestDisplay);
  const previousText = previous
    ? formatValue(previous.value, previous.unit, language, previousDisplay)
    : "";

  const lines = [
    pick(language, `Your most recent ${label} was ${latestText}.`, `आपका सबसे नया ${label} ${latestText} था।`),
    `${pick(language, "From", "स्रोत")}: ${latest.sourceRecordTitle ?? "—"} (${formatDate(latest.recordedAt, language)})`,
  ];

  if (previous) {
    const delta = latest.value - previous.value;
    const direction =
      Math.abs(delta) < 0.05
        ? pick(language, "about the same", "लगभग वही है")
        : delta > 0
          ? pick(language, "higher", "ज़्यादा है")
          : pick(language, "lower", "कम है");
    lines.push(
      pick(
        language,
        `Compared with your previous report (${previousText} on ${formatDate(previous.recordedAt, language)}) it is ${direction}.`,
        `पिछली रिपोर्ट (${previousText}, ${formatDate(previous.recordedAt, language)}) की तुलना में यह ${direction}।`,
      ),
    );
  }

  if (metricKey === "bp_systolic") {
    const last = context.metrics
      .filter((item) => item.metricKey === "bp_diastolic")
      .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
    if (last && Math.abs(last.recordedAt.getTime() - latest.recordedAt.getTime()) < 86_400_000) {
      lines[0] = pick(
        language,
        `Your most recent blood pressure was ${formatValue(latest.value, null, language, reportValueFor(context, "bp_systolic", latest.sourceRecordId, latest.value))}/${formatValue(last.value, null, language, reportValueFor(context, "bp_diastolic", last.sourceRecordId, last.value))} mmHg.`,
        `आपका सबसे नया रक्तचाप ${formatValue(latest.value, null, language, reportValueFor(context, "bp_systolic", latest.sourceRecordId, latest.value))}/${formatValue(last.value, null, language, reportValueFor(context, "bp_diastolic", last.sourceRecordId, last.value))} mmHg था।`,
      );
    }
  }

  lines.push("");
  lines.push(
    pick(
      language,
      "A single reading is not a diagnosis. Your doctor can interpret it with your full history.",
      "एक जाँच निदान नहीं है। आपके डॉक्टर इसे पूरे इतिहास के साथ समझाएँगे।",
    ),
  );

  const sourceRecords = context.records.filter((record) =>
    record.id === latest.sourceRecordId || record.id === previous?.sourceRecordId,
  );

  return {
    content: lines.join("\n"),
    sources: toSources(sourceRecords.length ? sourceRecords : context.records.slice(0, 1)),
    grounded: true,
    intent: "lab_lookup",
    provider: "mock",
    isMock: true,
  };
}

function answerTrend(
  context: AIContext,
  language: Language,
  question: string,
  inheritedMetricKey?: string | null,
): QuestionResponse {
  const { metricKey } = inheritedMetricKey
    ? { metricKey: inheritedMetricKey }
    : detectMetric(question);
  const candidates = metricKey
    ? [metricKey]
    : [...new Set(context.metrics.map((metric) => metric.metricKey))];

  const changed: string[] = [];
  const sourceRecords: AIContextRecord[] = [];

  for (const key of candidates) {
    const series = context.metrics
      .filter((metric) => metric.metricKey === key)
      .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    if (series.length < 2) continue;
    const latest = series[series.length - 1];
    const previous = series[series.length - 2];
    const delta = latest.value - previous.value;
    if (Math.abs(delta) < 0.05) continue;
    const label = latest.label;
    const latestDisplay = reportValueFor(context, latest.metricKey, latest.sourceRecordId, latest.value);
    const previousDisplay = reportValueFor(context, previous.metricKey, previous.sourceRecordId, previous.value);
    changed.push(
      pick(
        language,
        `• ${label} ${delta > 0 ? "increased" : "decreased"} from ${formatValue(previous.value, previous.unit, language, previousDisplay)} to ${formatValue(latest.value, latest.unit, language, latestDisplay)} (${formatDate(previous.recordedAt, language)} → ${formatDate(latest.recordedAt, language)}).`,
        `• ${label} ${delta > 0 ? "बढ़ा" : "घटा"}: ${formatValue(previous.value, previous.unit, language, previousDisplay)} से ${formatValue(latest.value, latest.unit, language, latestDisplay)} (${formatDate(previous.recordedAt, language)} → ${formatDate(latest.recordedAt, language)})।`,
      ),
    );
    for (const item of [latest, previous]) {
      const record = context.records.find((entry) => entry.id === item.sourceRecordId);
      if (record && !sourceRecords.includes(record)) sourceRecords.push(record);
    }
  }

  if (!changed.length) {
    return notFound(context, language, "trend", question);
  }

  return {
    content: [
      pick(language, `Here is what changed between your reports (${changed.length} value${changed.length > 1 ? "s" : ""}):`, `आपकी रिपोर्ट के बीच ये बदलाव मिले (${changed.length} मान):`),
      ...changed,
      "",
      pick(
        language,
        "These are simple comparisons of the numbers in your uploaded reports, not a medical judgement. Discuss significant changes with your doctor.",
        "ये केवल आपकी रिपोर्ट के अंकों की तुलना हैं, कोई चिकित्सकीय निर्णय नहीं। बड़े बदलावों पर डॉक्टर से चर्चा करें।",
      ),
    ].join("\n"),
    sources: toSources(sourceRecords.slice(0, 4)),
    grounded: true,
    intent: "trend",
    provider: "mock",
    isMock: true,
  };
}

function answerLastUpload(context: AIContext, language: Language): QuestionResponse {
  if (!context.records.length) return notFound(context, language, "last_upload", "upload");
  const sorted = [...context.records].sort((a, b) => b.date.getTime() - a.date.getTime());
  const latest = sorted[0];
  const lines = [
    pick(
      language,
      `Your most recent upload was "${latest.title}" on ${formatDate(latest.date, language)}.`,
      `आपका सबसे नया अपलोड "${latest.title}" था, ${formatDate(latest.date, language)} को।`,
    ),
  ];
  if (sorted.length > 1) {
    lines.push(
      pick(language, `You have ${sorted.length} records in total.`, `कुल मिलाकर आपके ${sorted.length} रिकॉर्ड हैं।`),
    );
    lines.push(
      ...sorted
        .slice(1, 4)
        .map((record) => pick(language, `• ${record.title} — ${formatDate(record.date, language)}`, `• ${record.title} — ${formatDate(record.date, language)}`)),
    );
  }
  return {
    content: lines.join("\n"),
    sources: toSources(sorted.slice(0, 3)),
    grounded: true,
    intent: "last_upload",
    provider: "mock",
    isMock: true,
  };
}

function answerExplainReport(context: AIContext, language: Language): QuestionResponse {
  if (!context.records.length) return notFound(context, language, "explain_report", "report");
  const record = [...context.records].sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  const within = record.labValues.filter((value) => value.status === "WITHIN_RANGE");
  const outside = record.labValues.filter((value) => value.status === "BELOW_RANGE" || value.status === "ABOVE_RANGE");

  const lines = [
    pick(
      language,
      `"${record.title}" from ${formatDate(record.date, language)} ${record.labValues.length ? `contains ${record.labValues.length} reported value${record.labValues.length > 1 ? "s" : ""}` : "is saved in your records"}.`,
      `"${record.title}" (${formatDate(record.date, language)}) ${record.labValues.length ? `में ${record.labValues.length} मान दर्ज हैं` : "आपके रिकॉर्ड में सेव है"}।`,
    ),
  ];

  if (within.length) {
    lines.push(
      pick(language, `Most values are within the ranges printed on the report, including ${within.slice(0, 3).map((value) => value.testName).join(", ")}.`, `ज़्यादातर मान रिपोर्ट में दी गई सीमा के भीतर हैं, जैसे ${within.slice(0, 3).map((value) => value.testName).join(", ")}।`),
    );
  }
  for (const value of outside.slice(0, 3)) {
    lines.push(
      pick(
        language,
        `${value.testName} is ${value.value}${value.unit ? ` ${value.unit}` : ""}, which is outside the reference range on your report${value.referenceRange ? ` (${value.referenceRange})` : ""}.`,
        `${value.testName} ${value.value}${value.unit ? ` ${value.unit}` : ""} है, जो आपकी रिपोर्ट की संदर्भ सीमा से बाहर है${value.referenceRange ? ` (${value.referenceRange})` : ""}।`,
      ),
    );
  }
  if (record.medicines.length) {
    lines.push(
      pick(language, `Medicines recorded in this document: ${record.medicines.map((medicine) => medicine.name).join(", ")}.`, `इस दस्तावेज़ में दर्ज दवाइयाँ: ${record.medicines.map((medicine) => medicine.name).join(", ")}।`),
    );
  }

  lines.push("");
  lines.push(pick(language, "This information is for understanding your records. Ask whether any of these changes need follow-up testing.", "यह जानकारी आपके रिकॉर्ड समझने के लिए है। पूछें कि इन बदलावों के लिए दोबारा जाँच चाहिए या नहीं।"));

  return {
    content: lines.join("\n"),
    sources: toSources([record]),
    grounded: true,
    intent: "explain_report",
    provider: "mock",
    isMock: true,
  };
}

function answerBrowseRecords(context: AIContext, language: Language): QuestionResponse {
  if (!context.records.length) return notFound(context, language, "browse_records", "records");
  const sorted = [...context.records].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 6);
  return {
    content: [
      pick(language, `You have ${context.records.length} uploaded record${context.records.length > 1 ? "s" : ""}. The most recent ones:`, `आपके ${context.records.length} रिकॉर्ड अपलोड हैं। सबसे नए:`),
      ...sorted.map((record) =>
        pick(
          language,
          `• ${record.title} — ${formatDate(record.date, language)}${record.labValues.length ? ` (${record.labValues.length} values)` : ""}${record.medicines.length ? ` (${record.medicines.length} medicines)` : ""}`,
          `• ${record.title} — ${formatDate(record.date, language)}${record.labValues.length ? ` (${record.labValues.length} मान)` : ""}${record.medicines.length ? ` (${record.medicines.length} दवाइयाँ)` : ""}`,
        ),
      ),
    ].join("\n"),
    sources: toSources(sorted.slice(0, 4)),
    grounded: true,
    intent: "browse_records",
    provider: "mock",
    isMock: true,
  };
}

function answerProvider(context: AIContext, language: Language): QuestionResponse {
  const record = context.records.find((entry) => entry.doctorName || entry.facilityName);
  if (!record) return notFound(context, language, "provider", "doctor");
  return {
    content: [
      pick(language, "Your most recent document lists:", "आपके सबसे नए दस्तावेज़ में दर्ज है:"),
      record.doctorName ? pick(language, `• Doctor: ${record.doctorName}`, `• डॉक्टर: ${record.doctorName}`) : "",
      record.facilityName ? pick(language, `• Facility: ${record.facilityName}`, `• स्थान: ${record.facilityName}`) : "",
      pick(language, `Source: ${record.title} (${formatDate(record.date, language)})`, `स्रोत: ${record.title} (${formatDate(record.date, language)})`),
    ]
      .filter(Boolean)
      .join("\n"),
    sources: toSources([record]),
    grounded: true,
    intent: "provider",
    provider: "mock",
    isMock: true,
  };
}

function notFound(
  context: AIContext,
  language: Language,
  intent: string,
  topic: string,
): QuestionResponse {
  void context;
  void topic;
  return {
    content: [
      notFoundSentence(language),
      "",
      pick(
        language,
        "Upload the report that contains this information and I will explain it for you.",
        "जिस रिपोर्ट में यह जानकारी है उसे अपलोड करें, मैं उसे समझा दूँगा।",
      ),
    ].join("\n"),
    sources: [],
    grounded: false,
    intent,
    provider: "mock",
    isMock: true,
  };
}

function findLabValueInRecords(context: AIContext, question: string) {
  const needle = question.toLowerCase();
  for (const record of context.records) {
    for (const value of record.labValues) {
      const name = value.testName.toLowerCase();
      if (name.length >= 4 && (needle.includes(name) || name.split(/[\s,]+/).some((word) => word.length > 4 && needle.includes(word)))) {
        return { record, value };
      }
    }
  }
  return null;
}

// ── Summary generation ──────────────────────────────────────────────────────

function buildSummary(context: AIContext, record: AIContextRecord): HealthSummarySections {
  const language = context.language;
  const within = record.labValues.filter((value) => value.status === "WITHIN_RANGE");
  const outside = record.labValues.filter((value) => value.status === "BELOW_RANGE" || value.status === "ABOVE_RANGE");

  const metricFor = (testName: string, metricKey: string | null) =>
    context.metrics.filter((metric) =>
      metricKey ? metric.metricKey === metricKey : metric.label.toLowerCase().includes(testName.toLowerCase()),
    );

  const changes: string[] = [];
  for (const value of record.labValues) {
    if (value.numericValue === null || value.referenceRange === null) continue;
    const series = metricFor(value.testName, value.metricKey).sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const previous = series.filter((metric) => metric.recordedAt.getTime() < record.date.getTime()).pop();
    if (!previous) continue;
    const delta = value.numericValue - previous.value;
    if (Math.abs(delta) < 0.05) continue;
    changes.push(
      pick(
        language,
        `${value.testName} ${delta > 0 ? "increased" : "decreased"} from ${formatValue(previous.value, previous.unit, language)} to ${formatValue(value.numericValue, value.unit, language, value.value)} compared with your previous report.`,
        `${value.testName} पिछली रिपोर्ट से ${delta > 0 ? "बढ़कर" : "घटकर"} ${formatValue(previous.value, previous.unit, language)} से ${formatValue(value.numericValue, value.unit, language, value.value)} हुआ।`,
      ),
    );
  }

  const whatItSays = [
    pick(
      language,
      `This ${record.type === "PRESCRIPTION" ? "prescription" : "record"} is dated ${formatDate(record.date, language)}${record.doctorName ? ` and was issued by ${record.doctorName}` : ""}.`,
      `यह ${record.type === "PRESCRIPTION" ? "प्रिस्क्रिप्शन" : "रिकॉर्ड"} ${formatDate(record.date, language)} का है${record.doctorName ? ` और ${record.doctorName} द्वारा जारी किया गया` : ""}।`,
    ),
  ];
  if (record.labValues.length) {
    whatItSays.push(
      pick(
        language,
        `It contains ${record.labValues.length} reported value${record.labValues.length > 1 ? "s" : ""}: ${record.labValues.slice(0, 4).map((value) => value.testName).join(", ")}${record.labValues.length > 4 ? " …" : ""}.`,
        `इसमें ${record.labValues.length} मान दर्ज हैं: ${record.labValues.slice(0, 4).map((value) => value.testName).join(", ")}${record.labValues.length > 4 ? " …" : ""}।`,
      ),
    );
  }
  if (record.medicines.length) {
    whatItSays.push(
      pick(
        language,
        `Medicines mentioned: ${record.medicines.slice(0, 5).map((medicine) => [medicine.name, medicine.dosage].filter(Boolean).join(" ")).join(", ")}.`,
        `दवाइयाँ: ${record.medicines.slice(0, 5).map((medicine) => [medicine.name, medicine.dosage].filter(Boolean).join(" ")).join(", ")}।`,
      ),
    );
  }
  if (record.diagnosisTerms.length) {
    whatItSays.push(
      pick(
        language,
        `Diagnosis wording in the document: ${record.diagnosisTerms.slice(0, 4).join(", ")}. Your doctor wrote this for your clinical context.`,
        `दस्तावेज़ में निदान संबंधी शब्द: ${record.diagnosisTerms.slice(0, 4).join(", ")}। यह आपके डॉक्टर ने आपकी स्थिति के अनुसार लिखा है।`,
      ),
    );
  }

  const looksNormal: string[] = within.length
    ? within
        .slice(0, 6)
        .map((value) =>
          pick(
            language,
            `${value.testName}: ${value.value}${value.unit ? ` ${value.unit}` : ""} — inside the reference range on your report.`,
            `${value.testName}: ${value.value}${value.unit ? ` ${value.unit}` : ""} — आपकी रिपोर्ट की संदर्भ सीमा के भीतर।`,
          ),
        )
    : [
        pick(
          language,
          "Nothing in this document stood out as needing attention, based on the reference ranges provided.",
          "दी गई संदर्भ सीमा के अनुसार इस दस्तावेज़ में ध्यान देने योग्य कुछ नहीं दिखा।",
        ),
      ];
  if (record.labValues.length > within.length + outside.length) {
    looksNormal.push(
      pick(language, "Some values came without a reference range, so we did not judge them.", "कुछ मान बिना संदर्भ सीमा के थे, इसलिए हमने उन पर राय नहीं दी।"),
    );
  }

  const needsAttention: string[] = [
    ...outside.slice(0, 5).map((value) =>
      context.isChild
        ? pick(
            language,
            `${value.testName} is ${value.value}${value.unit ? ` ${value.unit}` : ""}, a little outside the usual range on this report. Ask a parent or caregiver to show this to the doctor.`,
            `${value.testName} ${value.value}${value.unit ? ` ${value.unit}` : ""} है, जो इस रिपोर्ट की सामान्य सीमा से थोड़ा बाहर है। माता-पिता या देखभालकर्ता से इसे डॉक्टर को दिखाने के लिए कहें।`,
          )
        : pick(
            language,
            `${value.testName} is ${value.value}${value.unit ? ` ${value.unit}` : ""}. This result is outside the reference range${value.referenceRange ? ` (${value.referenceRange})` : ""}. Discuss this with your doctor.`,
            `${value.testName} ${value.value}${value.unit ? ` ${value.unit}` : ""} है। यह परिणाम संदर्भ सीमा से बाहर है${value.referenceRange ? ` (${value.referenceRange})` : ""}। इस पर अपने डॉक्टर से बात करें।`,
          ),
    ),
    ...changes.slice(0, 3).map((change) =>
      pick(language, `${change} This may indicate a change worth reviewing with your doctor.`, `${change} यह बदलाव डॉक्टर से चर्चा करने योग्य हो सकता है।`),
    ),
  ];
  if (!needsAttention.length) {
    needsAttention.push(
      pick(language, "Nothing in this document was outside the reference range printed on your report.", "इस दस्तावेज़ में कुछ भी आपकी रिपोर्ट में दी गई संदर्भ सीमा से बाहर नहीं था।"),
    );
  }

  const termCandidates = [
    ...record.labValues.map((value) => value.testName),
    ...record.diagnosisTerms,
  ];
  const termExplanations: { term: string; explanation: string }[] = [];
  for (const candidate of termCandidates) {
    const entry = findGlossaryEntry(candidate);
    if (!entry) continue;
    if (termExplanations.some((item) => item.term === entry.term)) continue;
    termExplanations.push({ term: entry.term, explanation: explainTermForLanguage(entry.term, language) });
    if (termExplanations.length >= 5) break;
  }

  const discussWithDoctor = [
    ...outside.slice(0, 3).map((value) =>
      pick(
        language,
        `Ask whether the ${value.testName} result${value.referenceRange ? ` (reference range ${value.referenceRange})` : ""} needs a repeat test.`,
        `पूछें कि ${value.testName} परिणाम${value.referenceRange ? ` (संदर्भ सीमा ${value.referenceRange})` : ""} के लिए दोबारा जाँच चाहिए या नहीं।`,
      ),
    ),
    ...(changes.length
      ? [pick(language, "Ask whether the change since my previous report needs follow-up testing.", "पूछें कि पिछली रिपोर्ट से हुए बदलाव के लिए आगे जाँच चाहिए या नहीं।")]
      : []),
    ...(record.medicines.length
      ? [pick(language, "Confirm how long each medicine should be continued.", "पूछें कि हर दवा कितने दिन चलानी है।")]
      : []),
    pick(language, "Ask which results are important for me right now.", "पूछें कि इस समय मेरे लिए कौन से परिणाम ज़रूरी हैं।"),
  ];

  const plainSummary = pick(
    language,
    `${record.title} from ${formatDate(record.date, language)}: ${record.labValues.length} value${record.labValues.length === 1 ? "" : "s"} recorded, ${outside.length} outside the reference range, ${record.medicines.length} medicine${record.medicines.length === 1 ? "" : "s"}.`,
    `${record.title} (${formatDate(record.date, language)}): ${record.labValues.length} मान, ${outside.length} संदर्भ सीमा से बाहर, ${record.medicines.length} दवाइयाँ।`,
  );

  return { whatItSays: whatItSays.join(" "), looksNormal, needsAttention, termExplanations, discussWithDoctor, plainSummary };
}

function explainTermForLanguage(term: string, language: Language): string {
  const entry = findGlossaryEntry(term);
  const key = entry?.meaningKey;
  if (!key) return "";
  // The mock provider reads the same dictionary the UI renders, so answers and
  // screen copy can never drift apart.
  return translate(language, key);
}

// ── Provider ────────────────────────────────────────────────────────────────

export class MockHealthAIProvider implements HealthAIProvider {
  readonly name = "Demo AI (built-in, factors only your records)";
  readonly isMock = true;

  async generateSummary(request: SummaryRequest): Promise<SummaryResponse> {
    const { context, record } = request;
    return {
      summary: buildSummary(context, record),
      provider: this.name,
      isMock: true,
    };
  }

  async answerQuestion(request: QuestionRequest): Promise<QuestionResponse> {
    const { context, question, language, history } = request;
    const intent = detectIntent(question);
    const resolvedMetric = resolveMetric(question, history);

    if (!context.records.length) {
      return notFound(context, language, intent, question);
    }

    switch (intent) {
      case "medications_active":
      case "medications_history":
        return answerMedicationsActive(context, language);
      case "trend":
        return answerTrend(context, language, question, resolvedMetric.metricKey);
      case "last_upload":
        return answerLastUpload(context, language);
      case "explain_report":
        return answerExplainReport(context, language);
      case "browse_records":
        return answerBrowseRecords(context, language);
      case "provider":
        return answerProvider(context, language);
      case "lab_lookup":
      case "unknown":
      default: {
        const { metricKey } = resolvedMetric;
        const hasMetricSeries = metricKey
          ? context.metrics.some((metric) => metric.metricKey === metricKey)
          : false;
        const mentionsAnyRecordWord = context.records.some((record) =>
          record.labValues.some((value) => question.toLowerCase().includes(value.testName.toLowerCase().slice(0, 6))),
        );
        if (metricKey || hasMetricSeries || mentionsAnyRecordWord) {
          return answerLabLookup(context, language, metricKey, question);
        }
        // Ask about a term we can explain from the glossary.
        const entry = findGlossaryEntry(question);
        if (entry) {
          const explanation = explainTermForLanguage(entry.term, language);
          if (explanation) {
            return {
              content: [
                `${entry.term}: ${explanation}`,
                "",
                pick(
                  language,
                  "This explanation is general information, not a comment on your own result. Discuss your values with your doctor.",
                  "यह सामान्य जानकारी है, आपके परिणाम पर टिप्पणी नहीं। अपने मानों पर डॉक्टर से चर्चा करें।",
                ),
              ].join("\n"),
              sources: [],
              grounded: true,
              intent: "term_meaning",
              provider: "mock",
              isMock: true,
            };
          }
        }
        return notFound(context, language, intent, question);
      }
    }
  }

  async explainMedicalTerm(term: string, language: Language): Promise<string> {
    const entry = findGlossaryEntry(term);
    if (!entry) return notFoundSentence(language);
    return explainTermForLanguage(entry.term, language);
  }
}

export const __testing = { detectIntent, detectMetric, resolveMetric, buildSummary, notFound };
