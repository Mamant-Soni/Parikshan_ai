"use client";

import * as React from "react";

/**
 * Read Aloud via the browser SpeechSynthesis API.
 *
 * Nothing is sent to a server: the text is spoken locally, which keeps medical
 * content on the device. Language is mapped to an Indian voice when the app is
 * in Hindi so Devanagari reads correctly.
 */

export function useSpeech(language: "en" | "hi" = "en") {
  const [isSpeaking, setIsSpeaking] = React.useState(false);
  const [isSupported, setIsSupported] = React.useState(true);
  const utteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null);

  React.useEffect(() => {
    setIsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stop = React.useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = React.useCallback(
    (text: string) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setIsSupported(false);
        return false;
      }
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(stripMarkup(text));
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((voice) =>
        language === "hi" ? voice.lang?.toLowerCase().startsWith("hi") : voice.lang?.toLowerCase().startsWith("en-in"),
      );
      if (preferred) utterance.voice = preferred;
      utterance.lang = language === "hi" ? "hi-IN" : "en-IN";
      // Slightly slower than default: easier to follow for elderly listeners.
      utterance.rate = 0.95;
      utterance.pitch = 1;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      utteranceRef.current = utterance;
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
      return true;
    },
    [language],
  );

  const toggle = React.useCallback(
    (text: string) => {
      if (isSpeaking) stop();
      else speak(text);
    },
    [isSpeaking, speak, stop],
  );

  return { speak, stop, toggle, isSpeaking, isSupported };
}

/** Removes emoji and markdown noise so the voice sounds natural. */
function stripMarkup(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\*\*/g, "")
    .replace(/^[•\-*]\s*/gm, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
