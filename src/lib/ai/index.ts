import { MockHealthAIProvider } from "./mock-provider";
import { OpenAIHealthProvider } from "./openai-provider";
import { GeminiHealthProvider } from "./gemini-provider";
import type { HealthAIProvider, QuestionRequest, QuestionResponse, SummaryRequest, SummaryResponse } from "./types";

export * from "./types";
export { MockHealthAIProvider } from "./mock-provider";
export { OpenAIHealthProvider } from "./openai-provider";
export { GeminiHealthProvider } from "./gemini-provider";

/**
 * AI provider registry.
 *
 * AI_PROVIDER=mock      → built-in reasoner over the user's records (default)
 * AI_PROVIDER=openai    → OpenAI / Azure OpenAI / any OpenAI-compatible endpoint
 * AI_PROVIDER=gemini    → Google Gemini
 * AI_PROVIDER=azure-openai → Azure OpenAI deployment
 *
 * Any provider failure degrades to the mock provider rather than showing the
 * user an error mid-demo, and the UI surfaces which provider answered.
 */

let cached: HealthAIProvider | null = null;

export function getHealthAIProvider(): HealthAIProvider {
  if (cached) return cached;

  const requested = (process.env.AI_PROVIDER ?? "mock").toLowerCase();

  switch (requested) {
    case "openai": {
      if (!process.env.OPENAI_API_KEY) {
        console.warn("[ai] AI_PROVIDER=openai but OPENAI_API_KEY is missing — using demo AI.");
        break;
      }
      cached = new OpenAIHealthProvider();
      return cached;
    }
    case "azure-openai": {
      if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT) {
        console.warn("[ai] AI_PROVIDER=azure-openai is missing credentials — using demo AI.");
        break;
      }
      const endpoint = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, "");
      const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";
      cached = new OpenAIHealthProvider({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        model: deployment,
        baseUrl: `${endpoint}/openai/deployments/${deployment}`,
        name: `Azure OpenAI (${deployment})`,
      });
      return cached;
    }
    case "gemini": {
      if (!process.env.GEMINI_API_KEY) {
        console.warn("[ai] AI_PROVIDER=gemini but GEMINI_API_KEY is missing — using demo AI.");
        break;
      }
      cached = new GeminiHealthProvider();
      return cached;
    }
    case "mock":
    default:
      break;
  }

  cached = new MockHealthAIProvider();
  return cached;
}

export function resetAIProviderCache() {
  cached = null;
}

export function activeAIProviderName(): string {
  return getHealthAIProvider().name;
}

export function isMockAI(): boolean {
  return getHealthAIProvider().isMock;
}

/** Wraps a provider call so an upstream outage never breaks the experience. */
export async function withFallback<T>(
  operation: (provider: HealthAIProvider) => Promise<T>,
  fallback: (provider: HealthAIProvider) => Promise<T>,
): Promise<T> {
  const provider = getHealthAIProvider();
  if (provider.isMock) return operation(provider);
  try {
    return await operation(provider);
  } catch (error) {
    console.warn("[ai] provider call failed, falling back to demo AI:", error);
    const mock = new MockHealthAIProvider();
    return fallback(mock);
  }
}

export async function generateSummarySafely(request: SummaryRequest): Promise<SummaryResponse> {
  return withFallback(
    (provider) => provider.generateSummary(request),
    async (provider) => {
      const result = await provider.generateSummary(request);
      return { ...result, fallbackReason: "provider-unavailable" };
    },
  );
}

export async function answerQuestionSafely(request: QuestionRequest): Promise<QuestionResponse> {
  return withFallback(
    (provider) => provider.answerQuestion(request),
    async (provider) => {
      const result = await provider.answerQuestion(request);
      return { ...result, fallbackReason: "provider-unavailable" };
    },
  );
}
