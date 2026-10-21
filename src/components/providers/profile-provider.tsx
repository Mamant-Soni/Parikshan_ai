"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchProfileAction } from "@/lib/actions/profiles";

/**
 * Active health profile ("My Health" / child / elder).
 *
 * Switching profiles is a server round-trip so every page re-renders with the
 * right data set — client state alone would risk showing the previous person's
 * records, which is exactly the kind of privacy bug this app must avoid.
 */

export type ActiveProfileSummary = {
  id: string;
  name: string;
  relationship: string;
  kind: string;
  avatarEmoji: string;
  isPrimary: boolean;
};

type ProfileContextValue = {
  profiles: ActiveProfileSummary[];
  activeProfile: ActiveProfileSummary;
  switchProfile: (profileId: string) => void;
  isSwitching: boolean;
};

const ProfileContext = React.createContext<ProfileContextValue | null>(null);

export function ActiveProfileProvider({
  children,
  profiles,
  activeProfile,
}: {
  children: React.ReactNode;
  profiles: ActiveProfileSummary[];
  activeProfile: ActiveProfileSummary;
}) {
  const router = useRouter();
  const [isSwitching, startTransition] = useTransition();

  const switchProfile = React.useCallback(
    (profileId: string) => {
      if (profileId === activeProfile.id) return;
      startTransition(async () => {
        await switchProfileAction(profileId);
        router.refresh();
      });
    },
    [activeProfile.id, router],
  );

  const value = React.useMemo(
    () => ({ profiles, activeProfile, switchProfile, isSwitching }),
    [profiles, activeProfile, switchProfile, isSwitching],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useActiveProfile(): ProfileContextValue {
  const context = React.useContext(ProfileContext);
  if (!context) throw new Error("useActiveProfile must be used inside <ActiveProfileProvider>");
  return context;
}
