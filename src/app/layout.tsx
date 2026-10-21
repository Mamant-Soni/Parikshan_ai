import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RootProviders } from "@/components/providers/root-providers";
import { cookies } from "next/headers";
import { NO_FLASH_THEME_SCRIPT, THEME_COOKIE, parseThemeChoice, serverThemeClass } from "@/lib/theme/theme";
import { getCurrentUser } from "@/lib/auth/session";
import type { Preferences } from "@/components/providers/i18n-provider";

/**
 * Root layout.
 *
 * Accessibility preferences are read on the server so the very first paint
 * already has the right font size, contrast and language — no flash of the
 * default theme for a user who needs Easy Read Mode.
 */

export const metadata: Metadata = {
  title: {
    default: "Parikshan — your health records, clearer and connected",
    template: "%s · Parikshan",
  },
  description:
    "Upload prescriptions, lab reports and medical records. Get plain-language explanations, trends, medicine reminders and answers grounded in your own documents. English + हिंदी.",
  applicationName: "Parikshan",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Parikshan", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  keywords: ["health records", "prescription", "lab report", "ABHA", "FHIR", "Hindi", "health app"],
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zooming must stay possible — never cap it for accessibility.
  maximumScale: 5,
  themeColor: "#15816f",
};

const DEFAULT_PREFERENCES: Preferences = {
  language: "en",
  easyRead: false,
  largeText: false,
  highContrast: false,
  readAloud: true,
  autoReadAloud: false,
  notifyMeds: true,
  notifyRecords: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const themeChoice = parseThemeChoice((await cookies()).get(THEME_COOKIE)?.value);
  const preferences: Preferences = user?.preferences
    ? {
        language: user.preferences.language === "hi" ? "hi" : "en",
        easyRead: user.preferences.easyRead,
        largeText: user.preferences.largeText,
        highContrast: user.preferences.highContrast,
        readAloud: user.preferences.readAloud,
        autoReadAloud: user.preferences.autoReadAloud,
        notifyMeds: user.preferences.notifyMeds,
        notifyRecords: user.preferences.notifyRecords,
      }
    : DEFAULT_PREFERENCES;

  const htmlClasses = [
    preferences.easyRead ? "easy-read" : "",
    preferences.largeText ? "large-text" : "",
    preferences.highContrast ? "high-contrast" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <html lang={preferences.language} className={[htmlClasses, serverThemeClass(themeChoice)].filter(Boolean).join(" ")} suppressHydrationWarning>
      <head>
        {/* Runs before first paint: applies the saved/OS theme with no flash. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <RootProviders preferences={preferences} themeChoice={themeChoice}>{children}</RootProviders>
      </body>
    </html>
  );
}
