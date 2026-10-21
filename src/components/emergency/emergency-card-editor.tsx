"use client";

import * as React from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useFeatureText } from "@/lib/i18n/use-feature-text";
import { useI18n } from "@/components/providers/i18n-provider";
import { saveCardAction } from "@/lib/actions/safety";
import { selectClass } from "./contacts-manager";
import type { CardView } from "@/lib/safety/card";

const BLOOD_GROUPS = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/**
 * Emergency card. Every value shows its source. Blood group, allergies and
 * conditions are USER-ENTERED (self-reported) — no verified source exists in
 * this build, so nothing is labelled verified. Medicines come from the medicine
 * list and are only read here. Each item is shared only when ticked.
 */
export function EmergencyCardEditor({ card, medicines }: { card: CardView | null; medicines: string[] }) {
  const ft = useFeatureText();
  const { t } = useI18n();
  const [form, setForm] = React.useState({
    bloodGroup: card?.bloodGroup ?? "",
    allergies: card?.allergies ?? "",
    conditions: card?.conditions ?? "",
    notes: card?.notes ?? "",
    shareBloodGroup: card?.shareBloodGroup ?? false,
    shareAllergies: card?.shareAllergies ?? false,
    shareConditions: card?.shareConditions ?? false,
    shareMedicines: card?.shareMedicines ?? false,
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((c) => ({ ...c, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const result = await saveCardAction(form);
    setBusy(false);
    if (result.ok) toast.success(ft("card.saved"));
    else {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      toast.error(t("error.generic"));
    }
  };

  const previewItems = [
    form.shareBloodGroup && form.bloodGroup ? `${ft("card.bloodGroup")}: ${form.bloodGroup} (${ft("card.bloodNotVerified")})` : null,
    form.shareAllergies && form.allergies ? `${ft("card.allergies")}: ${form.allergies}` : null,
    form.shareConditions && form.conditions ? `${ft("card.conditions")}: ${form.conditions}` : null,
    form.shareMedicines && medicines.length ? `${ft("card.medicines")}: ${medicines.join(", ")}` : null,
  ].filter(Boolean) as string[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ft("card.title")}</CardTitle>
        <CardDescription>{ft("card.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Alert variant="watch">
          <AlertTitle>{ft("card.noVerifiedSource")}</AlertTitle>
          <AlertDescription>{ft("card.lockScreenWarning")}</AlertDescription>
        </Alert>

        <form onSubmit={save} className="space-y-5" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="card-bg">{ft("card.bloodGroup")}</Label>
              <select id="card-bg" className={selectClass} value={form.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)} aria-describedby="card-bg-source">
                {BLOOD_GROUPS.map((value) => <option key={value || "none"} value={value}>{value || ft("card.bloodNone")}</option>)}
              </select>
              <p id="card-bg-source" className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge variant="neutral">{ft("card.sourceUser")}</Badge> {ft("card.bloodNotVerified")}
              </p>
              {errors.bloodGroup ? <p role="alert" className="text-sm text-alert-700">{errors.bloodGroup}</p> : null}
              <Checkbox id="share-bg" label={ft("card.share")} checked={form.shareBloodGroup} onChange={(v) => set("shareBloodGroup", v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-allergies">{ft("card.allergies")}</Label>
              <Textarea id="card-allergies" rows={2} maxLength={500} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
              <p className="flex items-center gap-2 text-xs text-muted"><Badge variant="neutral">{ft("card.sourceUser")}</Badge></p>
              {errors.allergies ? <p role="alert" className="text-sm text-alert-700">{errors.allergies}</p> : null}
              <Checkbox id="share-allergies" label={ft("card.share")} checked={form.shareAllergies} onChange={(v) => set("shareAllergies", v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-conditions">{ft("card.conditions")}</Label>
              <Textarea id="card-conditions" rows={2} maxLength={500} value={form.conditions} onChange={(e) => set("conditions", e.target.value)} />
              <p className="flex items-center gap-2 text-xs text-muted"><Badge variant="neutral">{ft("card.sourceUser")}</Badge></p>
              {errors.conditions ? <p role="alert" className="text-sm text-alert-700">{errors.conditions}</p> : null}
              <Checkbox id="share-conditions" label={ft("card.share")} checked={form.shareConditions} onChange={(v) => set("shareConditions", v)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="card-notes">{ft("card.notes")}</Label>
              <Textarea id="card-notes" rows={2} maxLength={500} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              <p className="flex items-center gap-2 text-xs text-muted"><Badge variant="neutral">{ft("card.sourceUser")}</Badge></p>
              {errors.notes ? <p role="alert" className="text-sm text-alert-700">{errors.notes}</p> : null}
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-ink-200 bg-canvas/40 p-4">
            <p className="font-semibold text-ink-900">{ft("card.medicines")}</p>
            <p className="text-sm text-ink-700">{ft("card.medicinesSource")}</p>
            {medicines.length === 0 ? (
              <p className="text-sm text-muted">{ft("card.empty")}</p>
            ) : (
              <p className="text-sm text-ink-800">{medicines.join(", ")}</p>
            )}
            <Checkbox id="share-meds" label={ft("card.share")} checked={form.shareMedicines} onChange={(v) => set("shareMedicines", v)} />
          </div>

          <p className="text-sm text-muted">{ft("card.shareHelp")}</p>
          <Button type="submit" disabled={busy}>{ft("card.save")}</Button>
        </form>

        <section aria-labelledby="card-preview-title" className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
          <h3 id="card-preview-title" className="font-semibold text-ink-900">{ft("card.preview")}</h3>
          {previewItems.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700">{ft("card.shareHelp")}</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-800">
              {previewItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function Checkbox({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-[var(--a11y-tap)] cursor-pointer items-center gap-3 text-sm text-ink-800">
      <input id={id} type="checkbox" className="size-5 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
