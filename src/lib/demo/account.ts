/**
 * Demo account identity — deliberately dependency-free.
 *
 * This module is imported by client components (the sign-in panel shows the demo
 * credentials) so it must never pull in `node:crypto`, Prisma or any other
 * server-only code. `src/lib/demo/demo-seed.ts` re-exports these constants and
 * uses them when it builds the fictional demo dataset.
 */

export const DEMO_ACCOUNT_EMAIL = "demo@healthcopilot.app";
export const DEMO_ACCOUNT_NAME = "Demo Patient";

/** Verhoeff-valid, entirely fictional ABHA-shaped number. */
export const DEMO_ABHA_NUMBER = "12345678901230";

/** Copy shown wherever the demo account is offered. */
export const DEMO_DISCLAIMER =
  "Demo authentication only — official ABHA authentication will require approved integration.";
