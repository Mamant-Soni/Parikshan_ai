import { z } from "zod";
import type { Language } from "@/types/domain";
import { containsUnsafeClaim, SAFETY_PHRASES } from "@/lib/medical/glossary";
import {
  buildQuestionPrompt,
  buildSummaryPrompt,
  notFoundSentence,
  serializeContext,
  SYSTEM_PROMPT,
} from "./prompt";
import type {
  HealthAIProvider,
  QuestionRequest,
  QuestionResponse,
  SummaryRequest,
  SummaryResponse,
} from "./types";

/**
 * Google Gemini provider (generativelanguage REST API).
 * Selected with AI_PROVIDER=gemini and GEMINI_API_KEY set.
 * The API key stays on the server.
 */

const summarySchema = z.object({
  whatItSays: z.string().min(1),
  looksNormal: z.array(z.string()).default([]),
  needsAttention: z.array(z.string()).default([]),
  termExplanations: z.array(z.object({ term: z.string(), explanation: z.string() })).default([]),
  discussWithDoctor: z.array(z.string()).default([]),
  plainSummary: z.string().default(""),
});

const answerSchema = z.object({
  answered: z.boolean(),
  content: z.string().min(1),
  intent: z.string().default("general"),
  sourceRecordIds: z.array(z.string()).default([]),
});

export class GeminiHealthProvider implements HealthAIProvider {
  readonly name = "Google Gemini";
  readonly isMock = false;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.model = options?.model ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  }

  private async generate(userPrompt: string): Promise<string> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const payload = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned an empty response");
    return text.trim();
  }

  async generateSummary(request: SummaryRequest): Promise<SummaryResponse> {
    const { context, record } = request;
    const raw = await this.generate(
      buildSummaryPrompt({
        recordTitle: record.title,
        contextJson: serializeContext(context),
        language: context.language,
      }),
    );
    const parsed = summarySchema.parse(JSON.parse(raw));
    const flagged = containsUnsafeClaim([parsed.needsAttention.join(" "), parsed.whatItSays].join(" "));
    return {
      summary: {
        ...parsed,
        discussWithDoctor: parsed.discussWithDoctor.length ? parsed.discussWithDoctor : [SAFETY_PHRASES.discuss],
        needsAttention: flagged
          ? [...parsed.needsAttention, SAFETY_PHRASES.notDiagnosis]
          : parsed.needsAttention,
      },
      provider: this.name,
      isMock: false,
    };
  }

  async answerQuestion(request: QuestionRequest): Promise<QuestionResponse> {
    const { context, question, language } = request;
    const raw = await this.generate(
      buildQuestionPrompt({ question, contextJson: serializeContext(context), language, history: request.history }),
    );
    const parsed = answerSchema.parse(JSON.parse(raw));
    return {
      content: parsed.answered ? parsed.content : notFoundSentence(language),
      sources: parsed.answered
        ? context.records
            .filter((record) => parsed.sourceRecordIds.includes(record.id))
            .slice(0, 4)
            .map((record) => ({
              recordId: record.id,
              title: record.title,
              date: record.date.toISOString(),
              type: record.type,
            }))
        : [],
      grounded: parsed.answered,
      intent: parsed.intent,
      provider: this.name,
      isMock: false,
    };
  }

  async explainMedicalTerm(term: string, language: Language): Promise<string> {
    const raw = await this.generate(
      `Explain the medical term "${term}" for a patient in ${language === "hi" ? "simple Hindi" : "simple English"}, maximum 3 short sentences. Return JSON: { "explanation": string }`,
    );
    return z.object({ explanation: z.string() }).parse(JSON.parse(raw)).explanation;
  }
}
