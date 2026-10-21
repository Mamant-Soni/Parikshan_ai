"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/providers/i18n-provider";
import { MedicationCard, type MedicationCardData } from "@/components/health/medication-card";
import { createMedicationAction, toggleDoseAction } from "@/lib/actions/medications";
import { DOSE_SLOTS, type DoseSlot } from "@/types/domain";
import { EmptyState } from "@/components/health/states";
import { cn } from "@/lib/utils";

/**
 * Medication list + manual entry.
 *
 * The form asks only for what a prescription contains. It never suggests a
 * medicine, a dose or a duration, and the copy says so.
 */
export function MedicationManager({
  medications,
  profileId,
  onChanged,
}: {
  medications: MedicationCardData[];
  profileId: string;
  onChanged?: () => void;
}) {
  const { t, easyRead } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<"ALL" | "ACTIVE" | "COMPLETED" | "UPCOMING">(easyRead ? "ACTIVE" : "ALL");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isPending, startTransition] = React.useTransition();

  const visible = medications.filter((medication) => filter === "ALL" || medication.status === filter);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("profileId", profileId);
    setErrors({});

    startTransition(async () => {
      const result = await createMedicationAction({ ok: false }, formData);
      if (result.ok) {
        toast.success(t("meds.added"));
        setOpen(false);
        onChanged?.();
        return;
      }
      setErrors(result.fieldErrors ?? {});
      toast.error(result.error === "VALIDATION" ? t("error.validation") : t("error.saveFailed"));
    });
  };

  const handleToggleDose = (medicationId: string, slot: DoseSlot, status: "TAKEN" | "PENDING") => {
    startTransition(async () => {
      const result = await toggleDoseAction({ medicationId, slot, status });
      if (!result.ok) toast.error(t("error.saveFailed"));
      else onChanged?.();
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("common.filter")}>
          {(["ALL", "ACTIVE", "UPCOMING", "COMPLETED"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? "primary" : "secondary"}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "ALL"
                ? t("meds.filterAll")
                : value === "ACTIVE"
                  ? t("meds.statusActive")
                  : value === "UPCOMING"
                    ? t("meds.statusUpcoming")
                    : t("meds.statusCompleted")}
            </Button>
          ))}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <Plus aria-hidden="true" />
              {t("meds.addMedication")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("meds.addMedicationManually")}</DialogTitle>
              <DialogDescription>{t("meds.formHint")}</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="med-name">{t("meds.medicineName")} *</Label>
                <Input id="med-name" name="name" required autoComplete="off" placeholder="Paracetamol" />
                {errors.name && <p className="text-sm text-alert-600">{errors.name}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="med-dosage">{t("meds.dosage")}</Label>
                  <Input id="med-dosage" name="dosage" placeholder="500 mg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="med-frequency">{t("meds.frequency")}</Label>
                  <Input id="med-frequency" name="frequency" placeholder="Twice daily" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="med-start">{t("meds.startDate")} *</Label>
                  <Input id="med-start" name="startDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                  {errors.startDate && <p className="text-sm text-alert-600">{errors.startDate}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="med-end">{t("meds.endDate")}</Label>
                  <Input id="med-end" name="endDate" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="med-duration">{t("meds.duration")}</Label>
                  <Input id="med-duration" name="duration" placeholder="5 days" />
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-ink-800">{t("meds.whenToTake")}</legend>
                <div className="flex flex-wrap gap-2">
                  {DOSE_SLOTS.map((slot) => (
                    <label
                      key={slot}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-ink-200 px-3 py-2 text-sm",
                        "has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800",
                      )}
                    >
                      <input type="checkbox" name="slots" value={slot} className="size-4 accent-[var(--color-brand-600)]" />
                      {t(`slot.${slot}` as "slot.MORNING")}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="med-notes">{t("meds.notes")}</Label>
                <Textarea id="med-notes" name="notes" rows={2} placeholder={t("meds.notesPlaceholder")} />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={isPending} size="lg">
                  {isPending ? t("meds.saving") : t("common.save")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t("meds.noMedications")} description={t("meds.noMedicationsBody")} actionLabel={t("nav.upload")} actionHref="/upload" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((medication) => (
            <li key={medication.id} className="h-full">
              <MedicationCard
                medication={medication}
                onToggleDose={(slot, status) => handleToggleDose(medication.id, slot, status)}
                onDeleted={onChanged}
              />
            </li>
          ))}
        </ul>
      )}

      <Card className="border-dashed bg-surface">
        <CardContent className="text-sm text-muted">
          <p>{t("safety.noPrescribing")}</p>
          <p className="mt-1">{t("meds.reminderHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
