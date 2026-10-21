"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { useI18n } from "@/components/providers/i18n-provider";
import { updateProfileAction } from "@/lib/actions/profiles";
import { cn } from "@/lib/utils";
import type { ProfileKind } from "@/types/domain";

const AVATARS = ["🙂", "🧑", "👩", "👨", "👵", "👴", "🧒", "👧", "👦", "💑"];
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const initialState = { ok: false as const };

/**
 * Profile setup — the step between signing in and the dashboard.
 *
 * Everything here is optional and editable later from Profile & Settings; the
 * point is that the app knows who the records belong to.
 */
export function ProfileSetupForm({
  profileId,
  initialName,
  initialKind,
}: {
  profileId: string;
  initialName: string;
  initialKind: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, formAction, isPending] = React.useActionState(updateProfileAction, initialState);
  const [avatar, setAvatar] = React.useState(AVATARS[0]);
  const [bloodGroup, setBloodGroup] = React.useState<string>("");

  React.useEffect(() => {
    if (state.ok) {
      toast.success(t("common.saved"));
      router.push("/dashboard");
    }
  }, [state, router, t]);

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-brand-600" aria-hidden="true" />
          {t("setup.title")}
        </CardTitle>
        <p className="text-sm text-muted">{t("setup.subtitle")}</p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="profileId" value={profileId} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink-800">{t("setup.avatar")}</legend>
            <div className="flex flex-wrap gap-2">
              {AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  aria-pressed={avatar === emoji}
                  aria-label={`${t("setup.avatar")}: ${emoji}`}
                  className={cn(
                    "flex size-[var(--a11y-tap)] items-center justify-center rounded-2xl border text-2xl transition-colors",
                    avatar === emoji ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : "border-ink-200 bg-surface hover:bg-ink-50",
                  )}
                >
                  <span aria-hidden="true">{emoji}</span>
                </button>
              ))}
            </div>
            <input type="hidden" name="avatarEmoji" value={avatar} />
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="setup-name">{t("setup.name")} *</Label>
            <Input id="setup-name" name="name" defaultValue={initialName} required autoComplete="name" />
            {state.fieldErrors?.name && <p className="text-sm text-alert-600">{state.fieldErrors.name}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="setup-dob">{t("setup.dateOfBirth")}</Label>
              <Input id="setup-dob" name="dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-kind">{t("setup.profileKind")}</Label>
              <select
                id="setup-kind"
                name="kind"
                defaultValue={initialKind}
                className="min-h-[var(--a11y-tap)] w-full rounded-xl border border-ink-200 bg-surface px-3 text-base"
              >
                <option value="ADULT">{t("family.kindAdult")}</option>
                <option value="CHILD">{t("family.kindChild")}</option>
                <option value="ELDER">{t("family.kindElder")}</option>
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink-800">{t("setup.bloodGroup")}</legend>
            <div className="flex flex-wrap gap-2">
              {BLOOD_GROUPS.map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setBloodGroup((current) => (current === group ? "" : group))}
                  aria-pressed={bloodGroup === group}
                  className={cn(
                    "min-h-[var(--a11y-tap)] rounded-xl border px-4 font-medium transition-colors",
                    bloodGroup === group ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 bg-surface text-ink-700 hover:bg-ink-50",
                  )}
                >
                  {group}
                </button>
              ))}
            </div>
            <input type="hidden" name="bloodGroup" value={bloodGroup} />
          </fieldset>

          <Alert variant="neutral">
            <p className="text-sm leading-relaxed">{t("setup.privacyNote")}</p>
          </Alert>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  {t("common.saving")}
                </>
              ) : (
                t("setup.save")
              )}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => router.push("/dashboard")}>
              {t("setup.skip")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export type { ProfileKind };
