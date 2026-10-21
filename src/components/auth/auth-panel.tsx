"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/components/providers/i18n-provider";
import { DemoSignInButton } from "./demo-sign-in-button";
import { signInAction, type SignInState } from "@/lib/actions/auth";
import { ABDM_DEMO_NOTICE, formatAbhaNumber } from "@/lib/fhir/abha";
import { DEMO_ABHA_NUMBER, DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_NAME } from "@/lib/demo/account";

const initialState: SignInState = { ok: false };

/**
 * Sign-in / profile setup.
 *
 * Demo authentication only: a name and e-mail (plus an optional ABHA-shaped
 * number for the UI) create a local account. There is no password, no OTP and
 * no ABDM call — and the panel says exactly that, in the same place a production
 * build would show "Verified with ABHA".
 */
export function AuthPanel({ demoFocus = false }: { demoFocus?: boolean }) {
  const { t } = useI18n();
  const [state, formAction, isPending] = React.useActionState(signInAction, initialState);

  return (
    <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-10">
      {/* Demo account */}
      <Card className="order-2 border-brand-200 lg:order-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand-600" aria-hidden="true" />
            {t("auth.demoTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-base leading-relaxed text-ink-700">{t("auth.demoBody")}</p>

          <dl className="grid gap-1 rounded-2xl border border-ink-200 bg-ink-50 p-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">{t("auth.demoCredentials")}</dt>
              <dd className="font-medium text-ink-900">{DEMO_ACCOUNT_NAME}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">{t("auth.email")}</dt>
              <dd className="font-medium text-ink-900">{DEMO_ACCOUNT_EMAIL}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">{t("auth.abhaNumber")}</dt>
              <dd className="font-medium text-ink-900">{formatAbhaNumber(DEMO_ABHA_NUMBER)}</dd>
            </div>
          </dl>

          <DemoSignInButton className="w-full" autoFocus={demoFocus} />
          <p className="text-sm text-muted">{t("auth.demoPatientHint")}</p>
          <p className="text-sm text-muted">{t("auth.demoNoKeys")}</p>

          <Alert variant="watch">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-watch-700" aria-hidden="true" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{t("auth.demoOnly")}</p>
              <p>{t("auth.demoOnlyBody")}</p>
              <p className="font-medium text-ink-700">
                {t("auth.abhaReady")} — {t("auth.abhaReadyBody")}
              </p>
            </div>
          </Alert>
        </CardContent>
      </Card>

      {/* Local profile */}
      <Card className="order-1 lg:order-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-ink-600" aria-hidden="true" />
            {t("auth.formTitle")}
          </CardTitle>
          <p className="text-sm text-muted">{t("auth.subtitle")}</p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="auth-name">{t("auth.name")} *</Label>
              <Input
                id="auth-name"
                name="name"
                autoComplete="name"
                required
                placeholder={t("auth.namePlaceholder")}
                aria-invalid={Boolean(state.fieldErrors?.name)}
              />
              {state.fieldErrors?.name && <p className="text-sm text-alert-600">{state.fieldErrors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-email">{t("auth.email")} *</Label>
              <Input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder={t("auth.emailPlaceholder")}
                aria-invalid={Boolean(state.fieldErrors?.email)}
              />
              {state.fieldErrors?.email && <p className="text-sm text-alert-600">{state.fieldErrors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-abha">{t("auth.abhaNumber")}</Label>
              <Input
                id="auth-abha"
                name="abhaNumber"
                inputMode="numeric"
                maxLength={14}
                placeholder={t("auth.abhaPlaceholder")}
                aria-describedby="auth-abha-hint"
                aria-invalid={Boolean(state.fieldErrors?.abhaNumber)}
              />
              <p id="auth-abha-hint" className="text-sm text-muted">
                {t("auth.abhaHint")}
              </p>
              {state.fieldErrors?.abhaNumber && (
                <p className="text-sm text-alert-600">{state.fieldErrors.abhaNumber}</p>
              )}
            </div>

            {state.error && state.error !== "VALIDATION" && (
              <Alert variant="alert">
                <p className="text-sm">{t("error.generic")}</p>
              </Alert>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={isPending}>
              {isPending ? t("auth.signingIn") : t("auth.continue")}
            </Button>

            <p className="text-sm text-muted">{t("auth.privacyNote")}</p>
            <p className="text-sm text-muted">{t("auth.terms")}</p>
          </form>

          <Separator className="my-5" />

          <div className="space-y-3 text-sm text-muted">
            <p>
              <strong className="font-medium text-ink-700">{t("auth.abhaReady")}:</strong> {ABDM_DEMO_NOTICE}
            </p>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">{t("auth.backHome")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
