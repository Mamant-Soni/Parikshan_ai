"use client";

import * as React from "react";
import type { ThemeChoice } from "@/lib/theme/theme";

/** The theme choice the server saw in the request cookie (same value on server and client). */
const ThemeChoiceContext = React.createContext<ThemeChoice>("system");

export function ThemeChoiceProvider({ value, children }: { value: ThemeChoice; children: React.ReactNode }) {
  return <ThemeChoiceContext.Provider value={value}>{children}</ThemeChoiceContext.Provider>;
}

export function useThemeChoice() {
  return React.useContext(ThemeChoiceContext);
}
