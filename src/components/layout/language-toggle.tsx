"use client";

import { Languages } from "lucide-react";
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
import { LANGUAGES } from "@/lib/i18n";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

/** English ⇄ हिंदी. Switching re-renders the whole app from the dictionary. */
export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLanguage, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" aria-label={t("a11y.toggleLanguage")} title={t("lang.switchTo")}>
          <Languages aria-hidden="true" />
          {!compact && <span className="text-sm font-semibold uppercase">{lang}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("lang.switchTo")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGUAGES.map((entry) => (
          <DropdownMenuItem
            key={entry.value}
            onSelect={() => {
              setLanguage(entry.value);
              toast.success(t("lang.changed", { language: t(entry.labelKey) }));
            }}
            className="min-h-[var(--a11y-tap)] gap-3 text-base"
          >
            <span className={cn("font-semibold", lang === entry.value && "text-brand-700")}>{entry.short}</span>
            <span className="flex-1">{t(entry.labelKey)}</span>
            {lang === entry.value ? <span className="text-xs text-brand-700">✓</span> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
