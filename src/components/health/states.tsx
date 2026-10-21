"use client";

import Link from "next/link";
import { AlertCircle, FilePlus2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/components/providers/i18n-provider";
import type { TranslationKey } from "@/lib/i18n";

/** Friendly empty state — always tells the user what to do next. */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon = "file",
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: "file" | "none";
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        {icon === "file" && (
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"
          >
            <FilePlus2 className="size-7" />
          </span>
        )}
        <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
        <p className="max-w-md text-sm text-muted">{description}</p>
        {actionLabel && actionHref && (
          <Button asChild size="lg" className="mt-2">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Loading state with an accessible live region. */
export function LoadingState({
  label,
  description,
  rows = 3,
}: {
  label: string;
  description?: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <div className="flex items-center gap-3 text-brand-700">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        <p className="font-medium">{label}</p>
      </div>
      {description && <p className="text-sm text-muted">{description}</p>}
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: rows }).map((_value, index) => (
          <Card key={index}>
            <CardContent className="space-y-3">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-1/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Inline spinner for buttons / small sections. */
export function InlineLoading({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Error state. Never shows a stack trace or a raw error code — just a plain
 * explanation and two useful next steps.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  secondaryHref = "/upload",
  secondaryLabel,
  code,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  /** Technical reference for support tickets — shown small, never a stack trace. */
  code?: string;
}) {
  const { t } = useI18n();
  return (
    <Card className="border-alert-100 bg-alert-50">
      <CardContent className="flex flex-col items-start gap-3">
        <span className="flex items-center gap-2 font-semibold text-alert-700">
          <AlertCircle className="size-5" aria-hidden="true" />
          {title}
        </span>
        <p className="text-sm text-ink-700">{description}</p>
        <div className="flex flex-wrap gap-3">
          {onRetry && (
            <Button variant="secondary" onClick={onRetry}>
              <RefreshCw aria-hidden="true" />
              {retryLabel ?? t("common.tryAgain")}
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={secondaryHref}>{secondaryLabel ?? t("common.uploadAnotherFile")}</Link>
          </Button>
        </div>
        {code && <p className="text-xs text-ink-500">Reference: {code}</p>}
      </CardContent>
    </Card>
  );
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-ink-900">{title}</h2>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  emoji,
  action,
}: {
  title: string;
  description?: string;
  emoji?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-ink-900 sm:text-3xl">
          {emoji && <span aria-hidden="true">{emoji}</span>}
          {title}
        </h1>
        {description && <p className="mt-1 max-w-2xl text-base text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function useLabel(key: TranslationKey) {
  const { t } = useI18n();
  return t(key);
}
