"use client";

import * as React from "react";
import { useI18n } from "@/components/providers/i18n-provider";
import { featureText, type FeatureKey } from "@/lib/i18n/features";
import { cn } from "@/lib/utils";

export type MascotState = "idle" | "thinking" | "listening" | "speaking" | "error";

const STATE_KEY: Record<MascotState, FeatureKey> = {
  idle: "mascot.idle",
  thinking: "mascot.thinking",
  listening: "mascot.listening",
  speaking: "mascot.speaking",
  error: "mascot.error",
};

/**
 * "Pari" — a small, friendly SVG character for the assistant. It is decorative
 * (the visible status text below it carries the meaning), it uses only CSS and
 * inline SVG (no images, no libraries), and every animation is wrapped in
 * `motion-safe:` so people who prefer reduced motion see the still pose.
 */
export function AssistantMascot({ state = "idle", compact = false }: { state?: MascotState; compact?: boolean }) {
  const { lang } = useI18n();
  const label = featureText(lang, STATE_KEY[state]);
  const size = compact ? "size-11" : "size-16";

  return (
    <div className="flex items-center gap-3" data-mascot-state={state}>
      <svg
        viewBox="0 0 64 64"
        className={cn("shrink-0 overflow-visible", size)}
        role="img"
        aria-hidden="true"
        focusable="false"
        data-state={state}
      >
        {/* listening ring */}
        {state === "listening" && (
          <circle cx="32" cy="34" r="30" fill="none" stroke="var(--color-brand-500)" strokeWidth="2" className="origin-center motion-safe:animate-pulse-ring" />
        )}
        {/* antenna leaf */}
        <path d="M32 9 C36 3, 44 4, 44 4 C44 10, 38 14, 32 12 Z" fill="var(--color-brand-500)" />
        <line x1="32" y1="12" x2="32" y2="17" stroke="var(--color-ink-500)" strokeWidth="2" strokeLinecap="round" />
        {/* body */}
        <rect x="11" y="16" width="42" height="40" rx="14" fill="var(--color-brand-600)" />
        <rect x="11" y="16" width="42" height="40" rx="14" fill="none" stroke="var(--color-brand-800)" strokeOpacity="0.25" strokeWidth="1.5" />
        {/* visor */}
        <rect x="17" y="24" width="30" height="20" rx="9" fill="var(--color-surface)" />
        {/* eyes — blink when idle */}
        <g className="origin-center motion-safe:animate-blink" style={{ transformBox: "fill-box" }}>
          <circle cx="25" cy="34" r="3.2" fill="var(--color-brand-700)" />
          <circle cx="39" cy="34" r="3.2" fill="var(--color-brand-700)" />
        </g>
        {/* mouth — animated while speaking */}
        {state === "speaking" ? (
          <rect x="27" y="39" width="10" height="3" rx="1.5" fill="var(--color-brand-700)" className="origin-center motion-safe:animate-talk" style={{ transformBox: "fill-box" }} />
        ) : state === "error" ? (
          <path d="M26 42 Q32 37 38 42" fill="none" stroke="var(--color-brand-700)" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <path d="M26 40 Q32 45 38 40" fill="none" stroke="var(--color-brand-700)" strokeWidth="2" strokeLinecap="round" />
        )}
        {/* thinking dots */}
        {state === "thinking" && (
          <g fill="var(--color-brand-100)">
            <circle cx="20" cy="50" r="2" className="motion-safe:animate-bounce" />
            <circle cx="32" cy="50" r="2" className="motion-safe:animate-bounce [animation-delay:150ms]" />
            <circle cx="44" cy="50" r="2" className="motion-safe:animate-bounce [animation-delay:300ms]" />
          </g>
        )}
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-800">{featureText(lang, "mascot.label")}</p>
        <p className="text-sm text-muted" aria-live="polite" data-testid="mascot-status">{label}</p>
      </div>
    </div>
  );
}
