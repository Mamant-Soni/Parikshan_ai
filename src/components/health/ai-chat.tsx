"use client";

import * as React from "react";
import type { VoiceStatus } from "@/lib/voice/use-voice-assistant";
import { AssistantMascot, type MascotState } from "@/components/assistant/assistant-mascot";
import { featureText } from "@/lib/i18n/features";
import Link from "next/link";
import {
  AlertTriangle,
  Loader2,
  MessageCircleQuestion,
  Mic,
  Phone,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/components/providers/i18n-provider";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { VoiceAssistant } from "@/components/health/voice-assistant";
import { askAssistantAction, clearChatAction } from "@/lib/actions/assistant";
import { formatDate } from "@/lib/i18n/format";
import type { AnswerConfidence, ChatSource } from "@/types/domain";
import type { VoicePublicConfig } from "@/lib/voice/config";
import { cn } from "@/lib/utils";

const SUGGESTION_KEYS = ["assistant.q1", "assistant.q2", "assistant.q3", "assistant.q4", "assistant.q5", "assistant.q6", "assistant.q7", "assistant.q8"] as const;

export type ChatLimitation = { code: string; message: string };

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  grounded: boolean;
  intent?: string | null;
  confidence?: AnswerConfidence;
  limitations?: ChatLimitation[];
  emergency?: boolean;
  requiresConfirmation?: boolean;
  error?: boolean;
  inputMode?: "text" | "voice";
};

/** Returned to the voice panel so it can speak the answer that was just shown. */
export type AssistantReply = {
  answer: string;
  spokenText?: string;
  messageId?: string;
  emergency?: boolean;
  requiresConfirmation?: boolean;
};

/**
 * Conversational assistant.
 *
 * Grounding rules visible in the UI:
 *  • Answers always list the records they came from, with test name, value and
 *    unit where applicable.
 *  • A "not in your records" answer looks deliberately different from a real one.
 *  • Low-confidence extraction, ambiguity and provider fallback are explicit.
 *  • Emergency answers and refused destructive actions have their own treatment.
 *  • The "Ask a doctor" note is always present, and the assistant never gives
 *    instructions about medication changes.
 */
