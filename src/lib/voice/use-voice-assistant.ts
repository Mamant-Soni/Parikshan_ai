"use client";

import * as React from "react";
import type { Language } from "@/types/domain";
import type { VoicePublicConfig } from "./config";
import {
  classifySpeechError,
  isVoiceErrorCode,
  voiceErrorTranslationKey,
  type VoiceErrorCode,
} from "./errors";
import { browserLanguageTag, buildSpokenText, pickBrowserVoice } from "./spoken";
import { sanitizeTranscript } from "./transcript";

/**
 * Browser orchestration for the voice assistant.
 *
 * Explicit activation only: nothing asks for the microphone until the user
 * presses "Start listening" inside an open voice panel. The hook handles
 * permission denial, unsupported browsers, empty recordings, timeouts, network
 * failures, backgrounding, muting, interruption and replay.
 *
 * Audio is never persisted by the app. Server transcription uploads the clip to
 * the authenticated route, which forwards it to the configured provider in
 * memory and discards it.
 */

export type VoiceStatus =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "processing"
  | "speaking"
  | "error"
  | "permission-denied"
  | "unsupported";

export type VoiceAnswer = {
  answer: string;
  spokenText?: string;
  messageId?: string;
  emergency?: boolean;
  requiresConfirmation?: boolean;
};

export type UseVoiceAssistantOptions = {
  config: VoicePublicConfig;
  language: Language;
  ask: (question: string) => Promise<VoiceAnswer | null>;
  /** Respect the user's Read Aloud preference. Muting always wins. */
  autoSpeak: boolean;
};

type SpeechRecognitionAlternative = { transcript: string; confidence: number };
type SpeechRecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
};
type SpeechRecognitionErrorLike = { error?: string; message?: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const MIN_AUDIO_BYTES = 512;
const TRANSCRIBE_TIMEOUT_MS = 30_000;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function chooseRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return options.find((type) => MediaRecorder.isTypeSupported?.(type));
}

