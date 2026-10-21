/**
 * Phone normalisation for emergency contacts. Default region: India (+91).
 * Format validity is NOT verification — callers must store `verificationStatus`
 * separately and only set VERIFIED after a successful provider check.
 */

export type PhoneResult =
  | { ok: true; e164: string; display: string; region: "IN" | "INTL" }
  | { ok: false; reason: "EMPTY" | "INVALID_IN_MOBILE" | "INVALID_INTL" };

const IN_MOBILE = /^[6-9]\d{9}$/;

function formatIn(national10: string): string {
  return `+91 ${national10.slice(0, 5)} ${national10.slice(5)}`;
}

export function normalizePhone(raw: string): PhoneResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, reason: "EMPTY" };

  // Keep a leading + (international intent), strip separators.
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) {
    return { ok: false, reason: hasPlus ? "INVALID_INTL" : "INVALID_IN_MOBILE" };
  }
  if (digits.startsWith("00")) {
    digits = `+${digits.slice(2)}`;
  }

  if (digits.startsWith("+")) {
    const body = digits.slice(1);
    if (body.startsWith("91")) {
      const national = body.slice(2);
      if (IN_MOBILE.test(national)) {
        return { ok: true, e164: `+91${national}`, display: formatIn(national), region: "IN" };
      }
      return { ok: false, reason: "INVALID_IN_MOBILE" };
    }
    // Other countries: E.164 allows up to 15 digits total; require at least 8.
    if (/^\d{8,15}$/.test(body) && !body.startsWith("0")) {
      return { ok: true, e164: `+${body}`, display: `+${body}`, region: "INTL" };
    }
    return { ok: false, reason: "INVALID_INTL" };
  }

  // National format without +: 10 digits, 0 + 10 digits, or 91 + 10 digits.
  let national = digits;
  if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  if (IN_MOBILE.test(national)) {
    return { ok: true, e164: `+91${national}`, display: formatIn(national), region: "IN" };
  }
  return { ok: false, reason: "INVALID_IN_MOBILE" };
}

/** `tel:` / `sms:` / `wa.me` targets only accept digits after the +. */
export function toWhatsAppDigits(e164: string): string {
  return e164.replace(/^\+/, "");
}
