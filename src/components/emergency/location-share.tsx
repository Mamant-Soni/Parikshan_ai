"use client";

import * as React from "react";
import { Copy, LocateFixed, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useFeatureText } from "@/lib/i18n/use-feature-text";
import { useI18n } from "@/components/providers/i18n-provider";
import { buildLocationMessage, roundCoordinate } from "@/lib/safety/messages";
import { toWhatsAppDigits } from "@/lib/safety/phone";
import type { ContactView } from "@/lib/safety/service";
import type { ShareItem } from "./types";
import { selectClass } from "./contacts-manager";

type Fix = { lat: number; lng: number; accuracy: number | null; takenAt: Date };
type Status = "idle" | "requesting" | "ready" | "denied" | "unsupported" | "unavailable";

/**
 * Location sharing — the user starts it, the browser asks permission, and the
 * coordinates are used only to prepare a message on this page. Nothing is sent
 * by Parikshan, nothing is stored (not even in localStorage), and no background
 * tracking happens: the fix is dropped on "Clear" or when the page is left.
 */
export function LocationShare({
  ownerName,
  contacts,
  shareItems,
}: {
  ownerName: string;
  contacts: ContactView[];
  shareItems: ShareItem[];
}) {
  const ft = useFeatureText();
  const { lang } = useI18n();
  const [status, setStatus] = React.useState<Status>("idle");
  const [fix, setFix] = React.useState<Fix | null>(null);
  const [includeMedical, setIncludeMedical] = React.useState(false);
  const [reviewed, setReviewed] = React.useState(false);
  const [recipientId, setRecipientId] = React.useState<string>(contacts.find((c) => c.consentLocation)?.id ?? "");

  const recipient = contacts.find((c) => c.id === recipientId) ?? null;
  const recipientAllowed = Boolean(recipient?.consentLocation);

  const start = () => {
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return;
    }
    setStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFix({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
          takenAt: new Date(position.timestamp),
        });
        setReviewed(false);
        setStatus("ready");
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 0 },
    );
  };

  const clear = () => {
    setFix(null);
    setReviewed(false);
    setStatus("idle");
  };

  const timeText = fix
    ? fix.takenAt.toLocaleString(lang === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "";

  const message = fix
    ? buildLocationMessage({
        name: ownerName,
        lat: fix.lat,
        lng: fix.lng,
        fixTime: timeText,
        items: includeMedical ? shareItems : [],
      })
    : "";

  const openHref = recipient && fix && recipientAllowed
    ? recipient.preferredMethod === "WHATSAPP"
      ? `https://wa.me/${toWhatsAppDigits(recipient.phoneE164)}?text=${encodeURIComponent(message)}`
      : `sms:${recipient.phoneE164}?body=${encodeURIComponent(message)}`
    : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success(ft("location.copied"));
    } catch {
      toast.error(ft("location.permissionDenied"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ft("location.title")}</CardTitle>
        <CardDescription>{ft("location.explain")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "idle" && (
          <Button type="button" onClick={start}>
            <LocateFixed className="size-4" aria-hidden="true" />
            {ft("location.start")}
          </Button>
        )}
        {status === "requesting" && <p role="status" className="text-sm text-ink-700">{ft("location.start")}…</p>}
        {status === "denied" && <Alert variant="watch"><AlertDescription>{ft("location.permissionDenied")}</AlertDescription></Alert>}
        {status === "unsupported" && <Alert variant="watch"><AlertDescription>{ft("location.unsupported")}</AlertDescription></Alert>}
        {status === "unavailable" && <Alert variant="watch"><AlertDescription>{ft("location.permissionDenied")}</AlertDescription></Alert>}

        {fix && status === "ready" && (
          <div className="space-y-4">
            <p className="text-sm text-ink-800" aria-live="polite">
              {ft("location.fixLabel", { time: timeText })}
              {fix.accuracy !== null ? ` · ${ft("location.accuracy", { m: fix.accuracy })}` : ""}
            </p>
            <p className="text-xs text-muted">{ft("location.coarse")} ({roundCoordinate(fix.lat).toFixed(3)}, {roundCoordinate(fix.lng).toFixed(3)})</p>

            <div className="space-y-2">
              <label htmlFor="loc-recipient" className="text-sm font-semibold text-ink-800">{ft("location.recipient")}</label>
              <select id="loc-recipient" className={selectClass} value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
                <option value="">{ft("location.none")}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}{contact.consentLocation ? "" : ` (${ft("contacts.consentLocation")}: no)`}
                  </option>
                ))}
              </select>
              {recipient && !recipientAllowed && <p className="text-sm text-watch-700">{ft("location.noContactConsent")}</p>}
            </div>

            <label className="flex min-h-[var(--a11y-tap)] cursor-pointer items-center gap-3 text-sm text-ink-800">
              <input type="checkbox" className="size-5 accent-brand-600" checked={includeMedical} onChange={(e) => setIncludeMedical(e.target.checked)} />
              {ft("location.includeMedical")}
            </label>

            <section aria-labelledby="loc-preview-title" className="space-y-2">
              <h3 id="loc-preview-title" className="font-semibold text-ink-900">{ft("location.previewLabel")}</h3>
              <pre className="whitespace-pre-wrap rounded-xl border border-ink-200 bg-canvas p-3 text-sm text-ink-800">{message}</pre>
            </section>

            <label className="flex min-h-[var(--a11y-tap)] cursor-pointer items-center gap-3 text-sm font-medium text-ink-900">
              <input type="checkbox" className="size-5 accent-brand-600" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
              {ft("location.confirm")}
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" disabled={!reviewed} onClick={copy}>
                <Copy className="size-4" aria-hidden="true" />
                {ft("location.copy")}
              </Button>
              {openHref ? (
                <Button asChild variant="secondary" disabled={!reviewed}>
                  <a href={reviewed ? openHref : undefined} aria-disabled={!reviewed}>
                    <MessageSquare className="size-4" aria-hidden="true" />
                    {ft("location.openMessaging")}
                  </a>
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={clear}>
                <Trash2 className="size-4" aria-hidden="true" />
                {ft("location.clear")}
              </Button>
            </div>
            <Alert variant="watch">
              <AlertDescription>{ft("location.notDelivery")}</AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
