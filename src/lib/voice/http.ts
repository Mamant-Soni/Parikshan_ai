/**
 * Route-handler helpers.
 *
 * Cookies are SameSite=Lax, which already prevents a cross-site form POST from
 * carrying a session. This origin check adds a second, explicit barrier for
 * JSON/multipart fetches and makes the intent testable.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true; // Non-browser clients (curl, native app) have no Origin.
  const host = headers.get("host");
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host;
  } catch {
    return false;
  }
}

export function jsonVoiceError(
  code: string,
  status: number,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ ok: false, error: code, ...extra }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function jsonVoiceOk(
  payload: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}
