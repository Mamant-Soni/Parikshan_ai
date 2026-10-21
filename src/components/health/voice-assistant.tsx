"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Keyboard,
  Loader2,
  Mic,
  RotateCcw,
  ShieldCheck,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { useI18n } from "@/components/providers/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";
import type { VoicePublicConfig } from "@/lib/voice/config";
import {
  useVoiceAssistant,
  type VoiceAnswer,
  type VoiceStatus,
} from "@/lib/voice/use-voice-assistant";
import { cn } from "@/lib/utils";

/**
 * Voice panel for the assistant.
 *
 * The microphone is only requested after the user presses "Start listening"
 * inside this panel. Every state has visible text (not colour alone) and a live
 * region, and every failure offers the typed-question fallback.
 */

const STATUS_KEY: Record<VoiceStatus, TranslationKey> = {
  idle: "voice.ready",
  "requesting-permission": "voice.requestingPermission",
  listening: "voice.listening",
  processing: "voice.processing",
  speaking: "voice.speaking",
  error: "voice.genericError",
  "permission-denied": "voice.permissionDeniedTitle",
  unsupported: "voice.unsupportedTitle",
};

const NOTICE_KEY: Record<string, TranslationKey> = {
  BACKGROUNDED: "voice.backgrounded",
  MUTED: "voice.mutedNotice",
  BROWSER_VOICE_UNAVAILABLE: "voice.voiceUnavailable",
  SERVER_TTS_FALLBACK: "voice.serverFallback",
  INJECTION_NOTICE: "voice.injectionNotice",
};

