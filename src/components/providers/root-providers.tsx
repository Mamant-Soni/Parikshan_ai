"use client";

import * as React from "react";
import { Toaster } from "sonner";
import { I18nProvider, type Preferences } from "./i18n-provider";
import { ThemeChoiceProvider } from "./theme-provider";
import type { ThemeChoice } from "@/lib/theme/theme";

/**
 * Providers available on every route, including the public landing and sign-in
 * pages: language/accessibility preferences and the toast host.
 *
 * The active health profile is provided one level deeper, inside the
 * authenticated layout, because only signed-in users have profiles.
 */
export function RootProviders({
  children,
  preferences,
  themeChoice,
}: {
  children: React.ReactNode;
  preferences: Preferences;
  themeChoice: ThemeChoice;
}) {
  return (
    <ThemeChoiceProvider value={themeChoice}>
    <I18nProvider initialPreferences={preferences}>
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          className: "text-base",
          style: { borderRadius: "1rem", padding: "0.9rem 1.1rem" },
        }}
      />
    </I18nProvider>
    </ThemeChoiceProvider>
  );
}
