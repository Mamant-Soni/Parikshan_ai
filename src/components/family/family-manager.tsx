"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/components/providers/i18n-provider";
import { useActiveProfile } from "@/components/providers/profile-provider";
import { createProfileAction, deleteProfileAction } from "@/lib/actions/profiles";
import { formatDate } from "@/lib/i18n/format";
import type { ProfileOverview } from "@/lib/database/queries";
import { RELATIONSHIPS, type Relationship } from "@/types/domain";
import { cn } from "@/lib/utils";

const RELATIONSHIP_KEYS: Record<Relationship, Parameters<ReturnType<typeof useI18n>["t"]>[0]> = {
  SELF: "family.relSelf",
  CHILD: "family.relChild",
  PARENT: "family.relParent",
  SPOUSE: "family.relSpouse",
  SIBLING: "family.relSibling",
  CAREGIVEE: "family.relCaregiver",
  OTHER: "family.relOther",
};

const KIND_KEYS = {
  ADULT: "family.kindAdult",
  CHILD: "family.kindChild",
  ELDER: "family.kindElder",
} as const;

/** Family profiles: one person per card, each with their own private records. */
export function FamilyManager({ profiles }: { profiles: ProfileOverview[] }) {
  const { t, lang } = useI18n();
  const { activeProfile, switchProfile, isSwitching } = useActiveProfile();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [isPending, startTransition] = React.useTransition();

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setErrors({});
    startTransition(async () => {
      const result = await createProfileAction({ ok: false }, formData);
      if (result.ok) {
        toast.success(t("family.added"));
        setOpen(false);
        router.refresh();
        return;
      }
      setErrors(result.fieldErrors ?? {});
      toast.error(t("error.saveFailed"));
    });
  };

  const handleDelete = (profile: ProfileOverview) => {
    if (!window.confirm(t("family.removeConfirm"))) return;
    startTransition(async () => {
      const result = await deleteProfileAction(profile.id);
      if (!result.ok) toast.error(t("error.deleteFailed"));
      else {
        toast.success(t("common.saved"));
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-5">
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {profiles.map((profile) => {
          const isActive = profile.id === activeProfile.id;
          return (
            <li key={profile.id}>
              <Card className={cn("h-full", isActive && "border-brand-300 ring-2 ring-brand-100")}>
                <CardContent className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-3xl">
                      {profile.avatarEmoji}
                    </span>
                    {isActive ? (
                      <Badge variant="brand">{t("family.activeProfile")}</Badge>
                    ) : (
                      <Badge variant="neutral">{t(KIND_KEYS[(profile.kind as keyof typeof KIND_KEYS) ?? "ADULT"])}</Badge>
                    )}
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-ink-900">{profile.name}</h2>
                    <p className="text-sm text-muted">
                      {t(RELATIONSHIP_KEYS[(profile.relationship as Relationship) ?? "OTHER"])}
                      {profile.dateOfBirth ? ` · ${formatDate(profile.dateOfBirth, lang)}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="info">{t("family.recordsCount", { count: profile.recordCount })}</Badge>
                    <Badge variant="good">{t("family.medsCount", { count: profile.medicationCount })}</Badge>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant={isActive ? "secondary" : "primary"}
                      disabled={isActive || isSwitching}
                      onClick={() => {
                        switchProfile(profile.id);
                        toast.success(t("family.switched", { name: profile.name }));
                      }}
                      aria-label={t("family.switchTo", { name: profile.name })}
                    >
                      <UserRound aria-hidden="true" />
                      {isActive ? t("family.activeProfile") : t("family.switchTo", { name: profile.name })}
                    </Button>
                    {!profile.isPrimary && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(profile)}
                        aria-label={`${t("family.removeMember")} — ${profile.name}`}
                        className="text-alert-600 hover:bg-alert-50"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}

        <li>
          <Card className="flex h-full items-center justify-center border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="lg">
                    <Plus aria-hidden="true" />
                    {t("family.addMember")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("family.addMemberTitle")}</DialogTitle>
                    <DialogDescription>{t("family.demoProfiles")}</DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="family-name">{t("family.name")} *</Label>
                      <Input id="family-name" name="name" required />
                      {errors.name && <p className="text-sm text-alert-600">{errors.name}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="family-relationship">{t("family.relationship")} *</Label>
                      <Select name="relationship" defaultValue="CHILD">
                        <SelectTrigger id="family-relationship">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONSHIPS.filter((relationship) => relationship !== "SELF").map((relationship) => (
                            <SelectItem key={relationship} value={relationship}>
                              {t(RELATIONSHIP_KEYS[relationship])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="family-dob">{t("family.dateOfBirth")}</Label>
                        <Input id="family-dob" name="dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="family-kind">{t("family.profileKind")}</Label>
                        <Select name="kind" defaultValue="CHILD">
                          <SelectTrigger id="family-kind">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADULT">{t("family.kindAdult")}</SelectItem>
                            <SelectItem value="CHILD">{t("family.kindChild")}</SelectItem>
                            <SelectItem value="ELDER">{t("family.kindElder")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <DialogFooter>
                      <Button type="submit" disabled={isPending} size="lg">
                        {isPending ? t("common.saving") : t("common.save")}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                        {t("common.cancel")}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
              <p className="max-w-xs text-sm text-muted">{t("family.subtitle")}</p>
            </CardContent>
          </Card>
        </li>
      </ul>
    </div>
  );
}
