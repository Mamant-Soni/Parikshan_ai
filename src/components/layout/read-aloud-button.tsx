"use client";

import * as React from "react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Read-aloud (browser speech synthesis).
 *
 * The button is only rendered when the browser supports SpeechSynthesis, and it
 * falls back silently if speech is unavailable rather than showing a broken
 * control. Preferences (voice on/off) are respected.
 */
export function ReadAloudButton({
  text,
  className,
  label,
}: {
  text: string;
  className?: string;
  label?: string;
  /** Accepted for API familiarity; the control is always an icon button. */
  size?: "icon" | "sm";
}) {
  const { t, lang, prefs } = useI18n();
  const [supported, setSupported] = React.useState(false);
  const [speaking, setSpeaking] = React.useState(false);

  React.useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  if (!supported || !text.trim()) return null;

  const toggle = () => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
    utterance.rate = prefs.easyRead ? 0.85 : 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={speaking}
      aria-label={speaking ? t("common.stopReading") : label ?? t("common.readAloud")}
      title={speaking ? t("common.stopReading") : t("common.readAloud")}
      className={cn("shrink-0", className)}
    >
      {speaking ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
    </Button>
  );
}
