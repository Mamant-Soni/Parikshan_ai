
/**
 * Phone verification via a secure SERVER-SIDE provider. Credentials are read from
 * environment variables only and never reach the browser. The provider holds the
 * one-time code; this app never sees or stores it.
 *
 * Supported: `twilio-verify` (Twilio Verify REST API). With no provider
 * configured the API reports PROVIDER_UNAVAILABLE and nothing is marked verified.
 */

export type VerificationResult =
  | { ok: true; providerRef: string }
  | { ok: false; code: "PROVIDER_UNAVAILABLE" | "PROVIDER_ERROR" | "INVALID_CODE" };

type Env = Record<string, string | undefined>;

function twilioConfig(env: Env) {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) return null;
  return { accountSid, authToken, serviceSid };
}

async function twilioPost(path: string, body: URLSearchParams, env: Env): Promise<Record<string, unknown> | null> {
  const cfg = twilioConfig(env);
  if (!cfg) return null;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${cfg.serviceSid}${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ...json, __status: response.status } as Record<string, unknown>;
}

/** Asks the provider to text a code to `e164`. Only the provider reference is kept. */
export async function requestPhoneCode(e164: string, env: Env = process.env): Promise<VerificationResult> {
  if (!twilioConfig(env)) return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  const json = await twilioPost("/Verifications", new URLSearchParams({ To: e164, Channel: "sms" }), env);
  if (!json || (json.__status as number) >= 300 || typeof json.sid !== "string") {
    return { ok: false, code: "PROVIDER_ERROR" };
  }
  return { ok: true, providerRef: json.sid };
}

/** Checks a code the contact read out. Returns approved only when the provider says so. */
export async function checkPhoneCode(e164: string, code: string, env: Env = process.env): Promise<VerificationResult> {
  if (!twilioConfig(env)) return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  const json = await twilioPost("/VerificationCheck", new URLSearchParams({ To: e164, Code: code }), env);
  if (!json || (json.__status as number) >= 500) return { ok: false, code: "PROVIDER_ERROR" };
  if (json.status === "approved") return { ok: true, providerRef: typeof json.sid === "string" ? json.sid : "" };
  return { ok: false, code: "INVALID_CODE" };
}
