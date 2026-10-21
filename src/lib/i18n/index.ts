import { dictionaries, type TranslationKey } from "./dictionary";
import type { Language } from "@/types/domain";

export type { TranslationKey };
export { dictionaries };

/** `{name}` style placeholders inside dictionary strings. */
export type TVars = Record<string, string | number>;

export function translate(lang: Language, key: TranslationKey, vars?: TVars): string {
  const dict = dictionaries[lang] ?? dictionaries.en;
  // Fall back to English if a key is ever missing at runtime (defensive only —
  // TypeScript guarantees both dictionaries share the same key set).
  const template = dict[key] ?? dictionaries.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export type Translator = (key: TranslationKey, vars?: TVars) => string;

/** Server-side translator factory (no React needed). */
export function createTranslator(lang: Language): Translator {
  return (key, vars) => translate(lang, key, vars);
}

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "hi";
}

/** Locale used for Intl formatting. Hindi (India) renders Devanagari digits only
 *  if asked; we keep Latin digits because they are what prescriptions use. */
export function toIntlLocale(lang: Language): string {
  return lang === "hi" ? "hi-IN" : "en-IN";
}

export const LANGUAGES: { value: Language; labelKey: TranslationKey; short: string }[] = [
  { value: "en", labelKey: "lang.english", short: "EN" },
  { value: "hi", labelKey: "lang.hindi", short: "हि" },
];
