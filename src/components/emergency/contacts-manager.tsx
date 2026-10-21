"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, BadgeCheck, Pencil, Plus, ShieldQuestion, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import { useFeatureText } from "@/lib/i18n/use-feature-text";
import { useI18n } from "@/components/providers/i18n-provider";
import {
  createContactAction, updateContactAction, deleteContactAction, moveContactAction,
  requestVerificationAction, confirmVerificationAction,
} from "@/lib/actions/safety";
import type { ContactView } from "@/lib/safety/service";
import { cn } from "@/lib/utils";

const RELATIONSHIPS = ["FAMILY", "FRIEND", "DOCTOR", "NEIGHBOUR", "OTHER"] as const;
const METHODS = ["CALL", "SMS", "WHATSAPP"] as const;
const MAX = 10;

type FormState = {
  name: string;
  relationship: string;
  phone: string;
  preferredMethod: string;
  notes: string;
  consentEmergencyInfo: boolean;
  consentLocation: boolean;
};

const EMPTY_FORM: FormState = {
  name: "", relationship: "FAMILY", phone: "", preferredMethod: "CALL", notes: "", consentEmergencyInfo: false, consentLocation: false,
};

/**
 * Emergency-contact list with add / edit / reorder / remove. Verification status
 * is shown exactly as the server reports it: a valid-looking number is never
 * labelled verified. Removal asks for confirmation first.
 */
