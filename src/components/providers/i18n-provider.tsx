"use client";

import * as React from "react";
import { createTranslator, type TranslationKey, type Translator } from "@/lib/i18n";
import type { Language } from "@/types/domain";

/**
 * Language + accessibility preferences for the whole app.
 *
 * The server already applied the saved preferences to <html> (see app/layout.tsx
 * and app/(app)/layout.tsx), so nothing flickers on load. Changes here are
 * applied to the DOM immediately for instant feedback and persisted in the
 * background via a server action; if saving fails the user is told, and the
 * preference is reverted rather than silently lost.
 */

export type Preferences = {
  language: Language;
  easyRead: boolean;
  largeText: boolean;
  highContrast: boolean;
  readAloud: boolean;
  autoReadAloud: boolean;
  notifyMeds: boolean;
  notifyRecords: boolean;
};

/** Preferences before a user signs in. */
export const DEFAULT_PREFERENCES: Preferences = {
  language: "en",
  easyRead: false,
  largeText: false,
  highContrast: false,
  readAloud: true,
  autoReadAloud: false,
  notifyMeds: true,
  notifyRecords: false,
};

/** Alias kept for readability at the call sites that pass preferences down. */
export type ClientPreferences = Preferences;

type I18nContextValue = {
  lang: Language;
  t: Translator;
  prefs: Preferences;
  /** Flattened preference flags — the shape most components read. */
  easyRead: boolean;
  largeText: boolean;
  highContrast: boolean;
  readAloudSupported: boolean;
  /** Update a single preference (persisted for signed-in users). */
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  /** Alias of setPref with the name used in early components. */
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  /** Convenience wrapper used by the language toggle. */
  setLanguage: (language: Language) => void;
};

const I18nContext = React.createContext<I18nContextValue | null>(null);

function applyToDocument(prefs: Preferences) {
  const root = document.documentElement;
  root.lang = prefs.language;
  root.classList.toggle("easy-read", prefs.easyRead);
  root.classList.toggle("large-text", prefs.largeText);
  root.classList.toggle("high-contrast", prefs.highContrast);
}

export function I18nProvider({
  children,
  initialPreferences,
  persist = true,
}: {
  children: React.ReactNode;
  initialPreferences: Preferences;
  persist?: boolean;
}) {
  const [prefs, setPrefs] = React.useState<Preferences>(initialPreferences);

  // Sign-in happens in a server action + client navigation, so this provider can
  // live across an auth change. When the server sends fresh preferences (for
  // example the demo account's saved Hindi + Easy Read settings), adopt them.
  const incoming = React.useRef(initialPreferences);
  React.useEffect(() => {
    if (incoming.current === initialPreferences) return;
    incoming.current = initialPreferences;
    setPrefs((current) => (JSON.stringify(current) === JSON.stringify(initialPreferences) ? current : initialPreferences));
    applyToDocument(initialPreferences);
  }, [initialPreferences]);

  const t = React.useMemo<Translator>(() => createTranslator(prefs.language), [prefs.language]);

  const setPref = React.useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setPrefs((current) => {
        const next = { ...current, [key]: value };
        applyToDocument(next);
        return next;
      });

      try {
        window.localStorage.setItem("phc.preferences", JSON.stringify({ ...prefs, [key]: value }));
      } catch {
        // Private browsing — preferences still work for this session.
      }

      if (!persist) return;
      void import("@/lib/actions/preferences")
        .then(({ updatePreferencesAction }) => updatePreferencesAction({ [key]: value }))
        .catch(() => {
          setPrefs((current) => {
            const reverted = { ...current, [key]: prefs[key] };
            applyToDocument(reverted);
            return reverted;
          });
          void import("sonner").then(({ toast }) =>
            toast.error("Could not save that preference. Please try again."),
          );
        });
    },
    [persist, prefs],
  );

  const value = React.useMemo<I18nContextValue>(
    () => ({
      lang: prefs.language,
      t,
      prefs,
      easyRead: prefs.easyRead,
      largeText: prefs.largeText,
      highContrast: prefs.highContrast,
      readAloudSupported: prefs.readAloud,
      setPref,
      setPreference: setPref,
      setLanguage: (language: Language) => setPref("language", language),
    }),
    [prefs, setPref, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside <I18nProvider>");
  return context;
}

/** Formats a number using the active language's locale. */
export function useNumber() {
  const { lang } = useI18n();
  return React.useCallback(
    (value: number, maxDigits = 1) =>
      new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN", { maximumFractionDigits: maxDigits }).format(value),
    [lang],
  );
}

export type { TranslationKey };
