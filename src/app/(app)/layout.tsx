import { ActiveProfileProvider } from "@/components/providers/profile-provider";
import { AppShell } from "@/components/layout/app-shell";
import { getEmergencyNumber } from "@/lib/safety/emergency-number";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile, listProfiles } from "@/lib/auth/guards";
import type { ProfileKind } from "@/types/domain";

/**
 * Authenticated shell.
 *
 * Profiles are loaded on the server for the signed-in user only, and the active
 * profile is resolved from the session — never from a client-provided id.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [profiles, activeProfile] = await Promise.all([listProfiles(user.id), getActiveProfile(user.id)]);

  const summaries = profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    relationship: profile.relationship,
    kind: profile.kind,
    avatarEmoji: profile.avatarEmoji,
    isPrimary: profile.isPrimary,
  }));

  return (
    <ActiveProfileProvider
      profiles={summaries}
      activeProfile={{
        id: activeProfile.id,
        name: activeProfile.name,
        relationship: activeProfile.relationship,
        kind: activeProfile.kind,
        avatarEmoji: activeProfile.avatarEmoji,
        isPrimary: activeProfile.isPrimary,
      }}
    >
      <AppShell
        userName={user.name}
        emergencyNumber={getEmergencyNumber()}
        profileKind={activeProfile.kind as ProfileKind}
      >
        {children}
      </AppShell>
    </ActiveProfileProvider>
  );
}
