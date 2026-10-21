# Emergency help, care calendar and dark theme

Status key: **Done** = built and checked in this repository · **Partial** = built, with a stated gap · **Not built** = not in this change.

## 1. What was added

| Area | Status | Where |
|---|---|---|
| Light / Dark / Match-device theme, no flash on load | Done | `src/lib/theme/theme.ts`, `src/components/layout/theme-toggle.tsx`, `src/app/layout.tsx`, `src/app/globals.css` |
| Theme on dialogs, charts, assistant, public pages | Done (token remap; visual check not performed — see §7) | `.dark` block in `globals.css`; `bg-surface` / `bg-canvas` tokens |
| Assistant character "Pari" (SVG/CSS; listening, speaking, thinking, error; reduced-motion safe) | Done | `src/components/assistant/assistant-mascot.tsx` |
| Provenance legend (extracted / AI-generated / clinician-verified) | Partial — a legend, not per-statement tags (see §7) | `src/components/health/ai-chat.tsx` |
| Voice answers are never read aloud automatically | Done (`autoSpeak` forced off; playback needs a button press) | `src/components/health/ai-chat.tsx` |
| "Emergency Help — Call 112" in the header and on the emergency page, behind a confirmation step | Done | `src/components/emergency/emergency-call-button.tsx` |
| Emergency assistance card on the dashboard (readiness badge, contact prompt, call button, link to the emergency page) | Done | `src/components/dashboard/emergency-assistance-card.tsx` |
| Emergency contacts: add, edit, reorder, remove (confirmed), priority, method, consent flags | Done | `src/components/emergency/contacts-manager.tsx`, `src/lib/safety/service.ts` |
| Phone normalisation (India default, +91, E.164) | Done | `src/lib/safety/phone.ts` |
| OTP verification via a server-side provider (Twilio Verify) | Partial — code written, **not exercised against a live provider** (no credentials in this sandbox). With no provider, verification is unavailable and nothing is marked verified. | `src/lib/safety/verification.ts` |
| Emergency card: blood group / allergies / conditions / notes, provenance labels, field-level share ticks, lock-screen warning | Done | `src/components/emergency/emergency-card-editor.tsx`, `src/lib/safety/card.ts` |
| Medicines on the card | Partial — read from the existing medicine list (active only); not imported from documents | `activeMedicineNames()` |
| Location sharing: user-started, permission explanation, preview, review tick, 3-decimal coordinates, timestamp, copy / open-messaging fallback, "not delivery" note | Done | `src/components/emergency/location-share.tsx`, `src/lib/safety/messages.ts` |
| Readiness check: Ready / Needs attention / Action required | Done | `src/lib/safety/readiness.ts`, `src/components/emergency/readiness-card.tsx` |
| TEST MODE rehearsal (no calls, no contacts, no SMS/WhatsApp/email, 112 disabled) | Done | `src/components/emergency/test-mode.tsx` (no network calls, no links) |
| Preventive-care calendar: list + month view, add, edit, complete, postpone, cancel, explicit repeat | Done | `src/components/care/care-calendar.tsx`, `src/lib/care/*` |
| In-app "due soon" reminders | Done (in-app only) | `care-calendar.tsx` |
| Next preventive-care tasks on the dashboard (open only, overdue labelled in text, clinician source labelled) | Done | `src/components/dashboard/upcoming-care-card.tsx`, `src/lib/care/upcoming.ts` |
| Email / SMS / push reminders | Not built (by design; never claimed) | — |
| Hindi translations for the new screens | Partial — English is complete; Hindi covers the main labels and falls back to English for the rest | `src/lib/i18n/features.ts` |
| Dashboard entry points (care, emergency) | Done | `src/app/(app)/dashboard/page.tsx` |

## 2. Data model (Prisma)

New models in `prisma/schema.prisma` (all scoped to `HealthProfile`):

- `EmergencyContact` — name, relationship, `phoneE164`, `priority`, `preferredMethod`, `verificationStatus` (UNVERIFIED | PENDING | VERIFIED), `verifiedAt`, `consentEmergencyInfo`, `consentLocation`, notes.
- `ContactVerification` — one OTP request: provider, provider reference, status, attempts, expiry. **The code itself is never stored**; the provider holds it.
- `EmergencyCard` — one per profile: blood group + `bloodGroupSource` (NONE | USER_ENTERED — never VERIFIED), allergies, conditions, notes, four share flags.
- `CareTask` — title, category, `source` (USER | CLINICIAN), clinician name, `dueDate` (YYYY-MM-DD), optional `dueTime`, status, `recurrence` (NONE by default), `reminderDaysBefore`, notes.

