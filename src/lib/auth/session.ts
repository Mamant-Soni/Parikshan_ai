import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/database/client";

/**
 * Session handling.
 *
 * The cookie only ever carries a random opaque token. The database stores a
 * SHA-256 hash of that token, so a leaked database dump cannot be replayed as a
 * valid session — the same reason password hashes are used for secrets.
 *
 * NOTE FOR PRODUCTION: a demo cookie session is intentionally simple. A real
 * deployment must add verified identity (ABHA login / OTP), short-lived tokens
 * with rotation, CSRF protection, rate limiting and audit logging.
 */

export const SESSION_COOKIE = "phc_session";
const SESSION_TTL_DAYS = 30;

function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "dev-only-secret";
  return createHash("sha256").update(`${token}:${secret}`).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  abhaNumber: string | null;
  abhaLinked: boolean;
  isDemo: boolean;
  activeProfileId: string | null;
  createdAt: Date;
  preferences: {
    language: string;
    easyRead: boolean;
    largeText: boolean;
    highContrast: boolean;
    readAloud: boolean;
    autoReadAloud: boolean;
    notifyMeds: boolean;
    notifyRecords: boolean;
  } | null;
};

/** Returns the signed-in user, or null when there is no valid session. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { preferences: true } } },
  });
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    abhaNumber: user.abhaNumber,
    abhaLinked: user.abhaLinked,
    isDemo: user.isDemo,
    activeProfileId: user.activeProfileId,
    createdAt: user.createdAt,
    preferences: user.preferences
      ? {
          language: user.preferences.language,
          easyRead: user.preferences.easyRead,
          largeText: user.preferences.largeText,
          highContrast: user.preferences.highContrast,
          readAloud: user.preferences.readAloud,
          autoReadAloud: user.preferences.autoReadAloud,
          notifyMeds: user.preferences.notifyMeds,
          notifyRecords: user.preferences.notifyRecords,
        }
      : null,
  };
}

/** Server-component helper: redirects to the sign-in page when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => undefined);
  }
  jar.delete(SESSION_COOKIE);
}
