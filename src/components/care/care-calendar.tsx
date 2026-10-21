"use client";

import * as React from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, List, Pencil, Plus, RotateCcw, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/providers/i18n-provider";
import { useFeatureText } from "@/lib/i18n/use-feature-text";
import { createCareTaskAction, updateCareTaskAction, changeCareTaskStatusAction } from "@/lib/actions/care";
import { selectClass } from "@/components/emergency/contacts-manager";
import { addDays, taskTiming, type TaskTiming } from "@/lib/care/care";
import type { CareTaskView } from "@/lib/care/service";
import type { FeatureKey } from "@/lib/i18n/features";
import { cn } from "@/lib/utils";

type View = "list" | "month";
type Filter = "OPEN" | "DONE" | "CANCELLED" | "ALL";

/** YYYY-MM-DD in the device's own calendar (not UTC), so "today" matches the user's day. */
export function localDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const EMPTY_FORM = {
  title: "",
  category: "GENERAL",
  source: "USER",
  clinicianName: "",
  dueDate: "",
  dueTime: "",
  recurrence: "NONE",
  reminderDaysBefore: "",
  notes: "",
};

const TIMING_KEY: Record<TaskTiming, FeatureKey> = {
  OVERDUE: "care.overdue",
  DUE_SOON: "care.dueSoon",
  UPCOMING: "care.filterOpen",
  CLOSED: "care.filterDone",
};

