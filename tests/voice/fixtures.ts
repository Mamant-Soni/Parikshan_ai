import type { AIContext, QuestionRequest, QuestionResponse, HealthAIProvider } from "@/lib/ai/types";
import type { ChatSource } from "@/types/domain";

export function makeContext(overrides: Partial<AIContext> = {}): AIContext {
  return {
    profileName: "Demo User",
    isChild: false,
    isElder: false,
    language: "en",
    today: new Date("2026-10-19T00:00:00.000Z"),
    records: [
      {
        id: "rec-latest",
        type: "LAB_REPORT",
        title: "Blood Test — Latest Report",
        date: new Date("2026-09-12T00:00:00.000Z"),
        doctorName: "Dr. Anil Mehta",
        facilityName: "City Diagnostics Centre",
        diagnosisTerms: ["Mild anemia"],
        status: "READY",
        ocrConfidence: 0.93,
        summary: null,
        medicines: [],
        labValues: [
          {
            testName: "Hemoglobin",
            metricKey: "hemoglobin",
            value: "11.0",
            numericValue: 11,
            unit: "g/dL",
            referenceRange: "13.0 - 17.0",
            status: "BELOW_RANGE",
            isVerified: true,
          },
          {
            testName: "Glucose, Fasting",
            metricKey: "glucose_fasting",
            value: "108",
            numericValue: 108,
            unit: "mg/dL",
            referenceRange: "70 - 100",
            status: "ABOVE_RANGE",
            isVerified: true,
          },
        ],
      },
      {
        id: "rec-previous",
        type: "LAB_REPORT",
        title: "Blood Test — Annual Health Check",
        date: new Date("2026-08-14T00:00:00.000Z"),
        doctorName: "Dr. Anil Mehta",
        facilityName: "City Diagnostics Centre",
        diagnosisTerms: [],
        status: "READY",
        ocrConfidence: 0.9,
        summary: null,
        medicines: [],
        labValues: [
          {
            testName: "Hemoglobin",
            metricKey: "hemoglobin",
            value: "12.6",
            numericValue: 12.6,
            unit: "g/dL",
            referenceRange: "13.0 - 17.0",
            status: "BELOW_RANGE",
            isVerified: true,
          },
        ],
      },
    ],
    medications: [
      {
        name: "Metformin",
        dosage: "500 mg",
        frequency: "Twice daily",
        duration: "30 days",
        status: "ACTIVE",
      },
    ],
    metrics: [
      {
        metricKey: "hemoglobin",
        label: "Hemoglobin",
        value: 12.6,
        unit: "g/dL",
        recordedAt: new Date("2026-08-14T00:00:00.000Z"),
        referenceRange: "13.0 - 17.0",
        sourceRecordId: "rec-previous",
        sourceRecordTitle: "Blood Test — Annual Health Check",
      },
      {
        metricKey: "hemoglobin",
        label: "Hemoglobin",
        value: 11,
        unit: "g/dL",
        recordedAt: new Date("2026-09-12T00:00:00.000Z"),
        referenceRange: "13.0 - 17.0",
        sourceRecordId: "rec-latest",
        sourceRecordTitle: "Blood Test — Latest Report",
      },
    ],
    ...overrides,
  };
}

export type FakeAnswer = {
  content: string;
  sources?: ChatSource[];
  grounded?: boolean;
  intent?: string;
  fallbackReason?: string;
};

export function fakeProvider(
  answer: FakeAnswer,
  options: { onCall?: () => void } = {},
): HealthAIProvider {
  return {
    name: "Fake provider",
    isMock: false,
    async generateSummary() {
      throw new Error("not used");
    },
    async answerQuestion(_request: QuestionRequest): Promise<QuestionResponse> {
      options.onCall?.();
      return {
        content: answer.content,
        sources: answer.sources ?? [],
        grounded: answer.grounded ?? true,
        intent: answer.intent ?? "general",
        provider: "Fake provider",
        isMock: false,
        fallbackReason: answer.fallbackReason,
      };
    },
    async explainMedicalTerm() {
      return "";
    },
  };
}

export function source(recordId: string, overrides: Partial<ChatSource> = {}): ChatSource {
  return {
    recordId,
    title: "Injected title",
    date: "2026-09-12T00:00:00.000Z",
    type: "LAB_REPORT",
    ...overrides,
  };
}
