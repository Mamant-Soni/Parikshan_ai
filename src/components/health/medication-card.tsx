"use client";

import { CalendarRange, Clock, Pill, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { MedicationStatusPill } from "./status-pill";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { deleteMedicationAction } from "@/lib/actions/medications";
import { formatDate } from "@/lib/i18n/format";
import type { DoseSlot } from "@/types/domain";

export type MedicationCardData = {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  startDate: Date | string;
  endDate: Date | string | null;
  status: string;
  slots: string[];
  notes?: string | null;
  prescribedIn?: string | null;
  todaysLogs?: { slot: string; status: string }[];
};

/** A single medicine, with today's schedule when slots are defined. */
export function MedicationCard({
  medication,
  onToggleDose,
  onDeleted,
}: {
  medication: MedicationCardData;
  onToggleDose?: (slot: DoseSlot, status: "TAKEN" | "PENDING") => void;
  onDeleted?: () => void;
}) {
  const { t, lang, easyRead } = useI18n();
  const [isDeleting, startDelete] = React.useTransition();
  const logBySlot = new Map((medication.todaysLogs ?? []).map((log) => [log.slot, log.status]));

  const spoken = [
    medication.name,
    medication.dosage,
    medication.frequency,
    medication.duration,
  ]
    .filter(Boolean)
    .join(". ");

  const handleDelete = () => {
    if (!window.confirm(t("meds.deleteConfirm"))) return;
    startDelete(async () => {
      const result = await deleteMedicationAction(medication.id);
      if (result.ok) {
        toast.success(t("meds.deleted"));
        onDeleted?.();
      } else {
        toast.error(t("error.deleteFailed"));
      }
    });
  };

  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Pill className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-ink-900">{medication.name}</h3>
            <p className="text-sm text-ink-600">
              {medication.dosage ?? t("meds.noDosage")}
              {medication.frequency ? ` · ${medication.frequency}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ReadAloudButton text={spoken} size="icon" />
            <MedicationStatusPill status={medication.status} />
          </div>
        </div>

        <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-600">
          <div className="flex items-center gap-1.5">
            <CalendarRange className="size-4" aria-hidden="true" />
            <dt className="sr-only">{t("meds.startDate")}</dt>
            <dd>
              {formatDate(medication.startDate, lang)}
              {medication.endDate ? ` → ${formatDate(medication.endDate, lang)}` : ` → ${t("meds.ongoing")}`}
            </dd>
          </div>
          {medication.duration && !easyRead && (
            <div className="flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden="true" />
              <dd>{medication.duration}</dd>
            </div>
          )}
        </dl>

        {medication.notes && (
          <p className="rounded-xl bg-ink-50 p-2.5 text-sm text-ink-700">{medication.notes}</p>
        )}

        {medication.slots.length > 0 && medication.status !== "COMPLETED" && (
          <div className="flex flex-wrap gap-2">
            {medication.slots.map((slot) => {
              const taken = logBySlot.get(slot) === "TAKEN";
              return (
                <Button
                  key={slot}
                  type="button"
                  variant={taken ? "primary" : "secondary"}
                  size="sm"
                  aria-pressed={taken}
                  onClick={() => onToggleDose?.(slot as DoseSlot, taken ? "PENDING" : "TAKEN")}
                  disabled={!onToggleDose}
                >
                  {taken ? "✓" : "○"} {t(`slot.${slot}` as "slot.MORNING")}
                </Button>
              );
            })}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {medication.prescribedIn ? (
            <Badge variant="neutral">{t("meds.prescribedBy")}: {medication.prescribedIn}</Badge>
          ) : (
            <span />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-alert-600 hover:bg-alert-50"
            aria-label={`${t("common.delete")} ${medication.name}`}
          >
            <Trash2 aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t("common.delete")}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