export function CareCalendar({ tasks, profileName }: { tasks: CareTaskView[]; profileName: string }) {
  const ft = useFeatureText();
  const { lang } = useI18n();
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const [today, setToday] = React.useState<string>("");
  const [view, setView] = React.useState<View>("list");
  const [filter, setFilter] = React.useState<Filter>("OPEN");
  const [monthCursor, setMonthCursor] = React.useState<Date>(() => new Date());
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<CareTaskView | "new" | null>(null);
  const [prefillDate, setPrefillDate] = React.useState<string>("");
  const [cancelling, setCancelling] = React.useState<CareTaskView | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Computed on the client so "today" is the user's own calendar day.
  React.useEffect(() => {
    setToday(localDateString(new Date()));
  }, []);

  const timeZone = React.useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "local";
    }
  }, []);

  const dueSoonCount = tasks.filter((task) => {
    if (!today || task.status !== "OPEN") return false;
    const timing = taskTiming(task, today);
    return timing === "DUE_SOON" || timing === "OVERDUE";
  }).length;

  const visible = tasks.filter((task) => (filter === "ALL" ? true : task.status === filter));
  const shownForDay = selectedDay ? visible.filter((task) => task.dueDate === selectedDay) : visible;

  const run = async (action: () => Promise<{ ok: boolean; error?: string; fieldErrors?: Record<string, string> }>, message: string) => {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (result.ok && message) toast.success(message);
    else toast.error(result.error === "NOT_FOUND" ? ft("care.notFound") : ft("care.genericError"));
    return result;
  };

  const fmtDate = (value: string) => parseLocalDate(value).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-5">
      <Alert variant="info">
        <AlertDescription>
          {ft("care.neverAuto")} {ft("care.legal")}
        </AlertDescription>
      </Alert>

      {dueSoonCount > 0 && (
        <div role="status" className="rounded-2xl border border-watch-100 bg-watch-50 px-4 py-3 text-base font-medium text-ink-900">
          {ft("care.dueSoonBanner", { n: dueSoonCount })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={ft("care.title")}>
          <Button type="button" variant={view === "list" ? "primary" : "secondary"} aria-pressed={view === "list"} onClick={() => setView("list")}>
            <List className="size-4" aria-hidden="true" />{ft("care.listView")}
          </Button>
          <Button type="button" variant={view === "month" ? "primary" : "secondary"} aria-pressed={view === "month"} onClick={() => setView("month")}>
            <CalendarDays className="size-4" aria-hidden="true" />{ft("care.monthView")}
          </Button>
          <label className="sr-only" htmlFor="care-filter">{ft("care.filterAll")}</label>
          <select id="care-filter" className={cn(selectClass, "w-auto min-w-40")} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="OPEN">{ft("care.filterOpen")}</option>
            <option value="DONE">{ft("care.filterDone")}</option>
            <option value="CANCELLED">{ft("care.filterCancelled")}</option>
            <option value="ALL">{ft("care.filterAll")}</option>
          </select>
        </div>
        <Button type="button" onClick={() => { setPrefillDate(selectedDay ?? today); setEditing("new"); }}>
          <Plus className="size-4" aria-hidden="true" />{ft("care.add")}
        </Button>
      </div>

      {view === "month" && (
        <MonthGrid
          cursor={monthCursor}
          setCursor={setMonthCursor}
          tasks={visible}
          today={today}
          selectedDay={selectedDay}
          onSelect={setSelectedDay}
          locale={locale}
          ft={ft}
        />
      )}

      {view === "month" && selectedDay && (
        <p className="text-sm text-ink-700">
          {fmtDate(selectedDay)} ·{" "}
          <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setSelectedDay(null)}>
            {ft("care.today")}
          </button>
        </p>
      )}

      {shownForDay.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-base text-ink-700">{ft("care.empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3" aria-label={`${ft("care.title")} — ${profileName}`}>
          {shownForDay.map((task) => {
            const timing = task.status === "OPEN" && today ? taskTiming(task, today) : "CLOSED";
            return (
              <li key={task.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={timing === "OVERDUE" ? "alert" : timing === "DUE_SOON" ? "watch" : task.status === "OPEN" ? "brand" : "neutral"}>
                          {task.status === "DONE" ? ft("care.filterDone") : task.status === "CANCELLED" ? ft("care.filterCancelled") : ft(TIMING_KEY[timing])}
                        </Badge>
                        <Badge variant={task.source === "CLINICIAN" ? "info" : "neutral"}>
                          {task.source === "CLINICIAN" ? ft("care.sourceClinician") : ft("care.sourceUser")}
                        </Badge>
                      </div>
                      <h3 className="text-base font-semibold text-ink-900">{task.title}</h3>
                      <p className="flex items-center gap-1.5 text-sm text-ink-700">
                        <Clock className="size-4" aria-hidden="true" />
                        <time dateTime={task.dueDate}>{fmtDate(task.dueDate)}</time>
                        {task.dueTime ? <span>· {task.dueTime}</span> : null}
                      </p>
                      {task.source === "CLINICIAN" && task.clinicianName ? (
                        <p className="text-sm text-ink-700">{ft("care.clinicianName")}: {task.clinicianName}</p>
                      ) : null}
                      <p className="text-xs text-muted">
                        {ft("care.recurrence")}: {recurrenceLabel(task.recurrence, ft)}
                        {task.reminderDaysBefore ? ` · ${ft("care.reminder")}: ${task.reminderDaysBefore}d` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {task.status === "OPEN" ? (
                        <>
                          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => run(() => changeCareTaskStatusAction(task.id, "complete"), ft("care.done"))}>
                            <CheckCircle2 className="size-4" aria-hidden="true" />{ft("care.complete")}
                            <span className="sr-only">: {task.title}</span>
                          </Button>
                          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={async () => {
                              const result = await run(() => changeCareTaskStatusAction(task.id, "postpone"), "");
                              if (result.ok) toast.success(ft("care.postponed", { date: fmtDate(addDays(task.dueDate, 7)) }));
                            }}>
                            <RotateCcw className="size-4" aria-hidden="true" />{ft("care.postpone")}
                            <span className="sr-only">: {task.title}</span>
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(task)}>
                            <Pencil className="size-4" aria-hidden="true" />{ft("care.edit")}
                            <span className="sr-only">: {task.title}</span>
                          </Button>
                          <Button type="button" variant="secondary" size="sm" onClick={() => setCancelling(task)}>
                            <XCircle className="size-4" aria-hidden="true" />{ft("care.cancel")}
                            <span className="sr-only">: {task.title}</span>
                          </Button>
                        </>
                      ) : (
                        <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => run(() => changeCareTaskStatusAction(task.id, "reopen"), ft("care.saved"))}>
                          <RotateCcw className="size-4" aria-hidden="true" />{ft("care.reopen")}
                          <span className="sr-only">: {task.title}</span>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted">{ft("care.tzNote", { tz: timeZone })}</p>

      <TaskDialog
        target={editing}
        prefillDate={prefillDate}
        onClose={() => setEditing(null)}
        ft={ft}
      />

      <Dialog open={cancelling !== null} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ft("care.cancelTitle")}</DialogTitle>
            <DialogDescription>{ft("care.cancelBody", { title: cancelling?.title ?? "" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">{ft("care.keepTask")}</Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (!cancelling) return;
                const result = await run(() => changeCareTaskStatusAction(cancelling.id, "cancel"), ft("care.cancelled"));
                if (result.ok) setCancelling(null);
              }}
            >
              {ft("care.cancelConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function recurrenceLabel(value: string, ft: (key: FeatureKey) => string): string {
  switch (value) {
    case "MONTHLY": return ft("care.recMonthly");
    case "EVERY_3_MONTHS": return ft("care.rec3m");
    case "EVERY_6_MONTHS": return ft("care.rec6m");
    case "YEARLY": return ft("care.recYearly");
    default: return ft("care.recNone");
  }
}

function MonthGrid({
  cursor, setCursor, tasks, today, selectedDay, onSelect, locale, ft,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  tasks: CareTaskView[];
  today: string;
  selectedDay: string | null;
  onSelect: (day: string | null) => void;
  locale: string;
  ft: (key: FeatureKey) => string;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: "short" }),
  );
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const countByDay = new Map<string, number>();
  for (const task of tasks) countByDay.set(task.dueDate, (countByDay.get(task.dueDate) ?? 0) + 1);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" aria-label={ft("care.previousMonth")} onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <h2 className="text-base font-semibold text-ink-900" aria-live="polite">
            {first.toLocaleDateString(locale, { month: "long", year: "numeric" })}
          </h2>
          <Button type="button" variant="ghost" size="icon" aria-label={ft("care.nextMonth")} onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </Button>
        </div>
        <div role="grid" aria-label={first.toLocaleDateString(locale, { month: "long", year: "numeric" })} className="grid grid-cols-7 gap-1 text-center">
          {weekdays.map((name) => (
            <div key={name} role="columnheader" className="py-1 text-xs font-semibold uppercase text-muted">{name}</div>
          ))}
          {cells.map((day, index) => {
            if (day === null) return <div key={`empty-${index}`} role="gridcell" aria-hidden="true" />;
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const count = countByDay.get(key) ?? 0;
            const selected = selectedDay === key;
            return (
              <div key={key} role="gridcell">
                <button
                  type="button"
                  onClick={() => onSelect(selected ? null : key)}
                  aria-pressed={selected}
                  aria-label={`${key}${count ? `, ${count}` : ""}`}
                  className={cn(
                    "flex min-h-[var(--a11y-tap)] w-full flex-col items-center justify-center rounded-xl border text-sm",
                    selected ? "border-brand-600 bg-brand-50 font-semibold" : "border-transparent hover:bg-ink-50",
                    key === today && "ring-2 ring-brand-500",
                  )}
                >
                  <span>{day}</span>
                  {count > 0 && <span className="mt-0.5 size-1.5 rounded-full bg-brand-600" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskDialog({
  target, prefillDate, onClose, ft,
}: {
  target: CareTaskView | "new" | null;
  prefillDate: string;
  onClose: () => void;
  ft: (key: FeatureKey) => string;
}) {
  const open = target !== null;
  const existing = target && target !== "new" ? target : null;
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!target) return;
    setErrors({});
    setForm(
      target === "new"
        ? { ...EMPTY_FORM, dueDate: prefillDate }
        : {
            title: target.title,
            category: target.category,
            source: target.source,
            clinicianName: target.clinicianName,
            dueDate: target.dueDate,
            dueTime: target.dueTime,
            recurrence: target.recurrence,
            reminderDaysBefore: target.reminderDaysBefore ? String(target.reminderDaysBefore) : "",
            notes: target.notes,
          },
    );
  }, [target, prefillDate]);

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: string) => setForm((c) => ({ ...c, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = { ...form, reminderDaysBefore: form.reminderDaysBefore === "" ? null : Number(form.reminderDaysBefore) };
    const result = existing ? await updateCareTaskAction(existing.id, payload) : await createCareTaskAction(payload);
    setBusy(false);
    if (result.ok) {
      toast.success(ft("care.saved"));
      onClose();
    } else {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      toast.error(result.error === "INVALID_INPUT" ? ft("care.titleRequired") : ft("care.genericError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? ft("care.edit") : ft("care.add")}</DialogTitle>
          <DialogDescription>{ft("care.neverAuto")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink-800">{ft("care.source")}</legend>
            <div className="flex flex-wrap gap-2">
              {(["USER", "CLINICIAN"] as const).map((value) => (
                <label key={value} className={cn("flex min-h-[var(--a11y-tap)] cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm", form.source === value ? "border-brand-600 bg-brand-50" : "border-ink-200")}>
                  <input type="radio" name="source" value={value} checked={form.source === value} onChange={() => set("source", value)} className="size-4 accent-brand-600" />
                  {value === "USER" ? ft("care.sourceOptionUser") : ft("care.sourceOptionClinician")}
                </label>
              ))}
            </div>
            {form.source === "CLINICIAN" && (
              <div className="space-y-1.5">
                <Label htmlFor="care-clinician">{ft("care.clinicianName")}</Label>
                <Input id="care-clinician" value={form.clinicianName} onChange={(e) => set("clinicianName", e.target.value)} />
                <p className="text-xs text-muted">{ft("care.sourceClinician")}</p>
              </div>
            )}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="care-title">{ft("care.title_label")}</Label>
            <Input id="care-title" value={form.title} onChange={(e) => set("title", e.target.value)} aria-invalid={errors.title ? true : undefined} />
            {errors.title ? <p role="alert" className="text-sm text-alert-700">{errors.title}</p> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="care-category">{ft("care.category")}</Label>
              <select id="care-category" className={selectClass} value={form.category} onChange={(e) => set("category", e.target.value)}>
                <option value="GENERAL">{ft("care.catGeneral")}</option>
                <option value="SCREENING">{ft("care.catScreening")}</option>
                <option value="VACCINATION">{ft("care.catVaccination")}</option>
                <option value="CHECKUP">{ft("care.catCheckup")}</option>
                <option value="FOLLOW_UP">{ft("care.catFollowUp")}</option>
                <option value="OTHER">{ft("care.catOther")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="care-recurrence">{ft("care.recurrence")}</Label>
              <select id="care-recurrence" className={selectClass} value={form.recurrence} onChange={(e) => set("recurrence", e.target.value)} aria-describedby="care-rec-help">
                <option value="NONE">{ft("care.recNone")}</option>
                <option value="MONTHLY">{ft("care.recMonthly")}</option>
                <option value="EVERY_3_MONTHS">{ft("care.rec3m")}</option>
                <option value="EVERY_6_MONTHS">{ft("care.rec6m")}</option>
                <option value="YEARLY">{ft("care.recYearly")}</option>
              </select>
              <p id="care-rec-help" className="text-xs text-muted">{ft("care.recHelp")}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="care-date">{ft("care.dueDate")}</Label>
              <Input id="care-date" type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} aria-invalid={errors.dueDate ? true : undefined} />
              {errors.dueDate ? <p role="alert" className="text-sm text-alert-700">{errors.dueDate}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="care-time">{ft("care.dueTime")}</Label>
              <Input id="care-time" type="time" value={form.dueTime} onChange={(e) => set("dueTime", e.target.value)} />
              {errors.dueTime ? <p role="alert" className="text-sm text-alert-700">{errors.dueTime}</p> : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="care-reminder">{ft("care.reminder")}</Label>
            <select id="care-reminder" className={selectClass} value={form.reminderDaysBefore} onChange={(e) => set("reminderDaysBefore", e.target.value)} aria-describedby="care-rem-note">
              <option value="">{ft("care.remNone")}</option>
              <option value="1">{ft("care.rem1")}</option>
              <option value="3">{ft("care.rem3")}</option>
              <option value="7">{ft("care.rem7")}</option>
            </select>
            <p id="care-rem-note" className="text-xs text-muted">{ft("care.remNote")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="care-notes">{ft("care.notes")}</Label>
            <Textarea id="care-notes" rows={2} maxLength={500} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">{ft("care.keepTask")}</Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>{ft("care.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