export function AIChat({
  initialMessages,
  providerName,
  isMock,
  recordCount,
  voiceConfig,
}: {
  initialMessages: ChatMessageView[];
  providerName: string;
  isMock: boolean;
  recordCount: number;
  voiceConfig: VoicePublicConfig;
}) {
  const { t, lang, easyRead, prefs } = useI18n();
  const [messages, setMessages] = React.useState<ChatMessageView[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const [voiceKey, setVoiceKey] = React.useState(0);
  const [voiceStatus, setVoiceStatus] = React.useState<VoiceStatus>("idle");
  const handleVoiceStatus = React.useCallback((status: VoiceStatus) => setVoiceStatus(status), []);
  const listRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, isSending]);

  const send = async (
    question: string,
    inputMode: "text" | "voice" = "text",
  ): Promise<AssistantReply | null> => {
    const trimmed = question.trim();
    if (trimmed.length < 2) return null;
    setInput("");
    setIsSending(true);

    const optimistic: ChatMessageView = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      sources: [],
      grounded: true,
      inputMode,
    };
    setMessages((current) => [...current, optimistic]);

    let result: Awaited<ReturnType<typeof askAssistantAction>>;
    try {
      result = await askAssistantAction({ question: trimmed, inputMode });
    } catch {
      result = { ok: false, error: "NETWORK_ERROR" };
    }
    setIsSending(false);

    if (!result.ok) {
      const key =
        result.error === "QUESTION_TOO_SHORT"
          ? "assistant.messageTooShort"
          : result.error === "QUESTION_TOO_LONG" || result.error === "TRANSCRIPT_TOO_LONG"
            ? "voice.tooLong"
            : result.error === "RATE_LIMITED"
              ? "voice.rateLimited"
              : result.error === "PROVIDER_ERROR" || result.error === "NETWORK_ERROR"
                ? "voice.providerError"
                : "error.aiFailed";
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: t(key),
          sources: [],
          grounded: false,
          error: true,
        },
      ]);
      return null;
    }

    const assistant: ChatMessageView = {
      id: result.messageId ?? `assistant-${Date.now()}`,
      role: "assistant",
      content: result.answer,
      sources: result.sources,
      grounded: result.grounded,
      intent: result.intent,
      confidence: result.confidence,
      limitations: result.limitations,
      emergency: result.emergency,
      requiresConfirmation: result.requiresConfirmation,
    };
    setMessages((current) => [...current, assistant]);
    return {
      answer: result.answer,
      spokenText: result.spokenText,
      messageId: result.messageId,
      emergency: result.emergency,
      requiresConfirmation: result.requiresConfirmation,
    };
  };

  const clearChat = async () => {
    await clearChatAction();
    setMessages([]);
    setVoiceKey((key) => key + 1);
  };

  const switchToText = () => {
    setVoiceOpen(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const lastMessage = messages[messages.length - 1];
  const mascotState: MascotState =
    voiceStatus === "listening" || voiceStatus === "requesting-permission"
      ? "listening"
      : voiceStatus === "speaking"
        ? "speaking"
        : isSending || voiceStatus === "processing"
          ? "thinking"
          : voiceStatus === "error" || voiceStatus === "permission-denied" || lastMessage?.error === true
            ? "error"
            : "idle";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="flex min-h-[32rem] flex-col overflow-hidden">
        <div className="border-b border-ink-200 px-4 py-3 sm:px-5">
          <AssistantMascot state={mascotState} compact />
        </div>
        <div
          ref={listRef}
          className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin sm:p-5"
          role="log"
          aria-live="polite"
          aria-label={t("assistant.title")}
        >
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <MessageCircleQuestion className="size-7" />
              </span>
              <h2 className="text-lg font-semibold text-ink-900">{t("assistant.emptyTitle")}</h2>
              <p className="max-w-md text-sm text-muted">{t("assistant.emptyBody")}</p>
              {recordCount === 0 && (
                <Button asChild variant="secondary" className="mt-2">
                  <Link href="/upload">{t("nav.upload")}</Link>
                </Button>
              )}
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isSending && (
            <div className="flex items-center gap-2 text-brand-700" role="status" aria-live="polite">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span className="text-sm font-medium">{t("assistant.thinking")}</span>
            </div>
          )}
        </div>

        {voiceOpen && (
          <VoiceAssistant
            key={voiceKey}
            config={voiceConfig}
            onAsk={(question) => send(question, "voice")}
            onSwitchToText={switchToText}
            // Answers are never read aloud automatically; playback starts only from the user’s button.
            autoSpeak={false}
            onStatusChange={handleVoiceStatus}
          />
        )}

        <div className="border-t border-ink-200 bg-surface p-3 sm:p-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2"
          >
            <Button
              type="button"
              variant={voiceOpen ? "soft" : "secondary"}
              size="icon"
              onClick={() => setVoiceOpen((open) => !open)}
              aria-expanded={voiceOpen}
              aria-controls="voice-assistant-panel"
              aria-label={voiceOpen ? t("voice.close") : t("voice.open")}
              title={voiceOpen ? t("voice.close") : t("voice.open")}
              className="shrink-0"
            >
              <Mic aria-hidden="true" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              rows={easyRead ? 3 : 2}
              placeholder={t("assistant.placeholder")}
              aria-label={t("assistant.placeholder")}
              className="min-h-[3rem] flex-1"
            />
            <Button type="submit" disabled={isSending || input.trim().length < 2} size="lg" aria-label={t("assistant.send")}>
              {isSending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              <span className="sr-only sm:not-sr-only">{t("assistant.send")}</span>
            </Button>
          </form>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{t("assistant.groundedNote")}</span>
            <div className="flex items-center gap-3">
              <span>
                {isMock ? t("summary.mockNotice") : providerName}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {voiceConfig.sttProvider === "browser"
                  ? t("voice.provider.browser")
                  : voiceConfig.sttProvider === "openai"
                    ? t("voice.provider.server")
                    : t("voice.provider.none")}
              </span>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="inline-flex items-center gap-1 font-medium text-ink-600 underline underline-offset-4 hover:text-ink-800"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  {t("assistant.clearChat")}
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <aside className="space-y-4">
        <Card>
          <CardContent className="space-y-2 text-sm">
            <h2 className="font-semibold text-ink-900">{featureText(lang, "mascot.provenanceTitle")}</h2>
            <p className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-ink-800">{featureText(lang, "mascot.provExtracted")}</p>
            <p className="rounded-lg bg-info-50 px-2.5 py-1.5 text-ink-800">{featureText(lang, "mascot.provAi")}</p>
            <p className="rounded-lg bg-watch-50 px-2.5 py-1.5 text-ink-800">{featureText(lang, "mascot.provClinician")}</p>
            <p className="text-xs text-muted">{featureText(lang, "mascot.notDiagnosis")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold text-ink-900">
              <Sparkles className="size-5 text-brand-600" aria-hidden="true" />
              {t("assistant.suggestedQuestions")}
            </h2>
            <ul className="space-y-2">
              {SUGGESTION_KEYS.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => void send(t(key))}
                    className="w-full rounded-xl border border-ink-200 px-3 py-2.5 text-left text-sm leading-snug text-ink-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-3 focus-visible:outline-brand-500"
                  >
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Alert variant="brand">
          <div>
            <p className="font-semibold">{t("assistant.askADoctor")}</p>
            <p className="mt-1 text-sm">{t("assistant.askADoctorBody")}</p>
          </div>
        </Alert>

        <Alert variant="neutral">
          <div>
            <p className="flex items-center gap-2 font-semibold text-ink-900">
              <Mic className="size-4 text-brand-700" aria-hidden="true" />
              {t("voice.title")}
            </p>
            <p className="mt-1 text-sm">{t("voice.subtitle")}</p>
          </div>
        </Alert>
      </aside>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessageView }) {
  const { t, lang, prefs } = useI18n();
  const isAssistant = message.role === "assistant";
  const visibleLimitations = (message.limitations ?? []).filter(
    (limitation) => limitation.code !== "NOT_IN_RECORDS",
  );
  const needsReview = message.sources.some((source) => source.needsReview);
  const emergency = message.emergency === true;
  const confirmation = message.requiresConfirmation === true;
  const error = message.error === true;

  return (
    <div className={cn("flex flex-col gap-1.5", message.role === "user" ? "items-end" : "items-start")}>
      <span className="flex items-center gap-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-400">
        {message.inputMode === "voice" && <Mic className="size-3" aria-hidden="true" />}
        {message.role === "user" ? t("assistant.you") : t("assistant.assistantName")}
      </span>

      {isAssistant && emergency ? (
        <Alert variant="alert" className="max-w-[95%] sm:max-w-[85%]">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-alert-700" aria-hidden="true" />
          <div>
            <p className="font-semibold text-alert-700">{t("voice.emergencyTitle")}</p>
            <p className="mt-1 whitespace-pre-line text-base leading-relaxed">{message.content}</p>
            <p className="mt-2 text-sm font-medium">{t("voice.emergencyDisclaimer")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="danger" size="sm">
                <a href="tel:112">
                  <Phone aria-hidden="true" />
                  {t("voice.emergencyCall")}
                </a>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <a href="tel:108">
                  <Phone aria-hidden="true" />
                  {t("voice.emergencyAmbulance")}
                </a>
              </Button>
            </div>
          </div>
        </Alert>
      ) : isAssistant && confirmation ? (
        <Alert variant="watch" className="max-w-[95%] sm:max-w-[85%]">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-watch-700" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("voice.confirmationTitle")}</p>
            <p className="mt-1 whitespace-pre-line text-base leading-relaxed">{message.content}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/records">{t("voice.openRecords")}</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/settings">{t("nav.settings")}</Link>
              </Button>
            </div>
          </div>
        </Alert>
      ) : isAssistant && error ? (
        <Alert variant="alert" className="max-w-[95%] sm:max-w-[85%]">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-alert-700" aria-hidden="true" />
          <p className="text-base leading-relaxed">{message.content}</p>
        </Alert>
      ) : (
        <div
          className={cn(
            "max-w-[95%] whitespace-pre-line rounded-2xl px-4 py-3 text-base leading-relaxed sm:max-w-[85%]",
            message.role === "user"
              ? "bg-brand-600 text-white"
              : message.grounded
                ? "border border-ink-200 bg-surface text-ink-800"
                : "border border-watch-100 bg-watch-50 text-ink-800",
          )}
        >
          {isAssistant && (
            <span className="sr-only">
              {t("assistant.assistantName")}:{" "}
            </span>
          )}
          {message.content}
        </div>
      )}

      {isAssistant && (
        <div className="flex w-full flex-col gap-2 px-1">
          <div className="flex flex-wrap items-center gap-2">
            {!message.grounded && !emergency && !confirmation && !error && (
              <Badge variant="watch">{t("assistant.notFound")}</Badge>
            )}
            {message.confidence === "medium" && !emergency && !confirmation && (
              <Badge variant="watch">{t("voice.lowConfidence")}</Badge>
            )}
            {(message.sources ?? []).map((source) => (
              <SourceCard key={source.recordId} source={source} />
            ))}
            {!emergency && !confirmation && !error && prefs.readAloud && (
              <ReadAloudButton text={message.content} size="icon" />
            )}
          </div>

          {!emergency && !confirmation && !error && (
            <p className="text-xs leading-relaxed text-ink-600" data-testid="answer-provenance">
              {featureText(lang, (message.sources ?? []).length > 0 ? "prov.withSources" : "prov.noSources")}
            </p>
          )}

          {(visibleLimitations.length > 0 || needsReview) && !emergency && !confirmation && !error && (
            <div className="rounded-xl bg-watch-50 px-3 py-2 text-xs leading-relaxed text-ink-700">
              <p className="flex items-center gap-1.5 font-semibold text-watch-700">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                {t("voice.limitationsTitle")}
              </p>
              {needsReview && !visibleLimitations.some((item) => item.code === "LOW_CONFIDENCE_EXTRACTION") && (
                <p className="mt-1">{t("voice.lowConfidenceBody")}</p>
              )}
              {visibleLimitations.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {visibleLimitations.map((limitation) => (
                    <li key={limitation.code}>{limitation.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: ChatSource }) {
  const { t, lang } = useI18n();
  return (
    <div className="rounded-xl border border-ink-200 bg-surface px-2.5 py-2">
      <Link
        href={`/records/${source.recordId}`}
        className="text-xs font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
      >
        {t("assistant.basedOn")}: {source.title} — {formatDate(source.date, lang)}
      </Link>
      {source.facts && source.facts.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {source.facts.slice(0, 4).map((fact) => (
            <li key={`${fact.testName}-${fact.value}`} className="text-xs text-ink-700">
              <span className="sr-only">{t("voice.sourceFact")}: </span>
              <span className="font-medium">{fact.testName}</span>: {fact.value}
              {fact.unit ? ` ${fact.unit}` : ""}
              {fact.referenceRange ? (
                <span className="text-muted">
                  {" "}
                  ({t("voice.referenceRange")}: {fact.referenceRange})
                </span>
              ) : null}
              {!fact.isVerified ? (
                <span className="text-muted"> · {t("voice.unverifiedNote")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {source.needsReview && (
        <p className="mt-1 text-xs font-medium text-watch-700">{t("voice.lowConfidence")}</p>
      )}
    </div>
  );
}
