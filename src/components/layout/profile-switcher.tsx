"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/components/providers/i18n-provider";
import { useActiveProfile } from "@/components/providers/profile-provider";
import { cn } from "@/lib/utils";

/**
 * Which person's records am I looking at?
 *
 * Switching is a server round-trip (see profile-provider.tsx) so pages always
 * re-render against the newly selected profile — important when a caregiver
 * moves between their own records and a parent's.
 */
export function ProfileSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { profiles, activeProfile, switchProfile, isSwitching } = useActiveProfile();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          className={cn("max-w-[13rem] gap-2", compact && "max-w-[3rem] px-2")}
          aria-label={t("a11y.profileSwitcher")}
          disabled={isSwitching}
        >
          <span aria-hidden="true" className="text-lg">
            {activeProfile.avatarEmoji}
          </span>
          <span className={cn("truncate", compact && "hidden xl:inline")}>{activeProfile.name}</span>
          <ChevronDown className="size-4 text-ink-500" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t("profiles.switchTitle")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profiles.map((profile) => {
          const active = profile.id === activeProfile.id;
          return (
            <DropdownMenuItem
              key={profile.id}
              onSelect={() => {
                if (active) return;
                switchProfile(profile.id);
                toast.success(t("profiles.switched", { name: profile.name }));
              }}
              className="min-h-[var(--a11y-tap)] gap-3 text-base"
            >
              <span aria-hidden="true" className="text-xl">
                {profile.avatarEmoji}
              </span>
              <span className="flex-1">
                <span className="block font-medium">{profile.name}</span>
                <span className="block text-xs text-muted">{t(`relationship.${profile.relationship}` as "relationship.SELF")}</span>
              </span>
              {active ? <Check className="size-4 text-brand-600" aria-hidden="true" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="min-h-[var(--a11y-tap)] gap-3 text-base">
          <Link href="/family">
            <Users className="size-5 text-ink-500" aria-hidden="true" />
            <span className="flex-1">{t("nav.family")}</span>
            <Plus className="size-4 text-ink-400" aria-hidden="true" />
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