Existing models reused: `User`, `HealthProfile`, `Medication` (read-only), `AuditLog` (new actions only), `UserPreferences` (language).

**Migration:** this repository has no `prisma/migrations` folder; the project syncs with `prisma db push` (`npm run db:push`). Run it once on any existing database. The new tables are additive; no existing column changed.

## 3. Endpoints

There are **no new public REST endpoints**. All writes are Next.js server actions. Each one resolves the user from the session cookie and the profile from the server-side active profile; the browser never supplies a user id or owner id. Ownership is re-checked inside every query.

| Server action | File | Purpose |
|---|---|---|
| `createContactAction(input)` | `src/lib/actions/safety.ts` | Add a contact to the active profile (max 10) |
| `updateContactAction(contactId, input)` | same | Edit; a changed number resets verification |
| `deleteContactAction(contactId)` | same | Remove; priorities renumbered |
| `moveContactAction(contactId, "up"\|"down")` | same | Reorder |
| `requestVerificationAction(contactId)` | same | Ask the provider for an SMS code (max 3 per contact per day) |
| `confirmVerificationAction(contactId, code)` | same | Check the code (max 5 attempts, 10-minute window) |
| `saveCardAction(input)` | same | Save the emergency card and share flags |
| `createCareTaskAction(input)` | `src/lib/actions/care.ts` | Add a care task |
| `updateCareTaskAction(taskId, input)` | same | Edit a task |
| `changeCareTaskStatusAction(taskId, "complete"\|"postpone"\|"cancel"\|"reopen")` | same | Status changes; `complete` creates the next occurrence only when a repeat was chosen |

Pages: `/emergency` (server-rendered, not cached, no public URL), `/care`, dashboard links.

## 4. Configuration

| Variable | Default | Notes |
|---|---|---|
| `EMERGENCY_NUMBER` | `112` | Digits only, 2–6 characters; anything else falls back to 112. Read on the server only. |
| `OTP_PROVIDER` | `none` | `none` = verification unavailable. `twilio-verify` needs the three variables below. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | empty | Server-only. Never prefix with `NEXT_PUBLIC_`. |

Theme: stored in the `phc_theme` cookie (`light` | `dark` | `system`). It holds no health data and is not in `localStorage`.

## 5. Security and privacy checks

Verified in code and by the automated tests in §6:

- Cross-user access is blocked for reads and writes on contacts, the card and care tasks (tests `cross-user access…`, `cross-user writes…`). A foreign id returns `NOT_FOUND`, and the row is left unchanged.
- Over HTTP, an unauthenticated server-action call returns `UNAUTHENTICATED` and writes nothing.
- Server-side validation: phone format, name and note lengths, enum fields, calendar dates (leap years), times, blood-group allow-list. Invalid input returns field errors and writes nothing.
- A contact is never `VERIFIED` because its number is well-formed. Changing a verified contact's number resets it to UNVERIFIED.
- Without a provider, `requestVerification` returns `PROVIDER_UNAVAILABLE` and changes nothing.
- Audit entries (`emergency_contact.*`, `emergency_card.update`, `care_task.*`) record ids and action names only. They do not contain names, phone numbers, notes, medicines or titles (tested).
- Location: requested only after a button press; coordinates rounded to 3 decimals before display or copy; nothing sent by the server, stored, or written to `localStorage`/`sessionStorage`; the fix is held in React state and dropped on "Clear" or page leave.
- The 112 control never auto-dials. It opens a confirmation dialog first, and only then a `tel:` link. The success message says the dialer was opened, not that a call was placed.
- TEST MODE contains no `fetch`, server action, `tel:`, `sms:` or `wa.me` link (the 112 action is disabled).
- Full medical data is only on the authenticated `/emergency` page. Nothing is published at a public URL.
- Secrets: Twilio credentials are read from environment variables inside server modules only (`src/lib/safety/verification.ts`). The client bundle does not reference them.

## 6. Tests and results

Run with `npm test`. The service tests use a throw-away SQLite database (created under the OS temp dir, not `prisma/dev.db`). The first run pushes the schema to a cached template under the OS temp dir; this takes about a minute in this sandbox because the Prisma CLI waits on blocked network calls. Later runs reuse the template.

