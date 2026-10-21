import type { Language } from "@/types/domain";

/**
 * Speech-friendly text.
 *
 * Answers are written for the screen (bullets, markdown, emoji). Before they go
 * to a speech provider they are flattened into sentences so a listener never
 * hears "asterisk asterisk" or a list of one-word lines. Units and decimal
 * values are preserved: "11.2 g/dL" is exactly what the report says.
 */
export function buildSpokenText(text: string, maxChars = 1500): string {
  let output = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[*_~]/g, "")
    // Bullets become sentence boundaries, not silence.
    .replace(/^[\s]*[•‣▪◦●\-–—]\s*/gm, ". ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\.(\s*\.)+/g, ".")
    .replace(/([।.!?])\s*([।.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Remove emoji and pictographs without removing Devanagari text.
  output = output
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (output.length <= maxChars) return output;

  const window = output.slice(0, maxChars);
  const breakpoints = [". ", "। ", "? ", "! ", "; "];
  let cut = -1;
  for (const breakpoint of breakpoints) {
    const index = window.lastIndexOf(breakpoint);
    if (index > cut) cut = index + breakpoint.length - 1;
  }
  if (cut < Math.floor(maxChars * 0.55)) {
    const space = window.lastIndexOf(" ");
    cut = space > 0 ? space : maxChars;
  }
  return `${window.slice(0, cut).trim()}…`;
}

export type VoiceLike = {
  lang?: string;
  name?: string;
  localService?: boolean;
  default?: boolean;
};

/**
 * Chooses a voice for the active language. Indian English / Hindi voices are
 * preferred, then any matching language. Returns null when the browser has no
 * voice for that language, which lets the UI explain the limitation instead of
 * silently reading Hindi with an English voice.
 */
export function pickBrowserVoice<T extends VoiceLike>(
  voices: readonly T[],
  language: Language,
): T | null {
  if (!voices.length) return null;

  const rank = (voice: T): number => {
    const lang = (voice.lang ?? "").toLowerCase().replace("_", "-");
    const name = (voice.name ?? "").toLowerCase();
    if (language === "hi") {
      if (lang === "hi-in") return 0;
      if (lang.startsWith("hi")) return 1;
      if (name.includes("hindi") || name.includes("हिंदी")) return 2;
      return 99;
    }
    if (lang === "en-in") return 0;
    if (lang.startsWith("en")) return 1;
    if (name.includes("english")) return 2;
    return 99;
  };

  const candidates = voices
    .map((voice) => ({ voice, score: rank(voice) }))
    .filter((entry) => entry.score < 99)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (Boolean(a.voice.localService) !== Boolean(b.voice.localService)) {
        return a.voice.localService ? -1 : 1;
      }
      return 0;
    });

  return candidates[0]?.voice ?? null;
}

export function browserLanguageTag(language: Language): "hi-IN" | "en-IN" {
  return language === "hi" ? "hi-IN" : "en-IN";
}

/** True when a browser can plausibly speak the language. Empty list = unknown. */
export function browserCanSpeakLanguage(voices: readonly VoiceLike[], language: Language): boolean {
  if (!voices.length) return true;
  return pickBrowserVoice(voices, language) !== null;
}

export function stripSourcesForSpeech(
  answer: string,
  sources: readonly { title: string; date: string }[],
  language: Language,
): string {
  if (!sources.length) return answer;
  const label = language === "hi" ? "स्रोत" : "Source";
  return `${answer} ${label}: ${sources
    .map((source) => `${source.title}, ${source.date}`)
    .join(". ")}.`;
}