export function useVoiceAssistant({ config, language, ask, autoSpeak }: UseVoiceAssistantOptions) {
  const [status, setStatus] = React.useState<VoiceStatus>("idle");
  const [interim, setInterim] = React.useState("");
  const [transcript, setTranscript] = React.useState("");
  const [errorCode, setErrorCode] = React.useState<VoiceErrorCode | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [muted, setMutedState] = React.useState(false);
  const [lastAnswer, setLastAnswer] = React.useState<VoiceAnswer | null>(null);
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([]);
  const [isSupported, setIsSupported] = React.useState(true);
  /** Invalidates an in-flight server TTS request when the user stops speech. */
  const speakGenerationRef = React.useRef(0);

  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const finalTranscriptRef = React.useRef("");
  const interimTranscriptRef = React.useRef("");
  const abortRef = React.useRef<AbortController | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = React.useRef<string | null>(null);
  const cancelledRef = React.useRef(false);
  const askRef = React.useRef(ask);
  const configRef = React.useRef(config);
  const languageRef = React.useRef(language);
  const autoSpeakRef = React.useRef(autoSpeak);
  const mutedRef = React.useRef(muted);

  askRef.current = ask;
  configRef.current = config;
  languageRef.current = language;
  autoSpeakRef.current = autoSpeak;
  mutedRef.current = muted;

  React.useEffect(() => {
    try {
      setMutedState(window.localStorage.getItem("phc.voice.muted") === "1");
    } catch {
      // private mode — default unmuted
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const read = () => setVoices(window.speechSynthesis.getVoices());
    read();
    window.speechSynthesis.addEventListener("voiceschanged", read);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", read);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const hasRecognition = Boolean(getRecognitionCtor());
    const hasRecorder = Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
    const supported =
      config.sttProvider === "browser"
        ? hasRecognition
        : config.sttProvider === "openai"
          ? config.serverSttAvailable && hasRecorder
          : false;
    setIsSupported(supported);
  }, [config.sttProvider, config.serverSttAvailable]);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopTracks = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const stopSpeaking = React.useCallback(() => {
    speakGenerationRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setStatus((current) => (current === "speaking" ? "idle" : current));
  }, []);

  const fail = React.useCallback((code: VoiceErrorCode, next: VoiceStatus = "error") => {
    setErrorCode(code);
    setStatus(next);
    setInterim("");
    setTranscript("");
  }, []);

  const speakWithBrowser = React.useCallback(
    (text: string): boolean => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
      const spoken = buildSpokenText(text, configRef.current.maxSpeakChars);
      if (!spoken) return false;

      const utterance = new SpeechSynthesisUtterance(spoken);
      const tag = browserLanguageTag(languageRef.current);
      const available = window.speechSynthesis.getVoices();
      const voice = pickBrowserVoice(available, languageRef.current);
      if (available.length > 0 && !voice) {
        setNotice("BROWSER_VOICE_UNAVAILABLE");
        return false;
      }
      if (voice) utterance.voice = voice;
      utterance.lang = tag;
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.onend = () => setStatus((current) => (current === "speaking" ? "idle" : current));
      utterance.onerror = (event) => {
        if (event.error === "canceled" || event.error === "interrupted") return;
        setStatusCodeSafe("PROVIDER_ERROR", setErrorCode, setStatus);
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [],
  );

  const speak = React.useCallback(
    async (answer: VoiceAnswer) => {
      const generation = ++speakGenerationRef.current;
      if (mutedRef.current) {
        setNotice("MUTED");
        setStatus("idle");
        return;
      }
      const text = answer.spokenText || answer.answer;
      setStatus("speaking");
      setNotice(null);

      if (configRef.current.ttsProvider === "openai" && configRef.current.serverTtsAvailable && answer.messageId) {
        try {
          abortRef.current?.abort();
          const controller = new AbortController();
          abortRef.current = controller;
          const timeout = setTimeout(() => controller.abort(), 45_000);
          const response = await fetch("/api/voice/speak", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              messageId: answer.messageId,
              language: languageRef.current,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok) throw new Error(`speak-${response.status}`);
          const blob = await response.blob();
          if (!blob.size) throw new Error("empty-audio");
          // The user may have pressed Stop or started a new answer while the
          // audio was still downloading. Never play it in that case.
          if (generation !== speakGenerationRef.current) return;
          const url = URL.createObjectURL(blob);
          audioUrlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            if (generation !== speakGenerationRef.current) return;
            setStatus((current) => (current === "speaking" ? "idle" : current));
            if (audioUrlRef.current === url) {
              URL.revokeObjectURL(url);
              audioUrlRef.current = null;
            }
          };
          audio.onerror = () => {
            setNotice("SERVER_TTS_FALLBACK");
            const spoke = speakWithBrowser(text);
            if (!spoke) {
              setErrorCode("TTS_UNAVAILABLE");
              setStatus("error");
            }
          };
          if (generation !== speakGenerationRef.current) return;
          await audio.play();
          return;
        } catch (error) {
          if (generation !== speakGenerationRef.current) return;
          if ((error as { name?: string }).name === "AbortError") {
            setStatus("idle");
            return;
          }
          // Graceful degradation: the answer remains on screen, and the
          // browser voice is tried before declaring speech unavailable.
          setNotice("SERVER_TTS_FALLBACK");
          if (speakWithBrowser(text)) return;
          setErrorCode("TTS_UNAVAILABLE");
          setStatus("error");
          return;
        }
      }

      if (speakWithBrowser(text)) return;
      setErrorCode("TTS_UNAVAILABLE");
      setStatus("error");
    },
    [speakWithBrowser],
  );

  const handleTranscript = React.useCallback(
    async (raw: string) => {
      if (cancelledRef.current) return;
      const sanitized = sanitizeTranscript(raw, { maxChars: configRef.current.maxQuestionChars });
      if (!sanitized.ok) {
        const keep = sanitized.text ?? "";
        fail(
          sanitized.code === "TRANSCRIPT_TOO_LONG"
            ? "TRANSCRIPT_TOO_LONG"
            : sanitized.code === "TRANSCRIPT_EMPTY"
              ? "NO_SPEECH"
              : "TRANSCRIPT_REJECTED",
        );
        setTranscript(keep);
        return;
      }

      setTranscript(sanitized.text);
      setInterim("");
      setStatus("processing");
      setErrorCode(null);
      setNotice(sanitized.suspicion ? "INJECTION_NOTICE" : null);

      try {
        const result = await askRef.current(sanitized.text);
        if (!result) {
          // The chat already shows the failure; mirror it here so voice mode
          // never looks like it silently ignored the question.
          setErrorCode("GENERIC");
          setStatus("error");
          return;
        }
        setLastAnswer(result);
        if (autoSpeakRef.current) {
          await speak(result);
        } else {
          setStatus("idle");
        }
      } catch {
        setErrorCode("GENERIC");
        setStatus("error");
      }
    },
    [fail, speak],
  );

  const transcribeBlob = React.useCallback(
    async (blob: Blob) => {
      setStatus("processing");
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
      try {
        const form = new FormData();
        form.append("audio", blob, `recording.${blob.type.includes("mp4") ? "m4a" : "webm"}`);
        form.append("language", languageRef.current);
        const response = await fetch("/api/voice/transcribe", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          transcript?: string;
          error?: string;
        };
        if (!response.ok || !payload.ok) {
          // Keep the server's specific code (empty clip, oversize, rate limit,
          // expired session, provider outage) instead of collapsing every
          // failure into "provider error".
          const raw = payload.error;
          const code: VoiceErrorCode = isVoiceErrorCode(raw) ? raw : "PROVIDER_ERROR";
          fail(code === "EMPTY_TRANSCRIPT" ? "NO_SPEECH" : code);
          return;
        }
        if (cancelledRef.current) return;
        if (typeof payload.transcript !== "string") {
          fail("TRANSCRIPT_REJECTED");
          return;
        }
        await handleTranscript(payload.transcript);
      } catch (error) {
        clearTimeout(timeout);
        if ((error as { name?: string }).name === "AbortError") fail("TIMEOUT");
        else fail("NETWORK_ERROR");
      }
    },
    [fail, handleTranscript],
  );

  const startListening = React.useCallback(async () => {
    if (status === "listening" || status === "processing" || status === "requesting-permission") return;
    stopSpeaking();
    setErrorCode(null);
    setNotice(null);
    setTranscript("");
    setInterim("");
    cancelledRef.current = false;
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";

    if (!isSupported) {
      setErrorCode("UNSUPPORTED_BROWSER");
      setStatus("unsupported");
      return;
    }

    if (configRef.current.sttProvider === "browser") {
      const Recognition = getRecognitionCtor();
      if (!Recognition) {
        setErrorCode("UNSUPPORTED_BROWSER");
        setStatus("unsupported");
        return;
      }
      setStatus("requesting-permission");
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = browserLanguageTag(languageRef.current);
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let sawResult = false;
      let failed = false;

      recognition.onstart = () => {
        if (cancelledRef.current) return;
        setStatus("listening");
      };
      recognition.onresult = (event) => {
        let interimText = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const alternative = result?.[0];
          if (!alternative) continue;
          if (result.isFinal) {
            finalTranscriptRef.current = `${finalTranscriptRef.current} ${alternative.transcript}`.trim();
            sawResult = true;
          } else {
            interimText = `${interimText} ${alternative.transcript}`.trim();
          }
        }
        interimTranscriptRef.current = interimText;
        setInterim(interimText);
      };
      recognition.onerror = (event) => {
        failed = true;
        const code = classifySpeechError(event.error);
        if (code === "CANCELLED") {
          setStatus("idle");
          return;
        }
        if (code === "PERMISSION_DENIED") {
          fail("PERMISSION_DENIED", "permission-denied");
          return;
        }
        fail(code);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        if (cancelledRef.current) {
          setStatus("idle");
          return;
        }
        if (failed) return;
        const best = finalTranscriptRef.current || interimTranscriptRef.current;
        if (!best && !sawResult) {
          fail("NO_SPEECH");
          return;
        }
        void handleTranscript(best);
      };

      try {
        recognition.start();
      } catch {
        fail("PROVIDER_ERROR");
      }
      return;
    }

    // Server transcription path: explicitly request the microphone here only.
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.getUserMedia) {
      setErrorCode("UNSUPPORTED_BROWSER");
      setStatus("unsupported");
      return;
    }
    setStatus("requesting-permission");
    const stream = await mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .catch((error) => {
        const code = classifySpeechError(error);
        fail(
          code === "PERMISSION_DENIED" ? "PERMISSION_DENIED" : code,
          code === "PERMISSION_DENIED" ? "permission-denied" : "error",
        );
        return null;
      });
    if (!stream) return;
    streamRef.current = stream;
    chunksRef.current = [];

    const mimeType = chooseRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stopTracks();
      fail("PROVIDER_ERROR");
      return;
    }
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onerror = () => {
      stopTracks();
      fail("PROVIDER_ERROR");
    };
    recorder.onstop = () => {
      clearTimer();
      stopTracks();
      if (cancelledRef.current) {
        setStatus("idle");
        return;
      }
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (blob.size < MIN_AUDIO_BYTES) {
        fail("NO_SPEECH");
        return;
      }
      void transcribeBlob(blob);
    };

    setStatus("listening");
    recorder.start(250);
    timerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, configRef.current.maxRecordingSeconds * 1000);
  }, [
    clearTimer,
    fail,
    handleTranscript,
    isSupported,
    status,
    stopSpeaking,
    stopTracks,
    transcribeBlob,
  ]);

  const stopListening = React.useCallback(() => {
    if (status === "listening") {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    }
  }, [status]);

  const cancelListening = React.useCallback(() => {
    cancelledRef.current = true;
    clearTimer();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    stopTracks();
    setInterim("");
    setStatus("idle");
  }, [clearTimer, stopTracks]);

  const interrupt = React.useCallback(() => {
    stopSpeaking();
    void startListening();
  }, [startListening, stopSpeaking]);

  const replay = React.useCallback(() => {
    if (!lastAnswer) return;
    void speak(lastAnswer);
  }, [lastAnswer, speak]);

  const setMuted = React.useCallback(
    (next: boolean) => {
      setMutedState(next);
      try {
        window.localStorage.setItem("phc.voice.muted", next ? "1" : "0");
      } catch {
        // private mode — the preference applies for this session only
      }
      if (next) {
        stopSpeaking();
        setNotice("MUTED");
      } else {
        setNotice(null);
      }
    },
    [stopSpeaking],
  );

  const reset = React.useCallback(() => {
    cancelListening();
    stopSpeaking();
    setTranscript("");
    setInterim("");
    setErrorCode(null);
    setNotice(null);
    setStatus("idle");
  }, [cancelListening, stopSpeaking]);

  // Backgrounding: discard an in-progress recording and stop audio so medical
  // information is not spoken from a hidden tab.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (status === "listening" || status === "requesting-permission" || status === "processing") {
        cancelledRef.current = true;
        clearTimer();
        recognitionRef.current?.abort();
        recognitionRef.current = null;
        if (recorderRef.current?.state === "recording") recorderRef.current.stop();
        stopTracks();
        setInterim("");
        setStatus("idle");
        setNotice("BACKGROUNDED");
      }
      if (status === "speaking") {
        stopSpeaking();
        setStatus("idle");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [clearTimer, status, stopSpeaking, stopTracks]);

  React.useEffect(() => {
    return () => {
      cancelledRef.current = true;
      speakGenerationRef.current += 1;
      clearTimer();
      recognitionRef.current?.abort();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopTracks();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    interim,
    transcript,
    errorCode,
    errorKey: errorCode ? voiceErrorTranslationKey(errorCode) : null,
    notice,
    muted,
    setMuted,
    isSupported,
    lastAnswer,
    voices,
    startListening,
    stopListening,
    cancelListening,
    interrupt,
    replay,
    stopSpeaking,
    speak,
    reset,
    hasSpeechOutput:
      config.ttsProvider === "openai" && config.serverTtsAvailable
        ? true
        : typeof window !== "undefined" && "speechSynthesis" in window,
  };
}

/** Avoids a setState-in-callback typing issue for speech synthesis errors. */
function setStatusCodeSafe(
  code: VoiceErrorCode,
  setErrorCode: (value: VoiceErrorCode | null) => void,
  setStatus: (value: VoiceStatus) => void,
) {
  setErrorCode(code);
  setStatus("error");
}
