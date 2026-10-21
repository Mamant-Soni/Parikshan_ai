import { z } from "zod";
import type { ChatAnswer, HealthSummarySections, Language } from "@/types/domain";
import { containsUnsafeClaim, SAFETY_PHRASES } from "@/lib/medical/glossary";
import {
  ANSWER_SCHEMA_HINT,
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
 * OpenAI-compatible provider (also works with Azure OpenAI, OpenRouter,
 * Together, Groq or a local llama.cpp server — anything that speaks
 * POST /chat/completions).
 *
 * Security: the API key is read from the server environment only. It is never
 * sent to the browser and never embedded in a page (no NEXT_PUBLIC_ prefix).
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

function stripCodeFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

export class OpenAIHealthProvider implements HealthAIProvider {
  readonly name: string;
  readonly isMock = false;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options?: { apiKey?: string; model?: string; baseUrl?: string; name?: string }) {
    this.apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.model = options?.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    this.baseUrl = (options?.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.name = options?.name ?? `OpenAI (${this.model})`;
  }

  private async chat(userPrompt: string, maxTokens = 900): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        // Azure OpenAI uses api-key instead of a bearer token.
        ...(this.baseUrl.includes(".openai.azure.com") ? { "api-key": this.apiKey } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned an empty response");
    return stripCodeFences(content);
  }

  async generateSummary(request: SummaryRequest): Promise<SummaryResponse> {
    const { context, record } = request;
    const raw = await this.chat(
      buildSummaryPrompt({
        recordTitle: record.title,
        contextJson: serializeContext(context),
        language: context.language,
      }),
    );
    const parsed = summarySchema.parse(JSON.parse(raw));
    return {
      summary: sanitiseSummary(parsed, context.language),
      provider: this.name,
      isMock: false,
    };
  }

  async answerQuestion(request: QuestionRequest): Promise<QuestionResponse> {
    const { context, question, language } = request;
    const raw = await this.chat(
      buildQuestionPrompt({ question, contextJson: serializeContext(context), language, history: request.history }),
      600,
    );
    const parsed = answerSchema.parse(JSON.parse(raw));

    const sources = parsed.answered
      ? context.records.filter((record) => parsed.sourceRecordIds.includes(record.id)).slice(0, 4)
      : [];

    const content = sanitiseAnswer(parsed.content, parsed.answered, language);

    return {
      content,
      sources: sources.map((record) => ({
        recordId: record.id,
        title: record.title,
        date: record.date.toISOString(),
        type: record.type,
      })),
      grounded: parsed.answered,
      intent: parsed.intent,
      provider: this.name,
      isMock: false,
    } satisfies ChatAnswer & { provider: string; isMock: boolean };
  }

  async explainMedicalTerm(term: string, language: Language): Promise<string> {
    const raw = await this.chat(
      [
        `Explain the medical term "${term}" in ${language === "hi" ? "simple Hindi" : "simple English"}, in at most 3 short sentences, for a patient with no medical training.`,
        `Do not diagnose. Do not mention any specific medicine dose.`,
        `Return JSON: { "explanation": string }`,
      ].join("\n"),
      300,
    );
    const parsed = z.object({ explanation: z.string() }).parse(JSON.parse(raw));
    return parsed.explanation;
  }
}

/** Post-processing guardrails, applied to every hosted-model response. */
function sanitiseAnswer(content: string, answered: boolean, language: Language): string {
  if (!answered) return notFoundSentence(language);
  if (containsUnsafeClaim(content)) {
    return [
      content,
      "",
      "Note: this is an explanation of your uploaded records, not a diagnosis.",
      SAFETY_PHRASES.discuss,
    ].join("\n");
  }
  return content;
}

function sanitiseSummary(
  summary: HealthSummarySections,
  language: Language,
): HealthSummarySections {
  const ensureDisclaimer = (lines: string[]) => {
    const text = lines.join(" ");
    if (containsUnsafeClaim(text)) {
      return [
        ...lines,
        language === "hi"
          ? "यह जानकारी आपके रिकॉर्ड समझने के लिए है और निदान नहीं है।"
          : "This information is for understanding your records and is not a diagnosis.",
      ];
    }
    return lines;
  };

  return {
    ...summary,
    looksNormal: ensureDisclaimer(summary.looksNormal),
    needsAttention: ensureDisclaimer(summary.needsAttention),
    discussWithDoctor: summary.discussWithDoctor.length
      ? summary.discussWithDoctor
      : [SAFETY_PHRASES.discuss],
  };
}