export function ContactsManager({ contacts, providerConfigured }: { contacts: ContactView[]; providerConfigured: boolean }) {
  const ft = useFeatureText();
  const { t } = useI18n();
  const [editing, setEditing] = React.useState<ContactView | "new" | null>(null);
  const [removing, setRemoving] = React.useState<ContactView | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, okMessage?: string) => {
    setBusy(true);
    try {
      const result = await action();
      if (result.ok) {
        if (okMessage) toast.success(okMessage);
      } else {
        toast.error(errorText(result.error));
      }
      return result;
    } finally {
      setBusy(false);
    }
  };

  const errorText = (code?: string) => {
    switch (code) {
      case "LIMIT_REACHED": return ft("contacts.tooMany");
      case "INVALID_PHONE": return ft("contacts.invalidPhone");
      case "PROVIDER_UNAVAILABLE": return ft("contacts.verifyUnavailable");
      case "RATE_LIMITED": return "Too many verification requests today. Try again tomorrow.";
      case "INVALID_CODE": return ft("contacts.verifyFailed");
      case "EXPIRED": return "The code has expired. Request a new one.";
      case "TOO_MANY_ATTEMPTS": return "Too many wrong codes. Request a new verification later.";
      case "NOT_FOUND": return "This contact could not be found.";
      default: return t("error.generic");
    }
  };

  const move = (contact: ContactView, direction: "up" | "down") =>
    run(() => moveContactAction(contact.id, direction), ft("contacts.reordered"));

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{ft("contacts.title")}</CardTitle>
          <CardDescription>{ft("contacts.lockedNote")}</CardDescription>
        </div>
        <Button type="button" onClick={() => setEditing("new")} disabled={contacts.length >= MAX} aria-label={ft("contacts.add")}>
          <Plus className="size-4" aria-hidden="true" />
          {ft("contacts.add")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {contacts.length === 0 ? (
          <Alert variant="watch">
            <AlertDescription>{ft("contacts.empty")}</AlertDescription>
          </Alert>
        ) : (
          <ol className="space-y-3" aria-label={ft("contacts.title")}>
            {contacts.map((contact, index) => (
              <li key={contact.id} className="rounded-2xl border border-ink-200 bg-canvas/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm text-muted">{ft("contacts.priority", { n: contact.priority })}</p>
                    <p className="text-base font-semibold text-ink-900">{contact.name}</p>
                    <p className="text-sm text-ink-700">
                      {contact.phoneDisplay} · {relationshipLabel(contact.relationship)} · {methodLabel(contact.preferredMethod)}
                    </p>
                    <VerificationBadge contact={contact} />
                    {contact.verificationStatus !== "VERIFIED" && (
                      <p className="text-xs text-muted">{ft("contacts.formatValidNotVerified")}</p>
                    )}
                    <p className="text-xs text-ink-600">
                      {contact.consentEmergencyInfo ? "✓ " : "✗ "}{ft("contacts.consentInfo")}
                      <br />
                      {contact.consentLocation ? "✓ " : "✗ "}{ft("contacts.consentLocation")}
                    </p>
                    {contact.notes ? <p className="text-sm text-ink-600">{contact.notes}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" size="icon" aria-label={`${ft("contacts.moveUp")}: ${contact.name}`} disabled={busy || index === 0} onClick={() => move(contact, "up")}>
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`${ft("contacts.moveDown")}: ${contact.name}`} disabled={busy || index === contacts.length - 1} onClick={() => move(contact, "down")}>
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(contact)}>
                      <Pencil className="size-4" aria-hidden="true" />
                      <span>{ft("contacts.edit")}</span>
                      <span className="sr-only">: {contact.name}</span>
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setRemoving(contact)} className="text-alert-700">
                      <Trash2 className="size-4" aria-hidden="true" />
                      <span>{ft("contacts.remove")}</span>
                      <span className="sr-only">: {contact.name}</span>
                    </Button>
                  </div>
                </div>
                <VerifyPanel contact={contact} providerConfigured={providerConfigured} errorText={errorText} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <ContactFormDialog
        target={editing}
        onClose={() => setEditing(null)}
        errorText={errorText}
      />

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ft("contacts.removeTitle")}</DialogTitle>
            <DialogDescription>{ft("contacts.removeBody", { name: removing?.name ?? "" })}</DialogDescription>
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
                if (!removing) return;
                const result = await run(() => deleteContactAction(removing.id), ft("contacts.removed"));
                if (result.ok) setRemoving(null);
              }}
            >
              {ft("contacts.removeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );

  function relationshipLabel(value: string) {
    return value.charAt(0) + value.slice(1).toLowerCase().replace("_", " ");
  }
  function methodLabel(value: string) {
    return value === "WHATSAPP" ? ft("contacts.methodWhatsapp") : value === "SMS" ? ft("contacts.methodSms") : ft("contacts.methodCall");
  }
}

function VerificationBadge({ contact }: { contact: ContactView }) {
  const ft = useFeatureText();
  if (contact.verificationStatus === "VERIFIED") {
    return (
      <Badge variant="good" className="gap-1">
        <BadgeCheck className="size-3.5" aria-hidden="true" />
        {ft("contacts.statusVerified")}
        {contact.verifiedAt ? <span className="sr-only"> — {new Date(contact.verifiedAt).toLocaleDateString()}</span> : null}
      </Badge>
    );
  }
  if (contact.verificationStatus === "PENDING") {
    return <Badge variant="watch">{ft("contacts.statusPending")}</Badge>;
  }
  return (
    <Badge variant="neutral" className="gap-1">
      <ShieldQuestion className="size-3.5" aria-hidden="true" />
      {ft("contacts.statusUnverified")}
    </Badge>
  );
}

function VerifyPanel({
  contact,
  providerConfigured,
  errorText,
}: {
  contact: ContactView;
  providerConfigured: boolean;
  errorText: (code?: string) => string;
}) {
  const ft = useFeatureText();
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [requested, setRequested] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const noteId = `verify-note-${contact.id}`;

  if (contact.verificationStatus === "VERIFIED") return null;

  const request = async () => {
    setBusy(true);
    const result = await requestVerificationAction(contact.id);
    setBusy(false);
    if (result.ok) {
      setRequested(true);
      toast.success(ft("contacts.verifySent"));
    } else {
      toast.error(errorText(result.error));
    }
  };

  const confirm = async () => {
    setCodeError(null);
    setBusy(true);
    const result = await confirmVerificationAction(contact.id, code);
    setBusy(false);
    if (result.ok) {
      toast.success(ft("contacts.verifyDone"));
      setRequested(false);
      setCode("");
    } else if (result.fieldErrors?.code) {
      setCodeError(result.fieldErrors.code);
    } else {
      setCodeError(errorText(result.error));
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-ink-200 pt-3">
      {!providerConfigured && <p id={noteId} className="text-sm text-watch-700">{ft("contacts.verifyUnavailable")}</p>}
      {providerConfigured && !requested && (
        <Button type="button" variant="secondary" size="sm" onClick={request} disabled={busy} aria-describedby={noteId}>
          {ft("contacts.verifyStart")}
        </Button>
      )}
      {providerConfigured && requested && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <div className="min-w-[10rem] flex-1 space-y-1">
            <Label htmlFor={`code-${contact.id}`}>{ft("contacts.verifyCodeLabel")}</Label>
            <Input
              id={`code-${contact.id}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={`code-hint-${contact.id}`}
            />
            <p id={`code-hint-${contact.id}`} className="text-xs text-muted">{ft("contacts.verifyCodeHint")}</p>
            {codeError ? <p role="alert" className="text-sm text-alert-700">{codeError}</p> : null}
          </div>
          <Button type="submit" disabled={busy || code.trim().length !== 6}>{ft("contacts.verifySubmit")}</Button>
        </form>
      )}
    </div>
  );
}

function ContactFormDialog({
  target,
  onClose,
  errorText,
}: {
  target: ContactView | "new" | null;
  onClose: () => void;
  errorText: (code?: string) => string;
}) {
  const ft = useFeatureText();
  const open = target !== null;
  const existing = target && target !== "new" ? target : null;
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!target) return;
    setErrors({});
    setForm(
      target === "new"
        ? EMPTY_FORM
        : {
            name: target.name,
            relationship: target.relationship,
            phone: target.phoneDisplay,
            preferredMethod: target.preferredMethod,
            notes: target.notes,
            consentEmergencyInfo: target.consentEmergencyInfo,
            consentLocation: target.consentLocation,
          },
    );
  }, [target]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = { ...form };
    const result = existing ? await updateContactAction(existing.id, payload) : await createContactAction(payload);
    setBusy(false);
    if (result.ok) {
      toast.success(ft("contacts.saved"));
      onClose();
    } else {
      if (result.fieldErrors) setErrors(result.fieldErrors);
      toast.error(errorText(result.error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? ft("contacts.edit") : ft("contacts.add")}</DialogTitle>
          <DialogDescription>{ft("contacts.lockedNote")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field id="contact-name" label={ft("contacts.name")} error={errors.name}>
            <Input id="contact-name" value={form.name} autoComplete="off" onChange={(e) => set("name", e.target.value)} aria-invalid={errors.name ? true : undefined} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="contact-rel" label={ft("contacts.relationship")}>
              <select id="contact-rel" className={selectClass} value={form.relationship} onChange={(e) => set("relationship", e.target.value)}>
                {RELATIONSHIPS.map((value) => <option key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</option>)}
              </select>
            </Field>
            <Field id="contact-method" label={ft("contacts.method")}>
              <select id="contact-method" className={selectClass} value={form.preferredMethod} onChange={(e) => set("preferredMethod", e.target.value)}>
                {METHODS.map((value) => (
                  <option key={value} value={value}>
                    {value === "WHATSAPP" ? ft("contacts.methodWhatsapp") : value === "SMS" ? ft("contacts.methodSms") : ft("contacts.methodCall")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="contact-phone" label={ft("contacts.phone")} hint={ft("contacts.phoneHint")} error={errors.phone}>
            <Input id="contact-phone" type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={errors.phone ? true : undefined} />
          </Field>
          <Field id="contact-notes" label={ft("contacts.notes")} error={errors.notes}>
            <Input id="contact-notes" value={form.notes} maxLength={300} onChange={(e) => set("notes", e.target.value)} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink-800">{ft("contacts.consentInfo")}</legend>
            <CheckRow id="consent-info" checked={form.consentEmergencyInfo} onChange={(v) => set("consentEmergencyInfo", v)} label={ft("contacts.consentInfo")} />
            <CheckRow id="consent-loc" checked={form.consentLocation} onChange={(v) => set("consentLocation", v)} label={ft("contacts.consentLocation")} />
          </fieldset>
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">{ft("emergency.callCancel")}</Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>{ft("contacts.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const selectClass =
  "min-h-[var(--a11y-tap)] w-full rounded-xl border border-ink-300 bg-surface px-3 text-base text-ink-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p> : null}
      {error ? <p role="alert" className={cn("text-sm text-alert-700")}>{error}</p> : null}
    </div>
  );
}

function CheckRow({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label htmlFor={id} className="flex min-h-[var(--a11y-tap)] cursor-pointer items-start gap-3 rounded-xl px-1 py-1 text-base text-ink-800">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-600" />
      <span>{label}</span>
    </label>
  );
}
