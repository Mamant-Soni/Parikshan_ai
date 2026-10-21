# Parikshan — Personal Health Copilot

> **Understand your health records in plain language.**

Upload a prescription or a lab report and this app reads it, extracts the numbers, explains what the
document says in everyday English or Hindi, tracks how your values are trending, keeps your medicines
in order, checks your medicine list for interactions, and lets you ask questions about **your own
records** — with no doctor's-visit jargon and no medical advice.

This is a **working prototype**, not a static design: every screen reads and writes a real SQLite
database through typed Prisma queries and server actions. The OCR and AI layers are **deterministic
built-in demo providers**, so the whole product runs offline with zero API keys, and both are designed
to be swapped for production services without touching the UI (see
[Replacing mock OCR](#how-to-replace-mock-ocr-with-production-ocr) and
[Replacing mock AI](#how-to-replace-mock-ai-with-production-ai)).

---

## Contents

- [Try it in 60 seconds](#try-it-in-60-seconds)
- [Feature checklist](#feature-checklist)
- [2–3 minute demo script](#23-minute-demo-script)
- [Tech stack](#tech-stack)
- [Pages and routes](#pages-and-routes)
- [Project structure](#project-structure)
- [How a record flows through the system](#how-a-record-flows-through-the-system)
- [Safety, privacy and consent](#safety-privacy-and-consent)
- [Accessibility and Easy Read Mode](#accessibility-and-easy-read-mode)
- [Languages](#languages)
- [Voice assistant](#voice-assistant)
- [Family profiles, child mode and elder mode](#family-profiles-child-mode-and-elder-mode)
- [Data model](#data-model)
- [Configuration](#configuration)
- [npm scripts](#npm-scripts)
- [Known limitations — what is deliberately not real](#known-limitations--what-is-deliberately-not-real)
- [How to replace mock OCR with production OCR](#how-to-replace-mock-ocr-with-production-ocr)
- [How to replace mock AI with production AI](#how-to-replace-mock-ai-with-production-ai)
- [How to integrate official ABHA / ABDM services](#how-to-integrate-official-abha--abdm-services)
- [How to deploy this application](#how-to-deploy-this-application)
- [Troubleshooting](#troubleshooting)

---

## Try it in 60 seconds

Requirements: **Node.js 20.12+** (the tooling uses `process.loadEnvFile`) and npm. Then:

```bash
npm install      # installs deps, runs `prisma generate`
npm run dev      # first run auto-creates .env, the SQLite schema and the demo data
```

Open <http://localhost:3000> and <https://3000-i3l2lp81he125zl2upayc.e2b.app/dashboard> press **“Try Interactive Demo”** (or **“Continue with Demo
Account”** on `/login`). One tap signs you in as the seeded demo patient — no sign-up, no keys.

`npm run dev` runs a `predev` step (`scripts/dev-setup.mjs`) that copies `.env.example` → `.env`,
applies the Prisma schema and seeds fictional demo data, but only when they are missing. It is
idempotent and never blocks the server; you can also do it explicitly:

```bash
npm run setup    # prisma generate + db push + seed
npm run typecheck
npm test         # voice assistant / grounding / authorization tests
```

**Demo credentials** (all data is fictional and stored only on your machine):

| Field | Value |
| --- | --- |
| Email | `demo@healthcopilot.app` |
| Password | any non-empty value (demo login does not verify passwords) |
| ABHA ID | `1234 5678 9012 30` — demo placeholder, never transmitted |
| Family profiles | *Demo Patient* (self), *Aarav* (child), *Savitri Devi* (elder) |

The seeded account contains 11 records, 50 lab values, 9 medicines, 39 trend points and 9 known
interaction pairs — enough to make every screen meaningful on first load.

> **Demo authentication only.** The login screen says this out loud: official ABHA authentication
> requires an approved ABDM integration. The app displays an **“ABHA integration ready”** badge, which
> means *the data model and FHIR mappers exist* — it does **not** mean any ABDM service was contacted.

---

## Feature checklist

| # | Required capability | Where it lives |
| --- | --- | --- |
| 1 | Upload prescriptions / lab reports (drag-drop, camera, PDF, image) with OCR | `/upload` · `src/components/upload/upload-dropzone.tsx` · `src/lib/ocr/*` |
| 2 | Plain-language explanation of each document | `/records/[id]` · `AISummaryCard` · `src/lib/ai/mock-provider.ts` |
| 3 | Health history / record library | `/records`, `/timeline` |
| 4 | Compare results over time (value vs. reference range, then vs. before) | `/records/[id]` comparison panel, `/trends` |
| 5 | Medication management with daily dose tracking | `/medications` · `MedicationManager`, `DoseTracker` |
| 6 | Drug–drug interaction detection | `/interactions` · `src/lib/interactions/*` |
| 7 | Ask questions about your own records | `/assistant` · `AIChat` · `answerQuestionSafely()` |
| 8 | English + Hindi throughout | `LanguageToggle`, `src/lib/i18n/dictionary.ts` (813 keys × 2, parity enforced by `tsc`) |
| 9 | Elderly / child accessibility (Easy Read, large text, high contrast, read-aloud) | `AccessibilityToggle`, `src/app/globals.css`, `ChildModeNotice` |
| 10 | ABHA / FHIR-ready architecture | `src/lib/fhir/mappers.ts`, `src/lib/fhir/abha.ts`, `/api/export` |
| 11 | Privacy, consent and audit trail | `Consent` + `AuditLog` models, `/api/records/[id]/file`, `/settings` |
| 12 | Works on a phone (bottom nav) and desktop (sidebar), installable PWA | `AppShell`, `BottomNav`, `src/app/manifest.ts` |
| 13 | Voice questions + spoken answers, English and Hindi, with visible transcript and failure states | `/assistant` · `VoiceAssistant` · `src/lib/voice/*` · `/api/voice/{transcribe,speak}` |

Every screen also ships the required component set: `HealthMetricCard`, `MedicationCard`, `RecordCard`,
`TimelineItem`, `UploadDropzone`, `AISummaryCard`, `AIChat`, `TrendChart`, `LanguageToggle`,
`AccessibilityToggle`, `MedicalDisclaimer`, `InteractionAlert`, `ProfileSwitcher`, `EmptyState`,
`LoadingState`, `ErrorState`.

---

## 2–3 minute demo script

Deliberately ordered so each step builds on the previous one. ~15 seconds per step.

1. **Landing page** — tagline, the permanent safety disclaimer, “no API keys needed”.
2. **Try Interactive Demo** → lands on the dashboard with real seeded data (compare against the empty
   `EmptyState` you would see on a fresh account).
3. **Dashboard** — “what needs attention today”: dose due, out-of-range flag, one plain-language insight.
4. **Upload** — drop any JPG/PNG/PDF (the demo OCR returns a realistic lab report chosen from the file name
   and the selected document type); show the *Reading your document…* loading state, then the OCR review screen
   with confidence and “please check these fields”.
5. **Review & correct** — edit a mis-read value, save. Corrections are logged in the record's audit trail.
6. **Record detail** — plain-language summary: *what it says*, *within range*, *outside range*, *terms
   explained*, *what to discuss with your doctor*.
7. **Trends** — hemoglobin falling 14.5 → 11.0 g/dL with the reference band, then the BP pair chart.
8. **Medications + interactions** — tick a dose; the checker flags Paracetamol + Ibuprofen (minor) and
   Telmisartan + Ibuprofen (moderate) with “talk to your doctor or pharmacist”, never “stop this”.
9. **Assistant** — ask *“What was my last haemoglobin?”* → grounded answer with source chips; then ask
   about a vitamin the records never mention → *“I couldn't find that information in your uploaded
   records.”* (the anti-hallucination guardrail, on purpose).
10. **Hindi + Easy Read + family profiles** — switch language (everything, including charts, re-renders
    in Hindi), toggle Easy Read, switch to *Savitri Devi (Demo Elder)* to show a different patient in the
    same household. Close on **Settings → export** (FHIR R4 bundle) to show the ABHA-ready architecture.

---

## Tech stack

| Concern | Choice | Why here |
| --- | --- | --- |
| Framework | **Next.js 15.5, App Router, React 19** | Server components for data, server actions for mutations, one deployable |
| Language | **TypeScript (strict)** | No `any` at boundaries; Zod schemas infer the runtime shape |
| Styling | **Tailwind CSS v4** + CSS variables | Accessibility modes are theme switches, not parallel component trees |
| UI primitives | **shadcn/ui-style local components** (`src/components/ui/*`) on Radix | Full control of focus/ARIA; no opaque dependency |
| Icons | **lucide-react** | |
| Charts | **recharts** | Accessible SVG line/area charts with `role="img"` + text summaries |
| Database | **Prisma 6 + SQLite** via `@prisma/adapter-better-sqlite3` | Zero-config local file; the adapter means no native engine binary to download |
| Validation | **Zod 4** (`src/lib/validation.ts`) | Every write path, form and provider payload |
| Toasts | **sonner** | Announces action results to screen readers too |
| PWA | `src/app/manifest.ts`, `public/icon.svg`, `public/icon-maskable.svg` | Installable, `theme-color`, no service-worker caching of medical data |

---

## Pages and routes

| Route | Page | Notes |
| --- | --- | --- |
| `/` | Landing | Public; hero + features + demo CTA |
| `/login` | Login / profile setup | Demo sign-in, `?demo=1` autofocuses the demo card |
| `/profile-setup` | First-run profile setup | Name, age, sex, blood group, language, Easy Read — before any records |
| `/dashboard` | Dashboard | Today's doses, key metrics, recent records, insights |
| `/upload` | Upload | Dropzone, document-type hint, progress + review flow |
| `/records` | Record library | Filter by type/date, per-record status |
| `/records/[id]` | OCR results + explanation | Confidence, corrections, comparison, per-record AI summary |
| `/summary` | AI health summary | Whole-history summary across the active profile |
| `/assistant` | AI assistant | Grounded Q&A with source chips, Hindi support, read-aloud |
| `/trends` | Health trends | 20 metric definitions, reference bands, delta vs. previous |
| `/medications` | Medication manager | Add/edit/stop medicines, dose tracker, reminders list |
| `/interactions` | Drug interaction checker | Severity, mechanism, “what to do” guidance |
| `/timeline` | Health timeline | Chronological records, visits, medicines started |
| `/family` | Family profiles | Add/switch/delete profiles, child & elder modes |
| `/settings` | Profile & settings | Preferences, ABHA status (demo), consent, export, delete account |
| `/api/records/[id]/file` | Original document | Ownership-checked stream, `private, no-store`, audit-logged |
| `/api/export` | FHIR R4 bundle export | `{ account, notice, profiles[] }` — one `Bundle` per profile |

`src/middleware.ts` only redirects unauthenticated visitors to `/login` (cookie presence = UX shortcut);
**the real authorisation check is in every server component and action** via `requireUser()` /
`getActiveProfile()`, so a missing cookie value can never leak another user's data.

---

## Project structure

```
prisma/
  schema.prisma          # 13 models, SQLite-safe (string “enums”), FHIR-mapping notes
  seed.ts                # → src/lib/demo/demo-seed.ts (idempotent, fictional data)
scripts/
  dev-setup.mjs          # first-run .env + schema + seed, wired as `predev`
src/
  app/
    layout.tsx           # reads preferences server-side → <html lang> + a11y classes (no flash)
    page.tsx             # landing
    login/  profile-setup/
    (app)/               # authenticated segment: layout = AppShell, plus error.tsx / loading.tsx
    api/records/[id]/file/route.ts, api/export/route.ts
    manifest.ts  robots.ts  not-found.tsx
  components/
    ui/                  # button, card, badge, alert, dialog, select, switch, tabs, skeleton…
    layout/                # AppShell, Sidebar, TopHeader, BottomNav, MedicalDisclaimer, toggles, ProfileSwitcher
    health/                # RecordCard, HealthMetricCard, AISummaryCard, AIChat, StatusPills, states, glossary
    upload/ records/ trends/ medications/ interactions/ timeline/ family/ settings/ auth/
    providers/             # RootProviders (I18n + toaster), I18nProvider, ProfileProvider
  lib/
    actions/               # server actions: records, medications, profiles, assistant, interactions, preferences, auth
    ai/                    # HealthAIProvider + Mock/OpenAI-compatible/Gemini + fallback wrappers
    ocr/                   # OcrProvider + mock provider + regex parser + types
    interactions/          # DrugInteractionProvider (demo dataset / RxNorm alias) + normalisation + dedupe
    fhir/                  # R4 mappers (pure) + ABHA helpers (Verhoeff, masking, demo notice)
    health/                # metric definitions (20), reference-range evaluation, insight builder
    medical/glossary.ts    # 22 plain-language term explanations (EN + HI)
    i18n/                  # dictionary (EN/HI), createTranslator, Intl formatters
    auth/                  # opaque session tokens (only sha256 hash stored) + guards
    database/              # memoised Prisma client + all read queries used by pages
    demo/                  # account.ts (client-safe) + demo-seed.ts (server-only)
    uploads/               # storage.ts (server-only) + limits.ts (client-safe rules)
    utils.ts  validation.ts  audio/ (Web Speech read-aloud)
  types/domain.ts          # shared unions: record types, dose slots, profile kinds, relationships
```

**The one client/server rule that matters:** browser code may import only pure modules
(`src/lib/demo/account.ts`, `src/lib/uploads/limits.ts`, types, i18n). Anything touching `node:*`,
`fs` or Prisma stays server-only (`demo-seed.ts`, `uploads/storage.ts`). Breaking that rule is the
classic `UnhandledSchemeError: Reading from "node:crypto"` in this stack.

---

## How a record flows through the system

```
file (drag/camera/picker)
  → uploadRecordAction (src/lib/actions/records.ts)      # Zod-validated, size + MIME allow-list
  → saveUpload() to data/uploads (outside the web root)  # random name, sha256 in the DB row
  → getOcrProvider().extractTextFromImage | Pdf          # demo provider today, vendor tomorrow
  → parseDocument() → medicines[], labValues[], dates, doctor, facility, lowConfidenceFields
  → review screen: user corrects                          # corrections[] on the record
  → transaction: HealthRecord + LabResult* + Medication* + HealthMetric*
  → generateSummarySafely() with getAIContext(profileId)   # summary stored on the record
  → AuditLog row (action, userId, recordId, meta)
```

Nothing is auto-saved as “truth”: **a human confirms the extraction** before it lands in the history, and
the review screen shows which fields the OCR was least sure about.

Reading is equally narrow — pages call typed helpers in `src/lib/database/queries.ts`
(`getDashboardSnapshot`, `getMetricSummaries`, `getMetricSeries`, `getTimelineRecords`,
`getProfilesOverview`, `getAIContext`), so no page hand-writes SQL and the AI only ever sees the
`AIContext` built from that user's own rows.

---

## Safety, privacy and consent

**Never a doctor.** The AI layer cannot emit a diagnosis or a dose instruction:

- The system prompt (single source of truth in `src/lib/ai/prompt.ts`) forbids diagnosis,
  “stop/start/change the dose”, and emergency advice; it must hedge instead.
- Output is post-processed through `SAFETY_PHRASES`, `containsUnsafeClaim()` and `FORBIDDEN_ANSWER_PATTERNS`
  (`src/lib/medical/glossary.ts`), so wording is *“This may indicate a change compared with your previous
  record.”*, *“This result is outside the reference range printed on your report.”*, *“Discuss this with your
  doctor.”* — never *“You have…”*. `buildInsights()` (`src/lib/health/insights.ts`) turns metric deltas into
  dashboard observations without inventing values.
- Interaction findings always route to a clinician; the UI never says *stop taking this*.
- Reference ranges come **only from the report itself** (`evaluateAgainstRange`); with no range on the
  document the status is `UNKNOWN` rather than an invented normal.
- The disclaimer *“⚠️ This is not medical advice. Always consult a qualified doctor or pharmacist.”* is
  rendered once in the app shell (dismissible for the session via `sessionStorage`) and permanently in the
  page footer, plus on the landing and login screens — it can be collapsed, never removed.

**Data minimisation and access control**

- Originals live in `data/uploads/` — **outside** `public/` — so they are not web-addressable. The only
  way to read one is `/api/records/[id]/file`, which verifies ownership, responds
  `Cache-Control: private, no-store`, and writes an audit row.
- Sessions are opaque 32-byte tokens; the database stores only `sha256(token:SESSION_SECRET)`. Stealing
  the DB does not give a usable session.
- `Consent` (purpose, granted/revoked, scope) and `AuditLog` (who touched which record) models exist from
  day one so ABDM's consent artefacts have a home.
- Preferences (language, Easy Read, large text, contrast) are read in the **root server layout** and
  applied to `<html>` before hydration — no unreadable flash on load.
- Prisma logging is `warn`/`error` only: query logs would put medical values in stdout.
- “Delete my account” cascades profiles, records, labs, metrics, chats, sessions, consents and audit rows.

---

## Accessibility and Easy Read Mode

- **Easy Read**: larger type, wider line height, simpler card density, one idea per line, sentence-case
  headings; icons always paired with text (never colour-only).
- **Large text** and **High contrast** are independent toggles (`easy-read`, `large-text`, `high-contrast`
  classes on `<html>`, driven by CSS variables).
- **Read aloud** (`src/lib/audio`, Web Speech `speechSynthesis`) on summaries, insights, disclaimers and
  chat answers — with `en-IN` / `hi-IN` voices when the browser has them.
- Minimum 44×44 px tap targets (`--a11y-tap`), visible `:focus-visible` rings, skip link to
  `#main-content`, semantic landmarks (`header`/`nav`/`main`/`footer`), `aria-live` regions for async
  results, labelled form controls with inline error text (not colour alone), keyboard-operable dropzone,
  and reduced-motion support.
- Mobile bottom nav has five large targets (Home · Upload · Trends · Medicines · Assistant); the sidebar takes
  over at the `lg` breakpoint. Navigation is data-driven from one file (`src/components/layout/nav-items.ts`) so
  sidebar, drawer and bottom bar can never drift. Layout targets 320/375/768/1024/1440 px without horizontal
  scrolling — re-check after any width change; `npm run typecheck` catches contract drift everywhere else.

---

## Languages

- One dictionary module (`src/lib/i18n/dictionary.ts`) with **813 EN keys and 813 HI keys**; `tsc` fails if
  a key exists in one language only, so a missing translation is a compile error, not a UI bug.
- `t("trends.count", { count })` for interpolation, with Intl number/date formatting per locale
  (`en-IN` / `hi-IN`, Latin digits so lab values stay readable and copyable).
- Switching language updates `<html lang>`, persists the preference, and re-renders charts, dates and
  AI summaries (the demo AI answers in the requested language).
- Documented terms come from `src/lib/medical/glossary.ts` in both languages.

---

## Emergency help, care calendar and dark theme

Three additions to the Personal Health Copilot. Full details, endpoints, the manual test guide and the legal-review list are in [`docs/emergency-and-care.md`](docs/emergency-and-care.md).

- **Dark theme** — Light / Dark / Match device, from the header. The choice is kept in the `phc_theme` cookie and applied before first paint.
- **Emergency help** (`/emergency`) — "Emergency Help — Call 112" in the header and on the emergency page. It opens a confirmation dialog and only then a `tel:` link. The site never places or confirms a call. It also covers emergency contacts (phone verification needs a server-side provider), an emergency card with field-level sharing, location messages prepared on request, a readiness check, and a TEST MODE rehearsal that makes no calls or messages.
- **Care calendar** (`/care`) — preventive-care tasks you or your clinician enter. Nothing is scheduled automatically. Repeats happen only when you choose them. Reminders are in-app only.

## Voice assistant

`/assistant` adds a microphone button beside the text box. Opening the panel does **not** request the
microphone; pressing **Start listening** does. Typed and spoken questions use the same authenticated,
profile-scoped assistant pipeline.

**What works without any credentials (the default)**

- Browser speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`, most Chromium browsers and
  Safari) and browser speech synthesis (`speechSynthesis`), preferring `en-IN` / `hi-IN` voices when installed.
- Every state has visible text and a polite live region: idle, waiting for permission, listening,
  processing, speaking, error, permission denied and unsupported browser.
- Live interim transcript, completed transcript, stop-and-ask, interrupt, replay, mute and switch-to-text.
  Mute is remembered in `localStorage`.
- Failures handled explicitly: blocked permission, no microphone, microphone busy, empty recording, no
  speech, unsupported browser, network failure, provider error, 30-second transcription timeout,
  45-second recording limit, and backgrounding the tab (recording discarded, speech stopped).
- Grounded answers list the report name, report date and the test, value and unit. Missing data returns an
  explicit “not in your uploaded records” limitation instead of a number; low-confidence extraction,
  ambiguous reports, missing source links, unverified values and provider fallback are shown as limitations.
- Emergency phrases (chest pain, breathing difficulty, stroke signs, self-harm, overdose, anaphylaxis …)
  escalate immediately to **112 / 108** before any model call. Destructive or sharing commands never execute
  and ask for confirmation. Clinician-verification sentences are replaced with a disclaimer, and generated
  numbers are checked against the profile's records and rejected when unsupported.
- English and Hindi throughout, including controls, emergency text, limitations and spoken answers. Hindi
  metric names (`हीमोग्लोबिन`, `ब्लड शुगर`, `रक्तचाप` …) resolve to the same records as their English names.

**Server-side speech (optional, requires a key)**

Set `VOICE_STT_PROVIDER=openai` and/or `VOICE_TTS_PROVIDER=openai`, then `VOICE_OPENAI_API_KEY` (or the
existing `OPENAI_API_KEY`). `VOICE_OPENAI_BASE_URL` points at any OpenAI-compatible endpoint. STT uses
`/audio/transcriptions` (`VOICE_STT_MODEL`, default `whisper-1`); TTS uses `/audio/speech`
(`VOICE_TTS_MODEL`, default `tts-1`) with per-language voices (`VOICE_TTS_VOICE_EN` / `VOICE_TTS_VOICE_HI`,
defaults `alloy` / `shimmer`). If a server provider is selected without a key, the app falls back to browser
speech and says so in the UI. Provider keys never reach the browser, and the provider is not hard-coded in
client code.

**Security and privacy**

- `/api/voice/transcribe` and `/api/voice/speak` require a session, reject cross-origin requests, apply a
  per-user rate limit and enforce MIME/size limits. `/speak` accepts a **message id**, not text: the server
  loads it with `profile.userId = session.user.id`, answers `404` for both missing and foreign messages, and
  returns `no-store` audio with a sandbox CSP.
- Raw audio is never written to disk, the database or logs. It exists in the request buffer only; audit rows
  contain provider, byte count, language and MIME type — never audio or transcript text. Transcripts are
  stored as chat messages until **Clear chat**; `/settings` and the voice panel both state this. The
  speech-friendly version of an answer (including low-confidence and ambiguity caveats) is stored with that
  message so server-side TTS speaks the same caveats the screen shows — never raw audio.
- Transcripts and uploaded document text are treated as untrusted input. The pipeline strips control/bidi
  characters, rejects empty or over-long input, screens prompt-injection phrases, places the question in an
  explicitly labelled `UNTRUSTED DATA` block, rebuilds sources from server-side context and verifies numeric
  claims. A spoken command can never bypass a confirmation step.
- Nothing is read aloud on page load. Speech starts only after the user enters voice mode and asks a question,
  or presses **Replay** / **Read aloud**; **Mute** and **Stop speaking** always win, including while a
  server audio response is still downloading.

**Automated tests**

`npm test` uses Node's built-in test runner through `tsx` (no test framework dependency) and covers:
authorization/ownership (including foreign profile and message ids), retrieval grounding and numeric-claim
rejection, Hindi and English grounding, emergency/negation detection, sensitive-action refusal, transcript
sanitisation and injection screening, rate limiting, provider configuration/secret exposure, error
classification and HTTP status mapping, spoken-text cleaning, and prompt construction.

---

## Family profiles, child mode and elder mode

`ProfileSwitcher` (header + `/family`) switches the active `HealthProfile`; **every query is scoped to it**,
so records, medicines, trends, chats and exports never mix between people.

- **Child profiles** show a `ChildModeNotice`: values are age-dependent, so the app explains that adult
  reference ranges do not apply and recommends paediatric review.
- **Elder profiles** get the accessibility bundle (larger controls, read-aloud on by default in the
  settings page) and a simplified dashboard ordering: today's doses first, then warnings.
- Relationship labels (`Self`, `Child`, `Parent`, `Spouse`, `Sibling`, `Caregiver`) are translated.
- Add / edit / delete profile flows are plain server actions with Zod validation and friendly errors.

---

## Data model

`User` → `HealthProfile` (self / child / elder) → `HealthRecord` → `LabResult` + `Medication` →
`DoseLog` + `HealthMetric`; plus `ChatMessage`, `DrugInteraction`, `UserPreferences`, `Session`,
`Consent`, `AuditLog`.

SQLite has no native enums, so state values are `String` columns whose allowed values live in
`src/types/domain.ts` and are enforced by Zod at every write. JSON-ish fields (`diagnosisTerms`,
`corrections`, `aiSummary`) are stored as JSON strings and parsed defensively
(`safeJsonArray`, `parseSummarySections`, `parseCorrectionCount`).

Schema ↔ FHIR R4 mapping is documented at the top of `prisma/schema.prisma` and implemented in
`src/lib/fhir/mappers.ts`: `toFhirPatient`, `toFhirObservation` (LOINC-coded, `status: final|amended`,
`interpretation` N/L/H/U), `toFhirMedicationRequest`, `toFhirDocumentReference`, `toFhirEncounter`,
`toFhirBundle`. `GET /api/export` returns one bundle per profile plus a notice that identifiers are demo
values.

---

## Configuration

Copy `.env.example` → `.env` (the first `npm run dev` does it for you). Every value has a working default,
so the file is optional for the demo.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `file:./prisma/dev.db` | SQLite file (resolved from the project root) |
| `SESSION_SECRET` | dev placeholder | Session token hashing — **change in production** |
| `UPLOAD_DIR` | `./data/uploads` | Document storage, deliberately outside `public/` |
| `MAX_UPLOAD_MB` / `NEXT_PUBLIC_MAX_UPLOAD_MB` | `10` | Server limit and client pre-flight check |
| `AI_PROVIDER` | `mock` | `mock` \| `openai` \| `azure-openai` \| `gemini` |
| `OPENAI_API_KEY` `OPENAI_BASE_URL` `OPENAI_MODEL` | empty | Required for `openai` (any OpenAI-compatible endpoint) |
| `GEMINI_API_KEY` `GEMINI_MODEL` | empty | Required for `gemini` |
| `AZURE_OPENAI_ENDPOINT` `AZURE_OPENAI_API_KEY` `AZURE_OPENAI_DEPLOYMENT` | empty | Azure deployments |
| `OCR_PROVIDER` | `mock` | `mock` \| `tesseract` \| `google-vision` \| `azure-vision` \| `aws-textract` |
| `GOOGLE_VISION_API_KEY` / `AZURE_VISION_ENDPOINT` + `AZURE_VISION_KEY` | empty | Hosted OCR credentials |
| `INTERACTION_PROVIDER` | `demo` | `demo` (seeded dataset) \| `rxnav` (public NLM RxNorm API) |
| `RXNAV_BASE_URL` | `https://rxnav.nlm.nih.gov/REST` | Point the RxNorm adapter at a mirror/proxy |
| `ABDM_MODE` | `demo` | `demo` \| `sandbox` \| `production` — gates how ABHA linking may be described; this build makes no ABDM calls |
| `VOICE_STT_PROVIDER` / `VOICE_TTS_PROVIDER` | `browser` | `browser` \| `openai` \| `none` (text-only); a server provider without a key falls back to browser and is reported |
| `VOICE_OPENAI_API_KEY` / `VOICE_OPENAI_BASE_URL` | empty | Speech-only key/base URL; fall back to `OPENAI_API_KEY` / `OPENAI_BASE_URL` |
| `VOICE_STT_MODEL` / `VOICE_TTS_MODEL` | `whisper-1` / `tts-1` | Models sent to the OpenAI-compatible speech endpoints |
| `VOICE_TTS_VOICE` / `_EN` / `_HI` | empty / `alloy` / `shimmer` | Shared override, then per-language voices |
| `VOICE_MAX_RECORDING_SECONDS` / `VOICE_MAX_AUDIO_MB` | `45` / `8` | Client recording cap and server upload cap |
| `VOICE_MAX_SPEAK_CHARS` / `VOICE_MAX_QUESTION_CHARS` | `1500` / `400` | Spoken-answer and transcript limits |

An unconfigured or failing provider **degrades to the demo provider instead of erroring**, and every
surface shows *which* provider answered (e.g. “Demo AI (built-in, factors only your records)”) — the UI
never implies a real model or a live ABDM connection when there isn't one.

---

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | `predev` first-run setup, then `next dev` (bind `0.0.0.0` with `--hostname 0.0.0.0`) |
| `npm run build` | `prisma generate && next build` |
| `npm start` | `next start` (production) |
| `npm run typecheck` | `tsc --noEmit` — **0 errors is the bar** |
| `npm run setup` | generate + `db push` + seed |
| `npm run db:push` / `db:seed` / `db:reset` / `db:studio` | schema, seed, wipe-and-reseed, Prisma Studio |
| `npm test` | Node test runner (`node --import tsx --test`) for the voice, grounding and authorization suites |

---

## Known limitations — what is deliberately not real

Stated plainly so nobody demos this as something it is not:

- **OCR is mocked.** `MockOcrProvider` returns realistic sample document text chosen from the file name
  and the selected document type, then the regex parser (`src/lib/ocr/parser.ts`) extracts from it. No
  pixels are read, and no vendor call is made. Confidence is a stable 0.82–0.91.
- **AI is a deterministic reasoner**, not an LLM: it computes ranges, deltas and comparisons from your
  stored rows and templates the language. Same input → same answer, which is what you want in a demo.
- **The interaction dataset is 9 seeded pairs** covering the demo medicines, matched through medicine-name
  normalisation. `INTERACTION_PROVIDER=rxnav` demonstrates a real public source (NLM RxNorm) with an
  explicit “not clinically verified” caveat.
- **ABHA/ABDM is not connected.** Only the identifier format (Verhoeff checksum validation), masking and
  FHIR mapping exist. No network call, no PHR address resolution, no consent request is ever sent.
- **Login is demo auth.** Email (and optional ABHA ID) creates/loads a local account; there is no OTP,
  Aadhaar or biometric verification, and no password hashing to a real IdP.
- **Browser tab titles stay English** — each page sets `metadata.title` once; the visible UI is fully
  localised, but `<title>` is not (a mechanical `generateMetadata` change per page if you want it).
- Single-node SQLite, no queue/retry for OCR jobs, no push notifications (the “reminders” list is derived
  from dose slots, not an alarm), and no clinical validation of the seeded values (they are fictional).
- **Voice providers are not bundled.** Browser speech needs browser support (and, for recognition, usually a
  network connection); server speech needs your own OpenAI-compatible key. The routes were verified end-to-end
  against a local OpenAI-compatible stub, not a live vendor key. Hindi quality depends on the installed
  `hi-IN` browser voice or the configured provider voice; when no suitable voice exists the answer stays on
  screen and the UI explains the limitation.
- Voice input is push-to-talk (no wake word/hands-free mode), and rate limits are **in-memory per server
  process**, not a distributed limiter. A multi-instance deployment needs Redis (or similar) for shared limits.
- Browser speech recognition may send audio to the browser vendor (for example, Chrome's speech service);
  server transcription sends it to your configured provider. Both are disclosed in the panel. The app itself
  stores no raw audio, only the transcript as part of the chat history.

---

## How to replace mock OCR with production OCR

The interface is already the vendor boundary — `src/lib/ocr/types.ts`:

```ts
export interface OcrProvider {
  readonly name: string;
  readonly isMock: boolean;
  extractTextFromImage(input: OcrInput): Promise<OcrTextResult>;
  extractTextFromPdf(input: OcrInput): Promise<OcrTextResult>;
  extractStructuredFields?(input: OcrInput): Promise<Partial<ExtractedDocument> | null>;
}
```

**1. Implement an adapter** in `src/lib/ocr/providers/google-vision.ts` (create the `providers/` folder):

```ts
import type { OcrInput, OcrProvider, OcrTextResult } from "../types";

export class GoogleVisionOcrProvider implements OcrProvider {
  readonly name = "Google Cloud Vision";
  readonly isMock = false;

  async extractTextFromImage({ buffer }: OcrInput): Promise<OcrTextResult> {
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [{
            image: { content: buffer.toString("base64") },
            // DOCUMENT_TEXT_DETECTION handles photos of prescriptions; TEXT_DETECTION for scans.
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["en", "hi"] },
          }],
        }),
      },
    );
    if (!res.ok) throw new Error(`Vision API ${res.status}`);
    const json = (await res.json()) as any;
    const annotation = json?.responses?.[0]?.fullTextAnnotation;
    const pages = json?.responses?.[0]?.textAnnotations?.length ? 1 : 0;
    return {
      text: annotation?.text ?? "",
      // Vision exposes a per-page confidence — never invent one.
      confidence: annotation?.pages?.[0]?.confidence ?? 0.5,
      provider: this.name,
      pageCount: pages,
      warnings: annotation ? [] : ["No text detected — retake the photo in better light."],
      failed: !annotation,
    };
  }

  async extractTextFromPdf() {
    // Option A: PDF_TEXT_DETECTION with a gRPC client.
    // Option B: rasterise with pdf-to-png-converter, then reuse extractTextFromImage per page.
    throw new Error("implement PDF path or rasterise first");
  }
}
```

**2. Register it** in `src/lib/ocr/index.ts` — replace the `case "google-vision"` stub:

```ts
case "google-vision":
  cached = new GoogleVisionOcrProvider();
  return cached;
```

**3. Set the environment:** `OCR_PROVIDER=google-vision` + `GOOGLE_VISION_API_KEY=…`. Nothing else
changes: `readDocument()` still runs `parseDocument()` on the returned text, so the review screen,
corrections, lab parsing, metric rows and FHIR export all start working on real text automatically.

**4. Optional — skip the regexes.** Vendors with document understanding (Azure Document Intelligence
*prebuilt/Read* or *custom* prescription model, AWS Textract Analyze ID, GPT-4o vision) can implement
`extractStructuredFields()` and return `{ medicines, labValues, recordDate, doctorName, facilityName }`
directly; `readDocument()` already prefers structured fields when present and merges them with the parser
output. That is the single biggest accuracy win, because `ExtractedLabValue.referenceRange` then comes
from the table cells rather than a regex.

**Also worth doing for a real deployment**

- **Accuracy:** evaluate against your own corpus — add a `/scripts/ocr-eval.ts` harness with 30–50
  labelled Indian prescriptions/lab reports and track per-field precision/recall before switching the
  default provider.
- **Throughput:** make OCR asynchronous. `HealthRecord.status` already has `PROCESSING`/`READY`/
  `NEEDS_REVIEW`/`FAILED`, so move the `readDocument()` call to a queue (SQS/BullMQ/Inngest), store
  `rawText` + `extraction` when the job finishes, and let `/records/[id]` poll or stream the result.
- **Multilingual:** Hindi prescriptions mix Devanagari and Latin; keep `languageHints: ["en","hi"]` and
  extend `normalizeDrugName()` in `src/lib/interactions/normalize.ts` for transliterated names.
- **Privacy:** vendor DPA + no-training clause, encrypt `data/uploads` at rest, strip EXIF/GPS before
  storage, and send only the bytes the user uploaded (never the DB row).
- **Cost control:** size/compression pre-processing, per-user daily budget, and a `provider` +
  `confidence` column (already present) on every record for billing and audit.

---

## How to replace mock AI with production AI

Two providers are **already implemented** in `src/lib/ai/` — `OpenAIHealthProvider` (works with any
OpenAI-compatible endpoint: OpenAI, Azure OpenAI, OpenRouter, Groq, or a self-hosted vLLM/Ollama) and
`GeminiHealthProvider`. So this is normally a config change, not a code change:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-…
OPENAI_MODEL=gpt-4o-mini          # or OPENAI_BASE_URL for a proxy / self-hosted model
```

`getHealthAIProvider()` picks it up; every UI label that says “Demo AI” flips to the real provider name
because the name comes from the provider, not from a string in a component.

**Interface and grounding contract** (`src/lib/ai/types.ts`):

```ts
export interface HealthAIProvider {
  readonly name: string;
  readonly isMock: boolean;
  generateSummary(req: SummaryRequest): Promise<SummaryResponse>;  // { summary: HealthSummarySections, provider, isMock }
  answerQuestion(req: QuestionRequest): Promise<QuestionResponse>; // { content, sources[], grounded, intent, … }
  explainMedicalTerm(term: string, language: Language): Promise<string>;
}
```

The context handed to the model is built by `getAIContext()` (`src/lib/database/queries.ts`) — only the
active profile's records, labs, medicines and metric summaries. Add a provider by implementing that
interface in `src/lib/ai/your-provider.ts` and adding one `case` to the switch.

**Hardening it for production** (each item already has a hook in this codebase):

1. **Force JSON output.** `SummaryResponse.summary` holds the same sections that are stored in
   `HealthRecord.aiSummary` (`whatItSays`, `looksNormal[]`, `needsAttention[]`, `termExplanations[]`,
   `discussWithDoctor[]`, `plainSummary`) — use structured outputs / `response_format`, add a matching Zod
   schema in `src/lib/validation.ts` (the shape already exists as `HealthSummarySections` in
   `src/types/domain.ts`), and retry once on invalid JSON.
2. **Keep refusal behaviour.** If the answer is not in the provided context, return
   `grounded: false` with *“I couldn't find that information in your uploaded records.”* — the mock does
   this and `answerQuestionSafely()` treats it as the contract, not a fallback.
3. **Sources, always.** `ChatMessage.sources` stores record ids; render them as chips that link to
   `/records/[id]`. Reject/annotate any answer whose cited ids are not in the request context.
4. **Safety filter as a second layer.** Both hosted providers already run `containsUnsafeClaim()` over the
   generated text and append `SAFETY_PHRASES.discuss` / `.notDiagnosis` when a sentence reads like a diagnosis
   (`src/lib/ai/openai-provider.ts`, `src/lib/ai/gemini-provider.ts`). Extend `FORBIDDEN_ANSWER_PATTERNS` with
   imperative dosing verbs as new phrasing appears, and keep the global disclaimer independent of model wording.
5. **Bilingual by instruction, not by machine translation** — the prompt asks for Hindi when
   `lang === "hi"`, matching the mock's behaviour.
6. **Degradation and cost.** `withFallback()` already degrades to the deterministic mock on any provider
   error and marks `fallbackReason: "provider-unavailable"`. Add timeouts, per-user token budgets,
   streaming for chat, and cache summaries keyed on `(recordId, extractionHash)`.
7. **Data protection.** Send the minimum necessary (drop names/ABHA numbers — `getAIContext()` keeps them
   out today), disable provider training/retention, log prompts *without* values to your own audit store,
   and never put a chat transcript in application logs.

---

## How to integrate official ABHA / ABDM services

Everything on the app side is ready: `HealthProfile` carries ABHA-facing fields, `src/lib/fhir/abha.ts`
validates and masks the number, and `src/lib/fhir/mappers.ts` produces R4 resources. **This build makes
zero ABDM network calls and never transmits an ABHA number.** Here is the path to a real integration.

**0. Get approval first (not a code task).** Register as an ABDM Health Data User / provider on the ABDM
platform, sign the data-recipient terms, and obtain sandbox then production `client_id` /
`client_secret` from the ABDM network administrator. ABHA authentication and record access are gated on
that onboarding — a hackathon build must not claim it.

**1. ABHA authentication (instead of the demo login).** The flow you will implement in
`src/lib/actions/auth.ts` (keep the session model, mark `abhaLinked` only after step 2):

- *ABHA with Aadhaar OTP* or *ABHA with Driving Licence/mobile OTP* → `POST /v3/abha/enrollment/otp`,
  then `POST /v3/abha/enrollment/verify-otp` on the **NH/ABDM auth server**, with the user present on the
  same device (the OTP must never traverse your server as a stored value).
- *ABHA login (PHR address)* → OAuth 2.0 authorization-code + PKCE against the ABDM Authorisation Server
  (`/oauth/authorize`, `/oauth/token`), scopes `openid abha-number profile`.
- Store `sub`/ABHA number hashed or encrypted (`User.abhaNumber` is a plain column today; add
  `abhaNumberHash` for lookups and encrypt the display value with KMS). `maskAbhaNumber()` already
  produces the `12-3456-789012-30` masked rendering used in the UI.

**2. Consent artefacts (the real work).** ABDM record access is consent-first:

1. `POST /v1/health-information/consent/request` with `purposeOfUse: "PAID_CLINICAL_CARE"` (or
   `BENEFITS-ASSURANCE`/`PATIENT_AND_CAREGIVER_AWARENESS Portal` for the personal-health use case), the
   ABHA `patient` reference, `hiTypes` (`Diagnostic reports`, `Prescription`) and a date window.
2. The patient approves in the **ABDM Health Locker / ABHA app**; you poll
   `GET /v1/health-information/consent/fetch-status` and only proceed on `GRANTED`.
3. `POST /v1/health-information/cm/request` (HIP callback) → artefact id + `cmId`; exchange
   `POST /v1/health-information/hip/data` for **encrypted, signed** FHIR bundles; decrypt with your key
   pair, verify the HIP signature, then `POST …/consent/record-use-notification` (audit of every artefact
   use — required).
4. Store the artefact with its expiry, honour `DECLINED`/`EXPIRED` by deleting derived rows, and expose
   “revoke consent” in `/settings`. `Consent` is intentionally minimal today (`purpose`, `status
   GRANTED|REVOKED|EXPIRED`, `version`); add `artefactId`, `requestId`, `hiTypes`, `purposeOfUse`,
   `fromDate`/`toDate` and `expiresAt` for the real flow.

**3. Sync records into the existing tables.** The FHIR resources you receive map straight back onto this
schema: `Observation` → `LabResult` (+ `HealthMetric` via `metricKeyForTestName()` for LOINC-coded
panels), `DocumentReference`/`DiagnosticReport` → `HealthRecord`, `MedicationRequest`/
`MedicationStatement` → `Medication`, `Encounter` → visit records. Tag them with a `source` so the UI can
say *“Imported from ABHA”* vs *“Uploaded by you”* — never silently overwrite a user-verified record;
`LabResult.status` + `HealthRecord.corrections` already give you the review trail to re-use.

**4. Push your own records out (optional, for the write path).** Register a Facility, then call the
HIP APIs to push `DiagnosticReport`/`DocumentReference` bundles built by `toFhirBundle()` —
`/api/export` already assembles them, so a “share to ABHA” button is the same payload plus the consent +
signature dance in reverse.

**5. Hard requirements before production:** mTLS/HMAC signatures per ABDM spec, secrets in a vault (never
`.env` on a PaaS), field-level encryption at rest, an immutable consent/audit log, data residency in
India, DPDP Act 2023 notice + purpose limitation, error/`HIU` retry semantics with idempotent artefact
handling, an emergency access break-glass flow that is itself audited, and **rate/abuse limits on record
fetches**. `ABDM_MODE` is already the gate: `abdmMode()` +
`abhaLinkStatus()` in `src/lib/fhir/abha.ts` compute the settings-page status server-side, and `demo` mode can
never report “verified”. Keep the `ABDM_DEMO_NOTICE` string on every screen while `ABDM_MODE=demo` — the badge
must never overstate status.

**6. Test ladder:** ABDM **sandbox** (Network + Health Locker sandboxes) → a consent flow with a test
ABHA number → verify decryption + signature on real `hiType` payloads → production onboarding review.
Budget the certification work at weeks, not hours; the UI layer is the easy part.

---

## How to deploy this application

### A. Vercel (fastest, but SQLite cannot be used)

1. **Swap the database for Postgres** (Neon/Supabase/RDS):
   - `prisma/schema.prisma` → `provider = "postgresql"`; `DATABASE_URL` = connection string.
   - Delete the SQLite driver adapter in `src/lib/database/client.ts` and `prisma.config.ts`
     (`new PrismaClient({ adapter })` → plain client, or `@prisma/adapter-pg`), and change
     `generator client { engineType = "client" }` → remove it to use the default engine.
   - Re-create the schema as a migration: `npx prisma migrate dev --name init`, then
     `npx prisma migrate deploy` in the release step (`prisma db push` is for local/demo only).
   - `String` columns that hold JSON keep working; optionally promote them to `Json` + `@db.Text`.
   - The seed is dev-only — exclude `prisma/seed.ts` from production builds, or gate it on
     `NODE_ENV !== "production"`.
2. **Move uploads to object storage.** `data/uploads` is ephemeral on Vercel: implement
   `saveUploadedFile` / `readUploadedFile` / `removeUploadedFile` in `src/lib/uploads/storage.ts` against Vercel
   Blob or S3/R2 (presigned PUT from the client, and keep `/api/records/[id]/file` as the authorisation proxy so
   the bucket ACL stays private). Bump
   `MAX_UPLOAD_MB` + `experimental.serverActions.bodySizeLimit` together, and offload OCR to a queue or
   `waitUntil()` — serverless functions time out on long OCR jobs.
3. Env vars: everything from `.env.example` in Project Settings, with a **real**
   `SESSION_SECRET` (≥32 random bytes), and `NEXT_PUBLIC_MAX_UPLOAD_MB` matching the server limit.
4. Build command is already right: `npm run build` (`prisma generate && next build`). Add
   `NEXT_TELEMETRY_DISABLED=1`, verify `npm run typecheck` in CI, and set the cookie `secure`/`sameSite`
   attributes for HTTPS (in `src/lib/auth/session.ts`).
5. Check `next.config.ts` — `allowedDevOrigins` is dev-only, so no change; do add security headers
   (`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
   `Permissions-Policy: microphone=(), camera=(self)` for the camera capture), and `Cache-Control`
   hardening is already applied on the file route.

### B. Long-lived Node or Docker (keeps SQLite, simplest for a pilot)

```dockerfile
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json /app/prisma.config.ts ./
COPY --from=build /app/public ./public
RUN mkdir -p /data/uploads
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start -- --hostname 0.0.0.0 --port ${PORT:-3000}"]
```

```bash
docker run -p 3000:3000 \
  -e SESSION_SECRET="$(openssl rand -base64 48)" \
  -e DATABASE_URL="file:/app/prisma/prod.db" \
  -e UPLOAD_DIR=/data/uploads \
  -v phc-uploads:/data/uploads \
  health-copilot
```

- **Mount the SQLite file and `UPLOAD_DIR` on durable volumes** — they are the whole database; back both
  up together (`sqlite3 .backup` + a tar of uploads) so an uploaded PDF and its row never drift apart.
- Run `npx prisma migrate deploy` in the release step once you have a real migration history; put Nginx/
  Caddy in front for TLS, keep `next start --hostname 0.0.0.0`, and cap request bodies to
  `MAX_UPLOAD_MB` at the proxy too.
- Managed-VM alternatives that also keep SQLite: Railway, Fly.io (attach a volume), Render, or a small
  EC2/DigitalOcean box behind Cloudflare with the auth endpoints rate-limited.
- One process per DB writer: SQLite serialises writes, so keep `next start` single-instance (or move to
  Postgres before scaling horizontally).

### C. Pre-flight checklist for any real deployment

- [ ] `SESSION_SECRET` rotated; cookies `secure` + `sameSite=lax`; 30-day TTL reviewed
- [ ] Real Postgres, `migrate deploy` in CI, connection pooling (PgBouncer), backups + restore drill
- [ ] Private object storage + presigned or proxied downloads; encryption at rest; retention policy
- [ ] AI/OCR vendor keys scoped to least privilege, no-training toggle on, spend cap + alerting
- [ ] Audit log shipping (file route + consent changes) and an access-review report
- [ ] HTTPS only, HSTS, security headers, CSP for the PWA manifest, WAF/abuse limits on `/login`
- [ ] Legal/clinical review of every AI surface; the “not medical advice” banner must survive the redesign
- [ ] Emergency-contact and “seek urgent care” copy reviewed by a clinician before real patients
- [ ] Accessibility re-audit on the deployed build (screen reader + 200 %-zoom + keyboard-only pass)
- [ ] Status/health endpoint, uptime alerts, and a documented data-deletion path (DPDP right to erase)

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Pages 500 with `no such table: User` | `npm run setup` (schema + seed). `predev` only seeds when the DB file is missing/empty. |
| `better-sqlite3` node-gyp failure on install | Needs Python + a C++ toolchain and Node headers: `apt-get install -y python3 make g++` and, in containers without headers, `npm_config_nodedir=/usr/local npm install`. |
| `UnhandledSchemeError: Reading from "node:crypto"` | A client component imported a server-only module (`demo-seed.ts`, `uploads/storage.ts`). Import the client-safe twins (`src/lib/demo/account.ts`, `src/lib/uploads/limits.ts`) instead. |
| Prisma cannot download engine binaries (locked-down network) | Already handled: `engineType = "client"` + `engine: "js"` in `prisma.config.ts`. Keep `url = env("DATABASE_URL")` — the “url will NOT be used” warning from the CLI is expected with driver adapters. |
| `PRISMA_SKIP_POSTINSTALL_GENERATE=1 npm install`, then 500s | Run `npx prisma generate` afterwards — skipping the postinstall skips codegen. |
| Hindi text looks like Latin characters | Font fallback: the root layout loads a Devanagari-capable system stack; on minimal Linux images install `fonts-noto-core`. |
| Uploaded file not visible after refresh | It must live under `UPLOAD_DIR` and be owned by the active profile's user — check the ownership branch in `/api/records/[id]/file`; demo records intentionally have no file (404 with a friendly note). |
| Charts blank in production | Recharts needs a sized container; `TrendChart` uses `ResponsiveContainer` with a fixed `height` — don't drop it. |

---

## Medical disclaimer

⚠️ **This is not medical advice. Always consult a qualified doctor or pharmacist.**

This prototype is built for demonstration and educational purposes using fictional data. It does not
diagnose, prescribe, or replace clinical judgement, and it is not connected to any real health-record
system. In an emergency, contact local emergency services.
