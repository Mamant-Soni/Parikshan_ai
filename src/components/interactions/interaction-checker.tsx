"use client";

import * as React from "react";
import { AlertTriangle, Info, Loader2, ShieldCheck, ShieldQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { SeverityPill } from "@/components/health/status-pill";
import { EmptyState } from "@/components/health/states";
import { checkInteractionsAction } from "@/lib/actions/interactions";
import type { InteractionCheckResult } from "@/lib/interactions/types";
import { cn } from "@/lib/utils";

/**
 * Medication safety checker.
 *
 * Safety-by-design decisions visible here:
 *  • The dataset is labelled as a demo list, not a clinical reference.
 *  • "No interaction found" is presented as "we did not find one", never as
 *    "this combination is safe".
 *  • Advice always routes to a doctor or pharmacist; medication is never to be
 *    stopped or changed.
 */
export function InteractionChecker({
  medications,
}: {
  medications: { id: string; name: string; dosage: string | null; status: string }[];
}) {
  const { t, easyRead, lang } = useI18n();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [result, setResult] = React.useState<InteractionCheckResult | null>(null);
  const [isChecking, setIsChecking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = (id: string) => {
    setResult(null);
    setError(null);
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const check = async () => {
    if (selected.length < 2) {
      setError(t("interactions.selectTwo"));
      return;
    }
    setIsChecking(true);
    setError(null);
    const response = await checkInteractionsAction({ medicationIds: selected });
    setIsChecking(false);
    if (!response.ok) {
      setError(response.error === "SELECT_TWO" ? t("interactions.selectTwo") : t("error.generic"));
      return;
    }
    setResult(response.result);
  };

  if (medications.length < 2) {
    return (
      <EmptyState
        title={t("interactions.noMedicines")}
        description={t("interactions.noMedicinesBody")}
        actionLabel={t("meds.addMedication")}
        actionHref="/medications"
      />
    );
  }

  const selectedNames = medications.filter((medication) => selected.includes(medication.id)).map((m) => m.name);
  const spokenText = result
    ? result.findings.length
      ? result.findings
          .map(
            (finding) =>
              `${finding.medicineA} + ${finding.medicineB}. ${lang === "hi" ? finding.description : finding.description}. ${finding.action}`,
          )
          .join(". ")
      : t("interactions.none")
    : "";

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{t("interactions.selectMedicines")}</CardTitle>
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setSelected([]); setResult(null); }}>
              {t("interactions.clear")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {medications.map((medication) => {
              const isSelected = selected.includes(medication.id);
              return (
                <li key={medication.id}>
                  <label
                    className={cn(
                      "flex min-h-[var(--a11y-tap)] cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                      isSelected ? "border-brand-300 bg-brand-50" : "border-ink-200 hover:bg-ink-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--color-brand-600)]"
                      checked={isSelected}
                      onChange={() => toggle(medication.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink-900">{medication.name}</span>
                      {medication.dosage && <span className="block text-sm text-muted">{medication.dosage}</span>}
                    </span>
                    {medication.status === "ACTIVE" && <Badge variant="good">{t("meds.statusActive")}</Badge>}
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={check} disabled={isChecking || selected.length < 2}>
              {isChecking ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShieldQuestion aria-hidden="true" />}
              {isChecking ? t("interactions.checking") : t("interactions.check")}
            </Button>
            <p className="text-sm text-muted">
              {selected.length > 0 ? t("interactions.selectedCount", { count: selected.length }) : t("interactions.selectTwo")}
            </p>
          </div>

          {error && (
            <Alert variant="watch">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-watch-600" aria-hidden="true" />
              <p>{error}</p>
            </Alert>
          )}
        </CardContent>
      </Card>

      {isChecking && (
        <Card aria-live="polite">
          <CardContent className="flex items-center gap-3 py-6">
            <Loader2 className="size-5 animate-spin text-brand-600" aria-hidden="true" />
            <p className="font-medium text-brand-700">{t("interactions.checking")}</p>
          </CardContent>
        </Card>
      )}

      {result && !isChecking && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              {result.findings.length ? (
                <AlertTriangle className="size-5 text-watch-600" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-5 text-good-600" aria-hidden="true" />
              )}
              {result.findings.length ? t("interactions.detected") : t("interactions.none")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="neutral">{t("interactions.checkedPairs", { count: result.checkedPairs })}</Badge>
              <ReadAloudButton text={spokenText} size="icon" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4" aria-live="polite">
            {result.findings.length === 0 ? (
              <p className="text-sm text-ink-700">{t("interactions.noneBody")}</p>
            ) : (
              <ul className="space-y-4">
                {result.findings.map((finding, index) => (
                  <li key={`${finding.medicineA}-${finding.medicineB}-${index}`} className="rounded-2xl border border-watch-100 bg-watch-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-lg font-semibold text-ink-900">
                        {finding.medicineA} + {finding.medicineB}
                      </p>
                      <SeverityPill severity={finding.severity} />
                    </div>
                    <p className="mt-2 text-base leading-relaxed text-ink-800">{finding.description}</p>
                    <div className="mt-3 rounded-xl bg-surface/70 p-3">
                      <p className="text-sm font-semibold text-ink-900">{t("interactions.action")}</p>
                      <p className="text-sm text-ink-700">{finding.action}</p>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {t("interactions.source")}: {finding.source}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {easyRead && result.findings.length > 0 && (
              <p className="text-base font-semibold text-watch-700">{t("interactions.plainWarning")}</p>
            )}

            <Alert variant="alert">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-alert-600" aria-hidden="true" />
              <p className="text-sm font-medium">{t("interactions.neverStop")}</p>
            </Alert>

            <Alert variant="neutral">
              <Info className="mt-0.5 size-5 shrink-0 text-info-600" aria-hidden="true" />
              <div className="space-y-1 text-sm">
                <p>{result.isVerifiedSource ? result.providerName : t("interactions.datasetNotice")}</p>
                <p className="text-muted">{t("interactions.productionNotice")}</p>
              </div>
            </Alert>

            {selectedNames.length > 0 && (
              <p className="text-xs text-muted">{selectedNames.join(" · ")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
