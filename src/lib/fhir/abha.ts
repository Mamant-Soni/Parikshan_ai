/**
 * ABHA helpers.
 *
 * ⚠️ DEMO ONLY. Nothing in this file calls ABDM. There is no network request,
 * no client id, no consent artefact exchange. Real ABHA authentication requires
 * an approved integration (sandbox credentials, HIP/HIU registration, signed
 * consent artefacts, key management) — see the README section
 * "How to integrate official ABHA/ABDM services".
 *
 * What this file *does* provide: correct format validation, a safe masking
 * helper for display, and the place where the real flow will plug in.
 */

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** ABHA numbers use the Verhoeff checksum, as do Aadhaar numbers. */
export function verhoeffValidate(number: string): boolean {
  if (!/^\d+$/.test(number)) return false;
  let checksum = 0;
  const digits = number.split("").reverse().map(Number);
  for (let index = 0; index < digits.length; index += 1) {
    checksum = VERHOEFF_D[checksum][VERHOEFF_P[index % 8][digits[index]]];
  }
  return checksum === 0;
}

export type AbhaValidation = {
  /** Format is valid (14 digits). */
  formatValid: boolean;
  /** Verhoeff checksum valid — a much stronger signal than format alone. */
  checksumValid: boolean;
  /** Ready to store in the demo database. */
  acceptable: boolean;
  message: string | null;
};

/**
 * Demo-mode validation.
 *
 * We accept any 14-digit number so judges can type a made-up one, but we still
 * report whether the checksum looks right, and we never block on it.
 */
export function validateAbhaNumber(raw: string): AbhaValidation {
  const digits = raw.replace(/\s|-/g, "");
  const formatValid = /^\d{14}$/.test(digits);
  if (!formatValid) {
    return {
      formatValid: false,
      checksumValid: false,
      acceptable: raw.trim() === "",
      message: "ABHA number must be exactly 14 digits",
    };
  }
  const checksumValid = verhoeffValidate(digits);
  return {
    formatValid: true,
    checksumValid,
    acceptable: true,
    message: checksumValid ? null : "These 14 digits do not match the ABHA checksum — accepted in demo mode only.",
  };
}

/** `12**********34` — used everywhere ABHA numbers are displayed. */
export function maskAbhaNumber(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/\s|-/g, "");
  if (digits.length < 6) return "•".repeat(digits.length);
  return `${digits.slice(0, 2)}${"•".repeat(Math.max(4, digits.length - 4))}${digits.slice(-2)}`;
}

/** Groups an ABHA number as 12-3456-7890-1234 for readable display. */
export function formatAbhaNumber(raw: string | null | undefined): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;
}

export type AbhaLinkStatus = "NOT_LINKED" | "DEMO_LINKED" | "VERIFIED";

export type AbdmMode = "demo" | "sandbox" | "production";

/**
 * `ABDM_MODE` — how far this deployment is allowed to claim ABHA integration.
 *
 * `demo` (default) means *nothing* is verified: no ABDM endpoint is called, so the
 * UI must describe a linked number as a demo link. Only a build that has completed
 * official ABDM onboarding should ever set `production`.
 */
export function abdmMode(): AbdmMode {
  const raw = (globalThis.process?.env?.ABDM_MODE ?? "demo").toLowerCase().trim();
  return raw === "sandbox" || raw === "production" ? raw : "demo";
}

/**
 * The single place where official ABHA linking will be implemented.
 *
 * Production checklist (do not fake any of these):
 *  1. Register the app as an HIU/HIP on the ABDM sandbox and obtain
 *     client id/secret (env: ABDM_CLIENT_ID, ABDM_CLIENT_SECRET).
 *  2. Implement the ABHA login/OTP flow, then exchange the auth token for a
 *     session at the ABDM gateway (env: ABDM_BASE_URL).
 *  3. Create a Consent artefact (purpose, HIU id, date range, data types) and
 *     store the signed artefact in the Consent table.
 *  4. Fetch records through the data-transfer APIs (FHIR bundles) and map them
 *     with src/lib/fhir/mappers.ts before persisting.
 *  5. Record every access in the AuditLog table with the consent id.
 */
export function abhaLinkStatus(
  user: { abhaNumber: string | null; abhaLinked: boolean },
  mode: AbdmMode = abdmMode(),
): AbhaLinkStatus {
  if (!user.abhaNumber) return "NOT_LINKED";
  if (!user.abhaLinked) return "NOT_LINKED";
  // A number can only be reported as VERIFIED when an approved ABDM integration exists.
  return mode === "demo" ? "DEMO_LINKED" : "VERIFIED";
}

export const ABDM_DEMO_NOTICE =
  "Demo authentication only. Official ABHA authentication will require approved integration.";
