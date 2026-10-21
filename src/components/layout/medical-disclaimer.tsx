"use client";

import * as React from "react";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReadAloudButton } from "./read-aloud-button";
import { useI18n } from "@/components/providers/i18n-provider";

const DISMISS_KEY = "phc.disclaimerDismissed";

/**
 * Global medical disclaimer.
 *
 * "Dismissible but persistent": the banner can be collapsed for the current
 * session, and the same message always remains in the footer, so the safety
 * statement can never be permanently removed from the UI.
 */
export function MedicalDisclaimerBanner() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  const text = `${t("disclaimer.title")} ${t("disclaimer.body")}`;

  return (
    <div className="border-b border-watch-100 bg-watch-50" role="note">
      <div className="mx-auto flex w-full max-w-7xl items-start gap-3 px-3 py-2.5 sm:px-5">
        <Info className="mt-0.5 size-5 shrink-0 text-watch-700" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-watch-800">
          <strong className="font-semibold">{t("disclaimer.title")}</strong> {t("disclaimer.body")}
        </p>
        <ReadAloudButton text={text} className="text-watch-700" />
        <Button
          variant="ghost"
          size="icon"
          className="size-9 min-h-9 text-watch-700"
          aria-label={t("common.dismiss")}
          onClick={() => {
            setDismissed(true);
            try {
              window.sessionStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // Ignore storage failures — the banner simply reappears.
            }
          }}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** Always-visible reminder at the end of every authenticated page. */
export function MedicalDisclaimerFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-10 border-t border-ink-200 pt-5 text-sm leading-relaxed text-muted">
      <p className="font-medium text-ink-700">⚠️ {t("disclaimer.short")}</p>
      <p className="mt-1">{t("disclaimer.body")}</p>
      <p className="mt-1">{t("disclaimer.demoNote")}</p>
    </footer>
  );
}
