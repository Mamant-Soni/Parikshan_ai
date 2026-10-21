import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic route protection.
 *
 * Middleware runs on the edge, where the database (and therefore session
 * validation) is not available, so this only checks that a session cookie is
 * present. Every protected layout and server action re-validates the session
 * against the database — this is a UX shortcut, never the security boundary.
 */

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/upload",
  "/records",
  "/summary",
  "/assistant",
  "/trends",
  "/medications",
  "/interactions",
  "/timeline",
  "/family",
  "/settings",
  "/profile-setup",
];

const SESSION_COOKIE = "phc_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = pathname === "/dashboard" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