New test files:
- `tests/safety/phone.test.ts` — normalisation, emergency number, provider configuration, readiness rules, card sharing, location message.
- `tests/safety/service.test.ts` — DB-backed: ownership, cross-user blocking, no-provider behaviour, verification reset, priority renumbering, limit, validation, card provenance.
- `tests/care/care.test.ts` — calendar validation, month clamping, recurrence, timing, schema rules.
- `tests/care/service.test.ts` — DB-backed: ownership, complete/repeat, postpone, cancel, validation.
- `tests/care/upcoming.test.ts` — dashboard selection: open-only, chronological order, overdue flag from the calendar date (not from a timestamp), malformed dates ignored, limits, due-within window.

Other checks: `npm run typecheck`, `npm run build`, and HTTP checks against the running build (pages return 200; server actions return the expected results as listed in §3).

### 6.1 Final run

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | Pass (exit 0, no errors) |
| Unit and service tests | `npm test` | **96 / 96 pass** (58 voice + 32 safety/care + 6 dashboard care-selection tests), 0 fail |
| Production build | `npm run build` | Pass (exit 0); `/emergency` and `/care` included |
| HTTP smoke test on the built app | authenticated `GET` on `/`, `/dashboard`, `/emergency`, `/care`, `/assistant`, `/trends`, `/medications`, `/settings` | All 200; `/emergency` unauthenticated → redirect to `/login` |
| Theme in server HTML | `GET /emergency` with cookie `phc_theme=dark` | `<html class="dark">` |
| Server actions over HTTP | invalid phone; valid contact; no-provider verification; card save; care task create; invalid date; unauthenticated call; unknown contact id | Each returned the expected result (INVALID_PHONE, saved, PROVIDER_UNAVAILABLE, saved, created, INVALID_INPUT, UNAUTHENTICATED, NOT_FOUND) |

Not performed: browser or visual tests, accessibility audit with assistive technology, live SMS verification.

## 7. Limitations (honest list)

- **No browser verification.** This sandbox has no browser, so the dark theme, mascot animations, dialogs and layouts were **not visually inspected**. Checks were: typecheck, build, server-rendered HTML (including `class="dark"` from the cookie) and the server actions over HTTP.
- **Live SMS verification is untested.** The Twilio code path was written against the documented REST API but has not been run with credentials.
- **Hindi** covers every string on the new screens (204 keys). The translations have not been reviewed by a native speaker or a clinician. A missing string still falls back to English.
- **Provenance** is shown per answer: a line states that the wording is AI-generated, that values come from the records listed below, and that nothing is clinician-verified. Individual sentences are not tagged.
- **Medicines** on the card come from the existing list; nothing is imported from documents, and nothing is marked verified.
- **Blood group, allergies and conditions** are user-entered (self-reported). There is no verification mechanism, so nothing is labelled verified.
- **Consent** is recorded as append-only `Consent` rows (purposes `EMERGENCY_CONTACT_INFO` and `EMERGENCY_LOCATION_SHARING`, with `subjectId` set to the contact id). Each change adds a row, and deleting a contact adds REVOKED rows. The contact's own flags remain the source for the UI. Adding `subjectId` needs `npm run db:push`.
- **Reminders** are in-app only. No email, SMS, WhatsApp or push delivery exists, and none is claimed.
- **Care tasks** store calendar dates and times without timezone conversion, as specified. Display uses the device's time zone.
- **Lock-screen display** is not possible from a web page. The card page warns about this; a printed copy is recommended.
- **No geofencing, no background tracking, no location history** — by design.
- **Readiness** reflects what is set up in Parikshan. It is not a measure of medical or emergency safety.
- **Data at rest** is plain SQLite in this build. Field-level encryption is not implemented.

## 8. Manual test guide

Set `EMERGENCY_NUMBER` (optional) and start the app (`npm run setup`, then `npm run dev` or `npm run build && npm start`). Sign in with the demo account.

