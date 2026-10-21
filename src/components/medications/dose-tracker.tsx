"use client";

import * as React from "react";
import { AlarmClock, CheckCircle2, Circle, Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/components/providers/i18n-provider";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { markAllDosesTakenAction, toggleDoseAction } from "@/lib/actions/medications";
import { DOSE_SLOTS, SLOT_DEFAULT_TIME, type DoseSlot } from "@/types/domain";
import { cn } from "@/lib/utils";

const SLOT_META: Record<DoseSlot, { emoji: string; icon: React.ReactNode }> = {
  MORNING: { emoji: "🌅", icon: <Sunrise className="size-5" aria-hidden="true" /> },
  AFTERNOON: { emoji: "☀️", icon: <Sun aria-hidden="true" /> },
  EVENING: { emoji: "🌇", icon: <Sunset className="size-5" aria-hidden="true" /> },
  NIGHT: { emoji: "🌙", icon: <Moon className="size-5" aria-hidden="true" /> },
};

export type DoseItem = {
  medicationId: string;
  name: string;
  dosage: string | null;
  slot: DoseSlot;
  status: string;
  time?: string | null;
};

/**
 * Today's medicine schedule with large tick-off buttons.
 *
 * Reminders in this demo live inside the app only — no push notifications are
 * sent, and the copy says so rather than implying a system alarm.
 */
export function DoseTracker({ items, profileId }: { items: DoseItem[]; profileId: string }) {
  const { t, easyRead } = useI18n();
  const [state, setState] = React.useState(items);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => setState(items), [items]);

  const taken = state.filter((item) => item.status === "TAKEN").length;
  const total = state.length;

  const toggle = (item: DoseItem) => {
    const nextStatus = item.status === "TAKEN" ? "PENDING" : "TAKEN";
    setState((current) =>
      current.map((entry) =>
        entry.medicationId === item.medicationId && entry.slot === item.slot
          ? { ...entry, status: nextStatus }
          : entry,
      ),
    );
    startTransition(async () => {
      const result = await toggleDoseAction({
        medicationId: item.medicationId,
        slot: item.slot,
        status: nextStatus,
      });
      if (!result.ok) {
        toast.error(t("error.saveFailed"));
        setState(items);
      }
    });
  };

  const markAll = () => {
    setState((current) => current.map((item) => ({ ...item, status: "TAKEN" })));
    startTransition(async () => {
      const result = await markAllDosesTakenAction(profileId);
      if (!result.ok) toast.error(t("error.saveFailed"));
      else toast.success(t("meds.taken"));
    });
  };

  const spoken = state
    .map((item) => `${t(`slot.${item.slot}` as "slot.MORNING")}: ${item.name} ${item.dosage ?? ""} — ${item.status === "TAKEN" ? t("meds.taken") : t("meds.pending")}`)
    .join(". ");

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <AlarmClock className="size-5 text-brand-600" aria-hidden="true" />
          {t("reminder.schedule")}
        </CardTitle>
        <div className="flex items-center gap-2">
          {total > 0 && <ReadAloudButton text={spoken} size="icon" />}
          {total > 0 && taken < total && (
            <Button variant="secondary" size="sm" onClick={markAll} disabled={isPending}>
              {t("reminder.markAllTaken")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {total === 0 ? (
          <p className="text-sm text-muted">{t("reminder.noReminders")}</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Progress value={(taken / total) * 100} aria-label={t("reminder.progress", { taken, total })} />
              <p className="text-sm text-muted">{t("reminder.progress", { taken, total })}</p>
            </div>

            <ul className="space-y-2.5">
              {DOSE_SLOTS.filter((slot) => state.some((item) => item.slot === slot)).map((slot) => (
                <li key={slot}>
                  <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-ink-600">
                    <span aria-hidden="true">{SLOT_META[slot].emoji}</span>
                    {t(`slot.${slot}` as "slot.MORNING")}
                    <span className="font-normal text-muted">
                      · {state.find((item) => item.slot === slot)?.time ?? SLOT_DEFAULT_TIME[slot]}
                    </span>
                  </p>
                  <ul className="space-y-2">
                    {state
                      .filter((item) => item.slot === slot)
                      .map((item) => {
                        const isTaken = item.status === "TAKEN";
                        return (
                          <li key={`${item.medicationId}-${item.slot}`}>
                            <Button
                              type="button"
                              variant={isTaken ? "primary" : "secondary"}
                              onClick={() => toggle(item)}
                              aria-pressed={isTaken}
                              className={cn("w-full justify-start gap-3 text-left", !easyRead && "text-base")}
                            >
                              {isTaken ? (
                                <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
                              ) : (
                                <Circle className="size-5 shrink-0 text-ink-400" aria-hidden="true" />
                              )}
                              <span className="min-w-0 flex-1 truncate">
                                {item.name}
                                {item.dosage ? ` · ${item.dosage}` : ""}
                              </span>
                              <span className="shrink-0 text-xs font-semibold uppercase">
                                {isTaken ? t("meds.taken") : t("meds.pending")}
                              </span>
                            </Button>
                          </li>
                        );
                      })}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-xs text-muted">{t("reminder.localOnly")}</p>
      </CardContent>
    </Card>
  );
}
