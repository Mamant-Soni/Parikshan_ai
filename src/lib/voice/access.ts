/**
 * Authorization primitives for voice requests.
 *
 * The application already scopes every read to the signed-in user's profile.
 * These helpers make the ownership decision explicit and unit-testable so a
 * voice request can never widen the scope by supplying an id from the client.
 */

export type AccessFailureReason = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "NO_PROFILE";

export type AccessResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: AccessFailureReason };

export function authorizeOwnedProfile<T extends { id: string; userId: string }>(
  userId: string | null | undefined,
  requestedProfileId: string,
  ownedProfiles: readonly T[],
): AccessResult<T> {
  if (!userId) return { ok: false, reason: "UNAUTHENTICATED" };
  const profile = ownedProfiles.find(
    (candidate) => candidate.id === requestedProfileId && candidate.userId === userId,
  );
  if (!profile) return { ok: false, reason: "FORBIDDEN" };
  return { ok: true, value: profile };
}

/**
 * Resolves a chat message for text-to-speech. A message from another account is
 * reported as NOT_FOUND (not FORBIDDEN) so the API does not confirm that an id
 * exists in someone else's account.
 */
export function authorizeOwnedMessage<T extends { profile: { userId: string } }>(
  userId: string | null | undefined,
  message: T | null | undefined,
): AccessResult<T> {
  if (!userId) return { ok: false, reason: "UNAUTHENTICATED" };
  if (!message) return { ok: false, reason: "NOT_FOUND" };
  if (message.profile.userId !== userId) return { ok: false, reason: "NOT_FOUND" };
  return { ok: true, value: message };
}

/** The server action always derives the profile from the session, not input. */
export function requireSessionProfile(
  userId: string | null | undefined,
  profile: { id: string } | null | undefined,
): AccessResult<{ id: string }> {
  if (!userId) return { ok: false, reason: "UNAUTHENTICATED" };
  if (!profile) return { ok: false, reason: "NO_PROFILE" };
  return { ok: true, value: profile };
}
