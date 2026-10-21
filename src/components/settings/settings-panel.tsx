"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/components/providers/i18n-provider";
import { LANGUAGES } from "@/lib/i18n";
import { signOutAction, deleteAccountAction } from "@/lib/actions/auth";
import { formatLongDate } from "@/lib/i18n/format";
import type { VoicePublicConfig } from "@/lib/voice/config";
import { maskAbhaNumber, formatAbhaNumber, type AbhaLinkStatus } from "@/lib/fhir/abha";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Profile & Settings.
 *
 * Language, accessibility, notifications and privacy controls. The privacy
 * section is real functionality (data export + full deletion), not decoration.
 */
const ABHA_STATUS_KEY: Record<AbhaLinkStatus, "abha.status.NOT_LINKED" | "abha.status.DEMO_LINKED" | "abha.status.VERIFIED"> = {
  NOT_LINKED: "abha.status.NOT_LINKED",
  DEMO_LINKED: "abha.status.DEMO_LINKED",
  VERIFIED: "abha.status.VERIFIED",
};

export function SettingsPanel({
  user,
  storage,
  activeProfileName,
  abhaStatus,
  voice,
}: {
  user: {
    name: string;
    email: string;
    abhaNumber: string | null;
    isDemo: boolean;
    createdAt: string;
  };
  storage: { records: number; bytes: number };
  activeProfileName: string;
  voice: VoicePublicConfig;
  /** Derived on the server from ABDM_MODE — never asserted by the client. */
  abhaStatus: AbhaLinkStatus;
}) {
  const { t, prefs, setPreference, setLanguage, lang, easyRead } = useI18n();
  const router = useRouter();
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isDeleting, startDelete] = React.useTransition();

  const handleDelete = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteAccountAction({ ok: false }, formData);
      if (result?.ok === false) {
        setDeleteError(result.error === "CONFIRM_REQUIRED" ? t("settings.deleteConfirmLabel") : t("error.deleteFailed"));
      }
    });
  };

  const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes > 1024 * 1024 ? 1 : 2)} MB`;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Language */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sectionLanguage")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((entry) => (
              <Button
                key={entry.value}
                type="button"
                variant={lang === entry.value ? "primary" : "secondary"}
                onClick={() => {
                  setLanguage(entry.value);
                  toast.success(t("settings.languageSaved", { lang: t(entry.labelKey) }));
                }}
                aria-pressed={lang === entry.value}
              >
                {t(entry.labelKey)}
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted">{t("lang.switchTo")} — {t("landing.a11yLanguagesBody")}</p>
        </CardContent>
      </Card>

      {/* Accessibility */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sectionAccessibility")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow
            id="easy-read"
            label={t("settings.easyRead")}
            description={t("settings.easyReadBody")}
            checked={prefs.easyRead}
            onChange={(value) => setPreference("easyRead", value)}
          />
          <SettingRow
            id="large-text"
            label={t("settings.largeText")}
            description={t("settings.largeTextBody")}
            checked={prefs.largeText}
            onChange={(value) => setPreference("largeText", value)}
          />
          <SettingRow
            id="high-contrast"
            label={t("settings.highContrast")}
            description={t("settings.highContrastBody")}
            checked={prefs.highContrast}
            onChange={(value) => setPreference("highContrast", value)}
          />
          <SettingRow
            id="read-aloud"
            label={t("settings.readAloud")}
            description={t("settings.readAloudBody")}
            checked={prefs.readAloud}
            onChange={(value) => setPreference("readAloud", value)}
          />
          <SettingRow
            id="auto-read"
            label={t("settings.autoReadAloud")}
            description={t("settings.autoReadAloudBody")}
            checked={prefs.autoReadAloud}
            onChange={(value) => setPreference("autoReadAloud", value)}
            disabled={!prefs.readAloud}
          />
        </CardContent>
      </Card>

      {/* Voice assistant */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sectionVoice")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-ink-700">{t("settings.voiceBody")}</p>
          <dl className="space-y-2">
            <AccountRow
              label={t("settings.voiceStt")}
              value={
                voice.sttProvider === "openai"
                  ? t("voice.provider.server")
                  : voice.sttProvider === "browser"
                    ? t("voice.provider.browser")
                    : t("voice.provider.none")
              }
            />
            <AccountRow
              label={t("settings.voiceTts")}
              value={
                voice.ttsProvider === "openai"
                  ? t("voice.provider.server")
                  : voice.ttsProvider === "browser"
                    ? t("voice.provider.browser")
                    : t("voice.provider.none")
              }
            />
            <AccountRow
              label={t("settings.voiceLanguage")}
              value={`${t("voice.english")} + ${t("voice.hindi")}`}
            />
            <AccountRow
              label={t("settings.voiceRetention")}
              value={t("settings.voiceRetentionValue")}
            />
          </dl>
          <p className="text-xs text-muted">{t("settings.voiceKeysNote")}</p>
          <p className="text-xs text-muted">
            {voice.serverSttAvailable || voice.serverTtsAvailable
              ? t("settings.voiceServerNote")
              : t("settings.voiceBrowserNote")}
          </p>
          {voice.notes.length > 0 && (
            <Badge variant="watch">{t("voice.providerUnavailable")}</Badge>
          )}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sectionNotifications")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SettingRow
            id="notify-meds"
            label={t("settings.notifyMeds")}
            description={t("settings.notifyMedsBody")}
            checked={prefs.notifyMeds}
            onChange={(value) => setPreference("notifyMeds", value)}
          />
          <SettingRow
            id="notify-records"
            label={t("settings.notifyRecords")}
            description={t("settings.notifyRecordsBody")}
            checked={prefs.notifyRecords}
            onChange={(value) => setPreference("notifyRecords", value)}
          />
          <p className="text-xs text-muted">{t("reminder.localOnly")}</p>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.sectionSecurity")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="space-y-2">
            <AccountRow label={t("family.name")} value={user.name} />
            <AccountRow label={t("settings.email")} value={user.email} />
            <AccountRow
              label={t("settings.abhaNumber")}
              value={user.abhaNumber ? formatAbhaNumber(user.abhaNumber) : t("settings.abhaNone")}
              hint={user.abhaNumber ? maskAbhaNumber(user.abhaNumber) : undefined}
            />
            <AccountRow label={t("settings.activeProfile")} value={activeProfileName} />
            <AccountRow
              label={t("settings.abhaLinkTitle")}
              value={t(ABHA_STATUS_KEY[abhaStatus])}
              hint={abhaStatus === "DEMO_LINKED" ? t("abha.statusNote") : undefined}
            />
            <AccountRow label={t("settings.memberSince")} value={formatLongDate(user.createdAt, lang)} />
          </dl>

          <Separator />

          <Alert variant="brand">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">{t("settings.abhaLinkTitle")}</p>
              <p className="text-sm text-muted">{t("settings.abhaLinkBody")}</p>
              <p className="text-sm font-medium text-alert-700">{t("auth.demoOnly")} — {t("auth.demoOnlyBody")}</p>
            </div>
          </Alert>

          {user.isDemo && <Badge variant="watch">{t("settings.demoMode")}</Badge>}
        </CardContent>
      </Card>

      {/* Privacy */}
      <Card className={cn("lg:col-span-2")}>
        <CardHeader>
          <CardTitle>{t("settings.sectionPrivacy")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-base font-medium text-ink-800">{t("settings.privacyHeadline")}</p>
          <p className="text-sm text-muted">
            {t("settings.storageBody", { records: storage.records, size: formatMb(storage.bytes) })}
          </p>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <a href="/api/export" download>
                <Download aria-hidden="true" />
                {t("settings.downloadData")}
              </a>
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="danger">
                  <Trash2 aria-hidden="true" />
                  {t("settings.deleteData")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("settings.deleteConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("settings.deleteConfirmBody")}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleDelete} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="delete-confirm">{t("settings.deleteConfirmLabel")}</Label>
                    <Input id="delete-confirm" name="confirm" placeholder="DELETE" autoComplete="off" required />
                    {deleteError && <p className="text-sm text-alert-600">{deleteError}</p>}
                  </div>
                  <DialogFooter>
                    <Button type="submit" variant="danger" disabled={isDeleting} size="lg">
                      {isDeleting ? t("common.saving") : t("settings.deleteData")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <form
              action={async () => {
                await signOutAction();
              }}
            >
              <Button type="submit" variant="outline">
                <LogOut aria-hidden="true" />
                {t("settings.logout")}
              </Button>
            </form>
          </div>

          <Alert variant="neutral">
            <p className="text-sm">{t("settings.productionNote")}</p>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-base font-medium text-ink-900">
          {label}
        </Label>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

function AccountRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink-900">
        {value}
        {hint && <span className="ml-2 text-xs font-normal text-ink-500">{hint}</span>}
      </dd>
    </div>
  );
}
