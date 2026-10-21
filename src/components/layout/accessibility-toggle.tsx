"use client";

import * as React from "react";
import { Accessibility, Check, Contrast, PersonStanding, Type, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

type PrefKey = "easyRead" | "largeText" | "highContrast" | "readAloud" | "autoReadAloud";

/**
 * Accessibility controls, one tap from every screen.
 *
 * Easy Read Mode is the control elderly users need most, so it lives in the
 * header menu *and* has a dedicated toggle. Every option states what it does in
 * plain language rather than naming the CSS technique behind it.
 */
export function AccessibilityToggle() {
  const { prefs, setPref, t } = useI18n();

  const options: { key: PrefKey; labelKey: Parameters<typeof t>[0]; icon: React.ReactNode }[] = [
    { key: "easyRead", labelKey: "settings.easyRead", icon: <PersonStanding className="size-5" aria-hidden="true" /> },
    { key: "largeText", labelKey: "settings.largeText", icon: <Type className="size-5" aria-hidden="true" /> },
    { key: "highContrast", labelKey: "settings.highContrast", icon: <Contrast className="size-5" aria-hidden="true" /> },
    { key: "readAloud", labelKey: "settings.readAloud", icon: <Volume2 className="size-5" aria-hidden="true" /> },
  ];

  const anyOn = prefs.easyRead || prefs.largeText || prefs.highContrast;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={anyOn ? "primary" : "secondary"}
          size="icon"
          aria-label={t("a11y.openSettings")}
          title={t("settings.sectionAccessibility")}
        >
          <Accessibility aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t("settings.sectionAccessibility")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => {
          const active = prefs[option.key];
          return (
            <DropdownMenuItem
              key={option.key}
              onSelect={(event) => {
                event.preventDefault();
                setPref(option.key, !active);
              }}
              aria-checked={active}
              role="menuitemcheckbox"
              className="min-h-[var(--a11y-tap)] gap-3 text-base"
            >
              <span className="text-ink-500">{option.icon}</span>
              <span className="flex-1">{t(option.labelKey)}</span>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border",
                  active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300",
                )}
                aria-hidden="true"
              >
                {active ? <Check className="size-4" /> : null}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setPref("autoReadAloud", !prefs.autoReadAloud);
          }}
          role="menuitemcheckbox"
          aria-checked={prefs.autoReadAloud}
          disabled={!prefs.readAloud}
          className="min-h-[var(--a11y-tap)] text-base"
        >
          <span className="flex-1">{t("settings.autoReadAloud")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single-purpose toggle for Easy Read Mode (used by the profile-setup screen). */
export function EasyReadToggle() {
  const { easyRead, setPref, t } = useI18n();
  return (
    <Button
      variant={easyRead ? "primary" : "secondary"}
      onClick={() => {
        const next = !easyRead;
        setPref("easyRead", next);
        toast.success(next ? t("settings.easyRead") : t("settings.sectionAccessibility"), {
          description: next ? t("settings.easyReadBody") : undefined,
        });
      }}
      aria-pressed={easyRead}
      aria-label={t("a11y.toggleEasyRead")}
    >
      <PersonStanding aria-hidden="true" />
      <span className="hidden sm:inline">{t("settings.easyRead")}</span>
    </Button>
  );
}

/** Larger text, on its own, for the profile-setup screen. */
export function LargeTextToggle() {
  const { largeText, setPref, t } = useI18n();
  return (
    <Button
      variant={largeText ? "primary" : "secondary"}
      size="icon"
      aria-pressed={largeText}
      aria-label={t("settings.largeText")}
      onClick={() => setPref("largeText", !largeText)}
    >
      <Type aria-hidden="true" />
    </Button>
  );
}

/** Compact cluster of the two most useful toggles. */
export function ThemeQuickToggles() {
  return (
    <div className="flex items-center gap-2">
      <EasyReadToggle />
      <LargeTextToggle />
    </div>
  );
}
