"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/components/providers/i18n-provider";

/**
 * Route-level error boundary.
 *
 * Shows a calm, plain-language message with a retry, and logs the digest for
 * support. No stack traces, no raw database errors in front of a patient.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  const router = useRouter();

  React.useEffect(() => {
    // Server-side digest is what a support engineer needs; the user sees copy.
    console.error("[app] route error", error.digest ?? error.message);
  }, [error]);

  return (
    <Card className="mx-auto max-w-xl border-alert-100 bg-alert-50">
      <CardContent className="space-y-4 text-center">
        <p className="text-4xl" aria-hidden="true">
          🛟
        </p>
        <h1 className="text-xl font-semibold text-ink-900">{t("error.genericTitle")}</h1>
        <p className="text-base leading-relaxed text-ink-700">{t("error.genericBody")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            onClick={() => {
              reset();
              router.refresh();
            }}
          >
            <RefreshCw aria-hidden="true" />
            {t("common.tryAgain")}
          </Button>
          <Button asChild variant="secondary">
            <Link href="/dashboard">{t("nav.dashboard")}</Link>
          </Button>
        </div>
        {error.digest && <p className="text-xs text-ink-500">Reference: {error.digest}</p>}
      </CardContent>
    </Card>
  );
}
