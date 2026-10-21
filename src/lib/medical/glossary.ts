import type { TranslationKey } from "@/lib/i18n";
import type { Language } from "@/types/domain";

/**
 * Plain-language medical glossary.
 *
 * Every explanation is deliberately hedged ("may", "can", "usually") and points
 * the reader back to a clinician. Nothing here is a diagnosis, and no entry
 * suggests changing treatment. The AI providers use this as their factual
 * source for "what does this term mean" so the mock and the real model answer
 * from the same reviewed text.
 */

export type GlossaryEntry = {
  term: string;
  /** Dictionary keys (used by the UI for the current language). */
  meaningKey: TranslationKey;
  /** Extra searchable aliases, including common brand/lay words. */
  aliases: string[];
  /** Shown as "Also called" chips. */
  alsoCalled?: string[];
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "Hemoglobin",
    meaningKey: "term.hemoglobin",
    aliases: ["hb", "haemoglobin", "hemoglobin", "hgb"],
    alsoCalled: ["Hb", "Hgb"],
  },
  {
    term: "Anemia",
    meaningKey: "term.anemia",
    aliases: ["anaemia", "low hemoglobin", "anemia"],
    alsoCalled: ["Low hemoglobin"],
  },
  {
    term: "Hypertension",
    meaningKey: "term.hypertension",
    aliases: ["hypertension", "high blood pressure", "htn", "bp high"],
    alsoCalled: ["High blood pressure"],
  },
  {
    term: "Diabetes",
    meaningKey: "term.diabetes",
    aliases: ["diabetes", "t2dm", "sugar problem", "madhumeh"],
    alsoCalled: ["High blood sugar"],
  },
  {
    term: "Glucose",
    meaningKey: "term.glucose",
    aliases: ["glucose", "sugar", "fbs", "ppbs", "blood sugar"],
    alsoCalled: ["Blood sugar"],
  },
  {
    term: "HbA1c",
    meaningKey: "term.hba1c",
    aliases: ["hba1c", "glycated hemoglobin", "a1c"],
  },
  {
    term: "Cholesterol",
    meaningKey: "term.cholesterol",
    aliases: ["cholesterol", "lipid profile", "lipids"],
  },
  { term: "LDL", meaningKey: "term.ldl", aliases: ["ldl", "ldl-c", "bad cholesterol"] },
  { term: "HDL", meaningKey: "term.hdl", aliases: ["hdl", "hdl-c", "good cholesterol"] },
  {
    term: "Triglycerides",
    meaningKey: "term.triglycerides",
    aliases: ["triglyceride", "triglycerides", "tg"],
  },
  { term: "Vitamin D", meaningKey: "term.vitaminD", aliases: ["vitamin d", "vit d", "25-oh"] },
  { term: "TSH", meaningKey: "term.tsh", aliases: ["tsh", "thyroid", "thyroid stimulating"] },
  {
    term: "Creatinine",
    meaningKey: "term.creatinine",
    aliases: ["creatinine", "kidney function", "egfr"],
  },
  { term: "Platelets", meaningKey: "term.platelets", aliases: ["platelet", "platelets", "plt"] },
  {
    term: "White blood cells",
    meaningKey: "term.wbc",
    aliases: ["wbc", "white blood cells", "leukocytes", "tlc"],
  },
  {
    term: "Red blood cells",
    meaningKey: "term.rbc",
    aliases: ["rbc", "red blood cells", "erythrocytes"],
  },
  { term: "Systolic", meaningKey: "term.systolic", aliases: ["systolic", "upper bp"] },
  { term: "Diastolic", meaningKey: "term.diastolic", aliases: ["diastolic", "lower bp"] },
  {
    term: "Reference range",
    meaningKey: "term.referenceRange",
    aliases: ["reference range", "normal range", "biological reference"],
  },
  { term: "Fasting", meaningKey: "term.fasting", aliases: ["fasting", "fbs", "nfhs"] },
  {
    term: "Prescription",
    meaningKey: "term.prescription",
    aliases: ["prescription", "rx", "rx.", "advice"],
  },
  {
    term: "Generic name",
    meaningKey: "term.genericName",
    aliases: ["generic", "salt", "composition", "molecule"],
  },
];

const BY_ALIAS = new Map<string, GlossaryEntry>();
for (const entry of GLOSSARY) {
  for (const alias of entry.aliases) BY_ALIAS.set(alias.toLowerCase(), entry);
  BY_ALIAS.set(entry.term.toLowerCase(), entry);
}

/** Finds a glossary entry for free text ("Hb is low" → Hemoglobin). */
export function findGlossaryEntry(text: string): GlossaryEntry | undefined {
  const haystack = text.toLowerCase();
  // Longest alias first so "blood sugar" wins over "sugar".
  const aliases = [...BY_ALIAS.keys()].sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    if (alias.length >= 3 && haystack.includes(alias)) return BY_ALIAS.get(alias);
  }
  return undefined;
}

export function glossaryMeaning(entry: GlossaryEntry, lang: Language, t: (k: TranslationKey) => string) {
  void lang; // The dictionary already holds the correct language.
  return t(entry.meaningKey);
}

/** Wording rules that keep every AI answer inside safe, non-diagnostic bounds. */
export const SAFETY_PHRASES = {
  mayIndicate: "This may indicate a change compared with your previous record.",
  outsideRange: "This result is outside the reference range printed on your report.",
  discuss: "Discuss this with your doctor.",
  notDiagnosis: "This is not a diagnosis.",
  forUnderstanding: "This information is for understanding your records.",
  noStopMedication:
    "Do not stop or change any medicine based on this information. Speak to your doctor or pharmacist first.",
} as const;

/** Language the model must never produce (kept here so it is testable). */
export const FORBIDDEN_ANSWER_PATTERNS = [
  /\byou (definitely )?have\b/i,
  /\byou should stop taking\b/i,
  /\btake this medicine instead\b/i,
  /\byou must take\b/i,
  /\bdiagnos(e|ed|is)\b.*\byou\b/i,
  /\bprescrib(e|ing)\b.*\byou\b/i,
];

export function containsUnsafeClaim(text: string): boolean {
  return FORBIDDEN_ANSWER_PATTERNS.some((pattern) => pattern.test(text));
}
