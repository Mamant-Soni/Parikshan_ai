"use client";

import * as React from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
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
import { useThemeChoice } from "@/components/providers/theme-provider";
import { type ThemeChoice, writeThemeCookie } from "@/lib/theme/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; icon: React.ReactNode }[] = [
  { value: "light", icon: <Sun className="size-4" aria-hidden="true" /> },
  { value: "dark", icon: <Moon className="size-4" aria-hidden="true" /> },
  { value: "system", icon: <Monitor className="size-4" aria-hidden="true" /> },
];

/** Applies a theme choice to the live document (the server-side class covers reloads). */
export function applyThemeChoice(choice: ThemeChoice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  writeThemeCookie(choice);
}

/**
 * Light / Dark / System switch. The choice is kept in a cookie, and `system`
 * follows the OS setting live while the page is open.
 */
export function ThemeToggle() {
  const { t } = useI18n();
  const initial = useThemeChoice();
  const [choice, setChoice] = React.useState<ThemeChoice>(initial);

  React.useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeChoice("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  const labels: Record<ThemeChoice, string> = {
    light: t("theme.light"),
    dark: t("theme.dark"),
    system: t("theme.system"),
  };

  const select = (value: ThemeChoice) => {
    setChoice(value);
    applyThemeChoice(value);
  };

  const CurrentIcon = OPTIONS.find((option) => option.value === choice)?.icon ?? OPTIONS[2].icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          aria-label={`${t("theme.label")}: ${labels[choice]}`}
          title={`${t("theme.label")}: ${labels[choice]}`}
        >
          {CurrentIcon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((option) => {
          const active = option.value === choice;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => select(option.value)}
              aria-current={active ? "true" : undefined}
              className={cn("gap-3", active && "font-semibold text-brand-800")}
            >
              {option.icon}
              <span className="flex-1">{labels[option.value]}</span>
              {active ? <Check className="size-4" aria-hidden="true" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
