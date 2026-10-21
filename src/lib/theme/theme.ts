/**
 * Theme preference. Stored in a first-party cookie (not localStorage) so the
 * server can render the correct `dark` class on the first response — no flash
 * of the wrong theme on load. The cookie holds only the choice, never health data.
 */
export const THEME_COOKIE = "phc_theme";
export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type ResolvedTheme = "light" | "dark";

export function parseThemeChoice(value: string | null | undefined): ThemeChoice {
  return (THEME_CHOICES as readonly string[]).includes(value ?? "") ? (value as ThemeChoice) : "system";
}

/** Class to put on <html> for a server-known choice. `system` is resolved by the inline script. */
export function serverThemeClass(choice: ThemeChoice): string {
  return choice === "dark" ? "dark" : "";
}

/**
 * Inline script executed before first paint. It resolves `system` against the
 * OS preference and applies the class synchronously, so there is no flash.
 * It contains no user data and no external references.
 */
export const NO_FLASH_THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)/);var c=m?m[1]:"system";var d=c==="dark"||(c==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var el=document.documentElement;el.classList.toggle("dark",d);el.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

export function writeThemeCookie(choice: ThemeChoice) {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=${oneYear}; SameSite=Lax`;
}
