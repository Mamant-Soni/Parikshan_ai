"use client";

import * as React from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/providers/i18n-provider";
import { demoSignInAction } from "@/lib/actions/auth";

/**
 * "Try Interactive Demo" / "Continue with Demo Account".
 *
 * Signs into the seeded demo patient (creating it if the database is fresh) and
 * lands on the dashboard. No external service is contacted.
 */
export function DemoSignInButton({
  size = "lg",
  variant = "primary",
  className,
  autoFocus = false,
}: {
  size?: "default" | "lg";
  variant?: "primary" | "secondary";
  className?: string;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [isPending, startTransition] = React.useTransition();

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      autoFocus={autoFocus}
      disabled={isPending}
      onClick={() => startTransition(() => void demoSignInAction())}
    >
      {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PlayCircle aria-hidden="true" />}
      {isPending ? t("auth.signingIn") : t("auth.continueWithDemo")}
    </Button>
  );
}