export function VoiceAssistant({
  config,
  onAsk,
  onSwitchToText,
  autoSpeak,
  onStatusChange,
}: {
  config: VoicePublicConfig;
  onAsk: (question: string) => Promise<VoiceAnswer | null>;
  onSwitchToText: () => void;
  autoSpeak: boolean;
  onStatusChange?: (status: VoiceStatus) => void;
}) {
  const { t, lang } = useI18n();
  const voice = useVoiceAssistant({
    config,
    language: lang,
    ask: onAsk,
    autoSpeak,
  });

  const {
    status,
    interim,
    transcript,
    errorKey,
    notice,
    muted,
    setMuted,
    isSupported,
    lastAnswer,
    startListening,
    stopListening,
    interrupt,
    replay,
    stopSpeaking,
    reset,
  } = voice;

  const providerLabel =
    config.sttProvider === "openai"
      ? t("voice.provider.server")
      : config.sttProvider === "browser"
        ? t("voice.provider.browser")
        : t("voice.provider.none");

  const statusLabel =
    status === "error"
      ? t(errorKey ?? "voice.genericError")
      : t(STATUS_KEY[status]);

  const busy = status === "requesting-permission" || status === "processing";

  React.useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  const primary = () => {
    switch (status) {
      case "listening":
        stopListening();
        return;
      case "speaking":
        interrupt();
        return;
      case "requesting-permission":
      case "processing":
        return;
      default:
        void startListening();
    }
  };

  const primaryLabel =
    status === "listening"
      ? t("voice.stopAndAsk")
      : status === "speaking"
        ? t("voice.interrupt")
        : status === "error" || status === "permission-denied"
          ? t("voice.retry")
          : t("voice.start");

  const switchToText = () => {
    reset();
    onSwitchToText();
  };

  return (
    <section
      id="voice-assistant-panel"
      aria-label={t("voice.title")}
      className="border-t border-brand-100 bg-brand-50/50 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                status === "listening"
                  ? "animate-pulse bg-alert-100 text-alert-700"
                  : status === "speaking"
                    ? "bg-brand-100 text-brand-700"
                    : "bg-surface text-brand-700 ring-1 ring-brand-200",
              )}
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}
            </span>
            <h2 className="text-base font-semibold text-ink-900">{t("voice.title")}</h2>
            <Badge variant="brand">{providerLabel}</Badge>
          </div>
          <p
            className="mt-2 flex items-center gap-2 text-sm font-medium text-ink-700"
            role="status"
            aria-live="polite"
            aria-label={t("voice.statusAria")}
          >
            {status === "listening" && (
              <span aria-hidden="true" className="size-2.5 rounded-full bg-alert-600 motion-safe:animate-pulse" />
            )}
            {statusLabel}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t("voice.languageNote", {
              language: lang === "hi" ? t("voice.hindi") : t("voice.english"),
            })}{" "}
            {t("voice.listeningMax", { seconds: config.maxRecordingSeconds })}
          </p>
        </div>

        <Button type="button" variant="ghost" size="sm" onClick={switchToText}>
          <Keyboard aria-hidden="true" />
          {t("voice.switchToText")}
        </Button>
      </div>

      {/* Transcript */}
      <div className="mt-3 rounded-2xl border border-ink-200 bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          {status === "listening" ? t("voice.interim") : t("voice.transcript")}
        </p>
        {transcript ? (
          <p className="mt-1 text-base leading-relaxed text-ink-800" dir="auto">
            <span className="sr-only">{t("voice.youSaid")}: </span>
            {transcript}
          </p>
        ) : status === "listening" && interim ? (
          <p className="mt-1 text-base italic leading-relaxed text-ink-700" dir="auto" aria-live="polite">
            {interim}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">
            {status === "listening" ? t("voice.listeningHint") : t("voice.emptyTranscript")}
          </p>
        )}
        {status === "listening" && interim && transcript ? (
          <p className="mt-1 text-sm italic text-ink-600" aria-live="polite">
            {interim}
          </p>
        ) : null}
      </div>

      {/* Primary + secondary controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={primary}
          disabled={!isSupported || config.sttProvider === "none" || busy}
          aria-pressed={status === "listening"}
          aria-label={primaryLabel}
          size="lg"
          className="min-w-40"
        >
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : status === "listening" ? (
            <Square aria-hidden="true" />
          ) : (
            <Mic aria-hidden="true" />
          )}
          {primaryLabel}
        </Button>

        {status === "speaking" && (
          <Button type="button" variant="secondary" onClick={stopSpeaking}>
            <VolumeX aria-hidden="true" />
            {t("voice.stopSpeaking")}
          </Button>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={replay}
          disabled={!lastAnswer || status === "speaking"}
          aria-label={t("voice.replay")}
        >
          <RotateCcw aria-hidden="true" />
          <span className="hidden sm:inline">{t("voice.replay")}</span>
        </Button>

        <Button
          type="button"
          variant={muted ? "soft" : "secondary"}
          onClick={() => setMuted(!muted)}
          aria-pressed={muted}
          aria-label={muted ? t("voice.unmute") : t("voice.mute")}
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          <span className="hidden sm:inline">{muted ? t("voice.unmute") : t("voice.mute")}</span>
        </Button>

        {(status === "error" || status === "permission-denied") && (
          <Button type="button" variant="ghost" onClick={() => void startListening()}>
            {t("voice.retry")}
          </Button>
        )}
      </div>

      {/* Failure states */}
      {status === "permission-denied" && (
        <Alert variant="watch" className="mt-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-watch-700" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("voice.permissionDeniedTitle")}</p>
            <p className="mt-1 text-sm">{t("voice.permissionDeniedBody")}</p>
            <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={switchToText}>
              {t("voice.typeInstead")}
            </Button>
          </div>
        </Alert>
      )}

      {status === "unsupported" && (
        <Alert variant="watch" className="mt-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-watch-700" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("voice.unsupportedTitle")}</p>
            <p className="mt-1 text-sm">{t("voice.unsupportedBody")}</p>
            <Button type="button" variant="secondary" size="sm" className="mt-2" onClick={switchToText}>
              {t("voice.typeInstead")}
            </Button>
          </div>
        </Alert>
      )}

      {status === "error" && (
        <Alert variant="alert" className="mt-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-alert-700" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t(errorKey ?? "voice.genericError")}</p>
            <p className="mt-1 text-sm">{t("voice.textFallback")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => void startListening()}>
                {t("voice.retry")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={switchToText}>
                {t("voice.typeInstead")}
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {notice && NOTICE_KEY[notice] && (
        <Alert variant="info" className="mt-3">
          <p className="text-sm">{t(NOTICE_KEY[notice])}</p>
        </Alert>
      )}

      {config.sttProvider === "none" && (
        <Alert variant="neutral" className="mt-3">
          <p className="text-sm">{t("voice.textOnlyMode")}</p>
        </Alert>
      )}

      {config.notes.length > 0 && status === "idle" && (
        <Alert variant="neutral" className="mt-3">
          <p className="text-sm">{t("voice.serverUnavailable")}</p>
        </Alert>
      )}

      {autoSpeak && (
        <p className="mt-3 text-xs text-muted">{t("voice.autoSpeakNote")}</p>
      )}

      {/* Privacy / retention */}
      <details className="mt-3 rounded-xl border border-ink-200 bg-surface p-3 text-sm">
        <summary className="cursor-pointer font-medium text-ink-800">
          {t("voice.privacyTitle")}
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-700">
          <li>{t("voice.audioNotStored")}</li>
          <li>{t("voice.transcriptStored")}</li>
          <li>
            {config.sttProvider === "openai"
              ? t("voice.serverSpeechNote")
              : t("voice.browserSpeechNote")}
          </li>
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t("nav.settings")}
          </Link>
          <span className="text-xs text-muted">{t("voice.retentionPolicy")}</span>
        </div>
      </details>
    </section>
  );
}