0. **Dashboard.** At the top of the dashboard, two cards appear before the metrics: *Setup check — Emergency Help — Call 112* (with a readiness badge: Action required → Needs attention → Ready) and *Preventive care* (the next 3 open tasks, "Overdue" in text, "Clinician-recommended" where applicable, and a link to the calendar). The old duplicate Care/Emergency header buttons are gone; both remain in the header, the sidebar and the bottom navigation. The dashboard cards read data for the **active profile** only — switch profiles and both cards change.
1. **Theme.** Open the header theme button (sun/moon icon). Choose Dark, then reload: the page should stay dark with no light flash. Choose Light, then Match device, and change the OS setting: the page follows it while "Match device" is selected. Check the dashboard, trends chart tooltip, assistant, a dialog and the sign-in page in both themes.
2. **Assistant.** Open *AI Health Assistant*. The "Pari" character shows "Ready when you are". Ask a question: the state changes to "Looking through your records…", then back. Confirm the answer is **not** read aloud automatically; playback starts only from the speaker button. Check the "How to read this answer" card.
3. **Call 112.** Click "Emergency Help — Call 112" in the header. A dialog asks for confirmation and states that the website cannot place or confirm the call. Cancel: nothing happens. Confirm: the phone's dialer opens with 112 (on a desktop, the browser may ask what to do with the tel: link). The page must **not** say a call was placed.
4. **Contacts.** On *Emergency help*, add a contact: enter `98765 43210` (valid) and `12345` (invalid — shows a field error). The saved contact shows **Not verified** and "Format looks valid — this does not mean the number is verified." Reorder with the arrow buttons. Remove → a confirmation dialog appears first.
5. **Verification.** With no provider configured, the note "Verification is unavailable… NOT verified" appears and no code can be requested.
6. **Emergency card.** Enter a blood group and allergies. Blood group reads "Self-reported — not verified". Tick "Share in message" only for allergies; the preview lists only ticked items. Save, then reload to confirm persistence. The lock-screen warning is visible.
7. **Location.** Read the permission explanation, then press "Get my current location" and allow it. Check the timestamp and accuracy, the preview, and the coarse-location note. Copy and open-messaging stay disabled until you tick "I have reviewed the message…". Select a contact with location consent to see the messaging link. Clear: the fix disappears. Reload: no location is kept.
8. **Readiness.** With no contacts the status is **Action required**. With a contact but no verification it is **Needs attention**. It never reads "Ready" without a verified contact, and never says the user is safe.
9. **TEST MODE.** Press "Run test workflow" or start test mode. The banner reads "TEST MODE — NO REAL CALL OR MESSAGE IS MADE". The 112 action is disabled. Nothing is sent and no dialer opens. Finish and exit.
10. **Care calendar.** Add a task with source "My clinician recommended it" and a clinician name. The card says "Clinician-recommended (entered by you — not verified by Parikshan)". Try an invalid date (e.g. 30 February) — an error appears. Switch to Month, select a day, and check the task appears. Mark done → it disappears from Open. Postpone → the date moves 7 days. Cancel → confirmation first. Set "Repeat: every 6 months", mark done → a new task 6 months later appears. A task with no repeat does not create another one.
11. **Isolation.** Sign in as a second account (or create one) and confirm it sees none of the first account's contacts, card or tasks.
12. **Mobile.** At 375px width the header shows the 112 control as an icon (still announced as "Emergency Help — Call 112"), and the cards stack.

## 9. Items for legal and compliance review (not claimed as compliant)

These are flagged for review by qualified counsel. This document does not claim compliance with any of them.

- **India — Digital Personal Data Protection Act, 2023** and its rules: consent for emergency-contact data, location data, retention, children's data (child profiles), and the rights of third parties named as contacts.
- **Health-data rules and ABDM/ABHA:** any use of ABHA identifiers remains demo-only. No official ABHA authentication or ABDM connectivity is implied.
- **Emergency-number use:** whether a website may offer a `tel:112` link and how it is worded; the site is not a dispatch service and must not imply one.
- **Messaging rules (SMS/WhatsApp):** consent and sender rules when users send messages through their own apps, and the requirements of any future SMS or verification provider (including telecom registration).
- **Location:** the legal basis for processing location, the minimum precision chosen (3 decimals ≈ 110 m), and the absence of storage.
- **Medical content:** labelling of self-reported values, and the boundaries between general information and medical advice. The app must not diagnose or give prescription advice, and the disclaimer "⚠️ This is not medical advice. Always consult a qualified doctor or pharmacist." must remain visible.
- **Preventive-care content:** clinical guidance on which checks apply to which people, and whether any screening schedule may be offered. This build offers none.
- **Accessibility:** the assessment of the new screens against WCAG 2.1 AA was **not** performed by an accessibility specialist.
