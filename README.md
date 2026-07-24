# HireRadar

A multi-agent job-search product. It scrapes 800+ company career pages, ranks postings recency-first, evaluates fit against a per-user "truth store" using a cost-disciplined LLM pipeline, drafts application answers grounded in verified facts, and — only after explicit human approval — auto-submits to trusted ATS forms via Playwright.

**Live:** [hireradaar.web.app](https://hireradaar.web.app) · **API:** [hireradar-api.onrender.com](https://hireradar-api.onrender.com)

---

## What it does

- Scrapes 800+ companies across ATS platforms (Greenhouse, Lever, Workday, Ashby, SmartRecruiters, Taleo, Eightfold, ZohoRecruit, SAP) plus custom company APIs, JSON-LD, RSS, sitemap, and declarative-selector generic-HTML sources
- Every scraped job gets an identity hash (dedup) and a content hash (repost/refresh detection), plus a confidence-scored `postedAt` so listings sort recency-first instead of scrape-time-first
- Event-driven **Application pipeline**: after each scrape, a deterministic pre-filter creates `Application` records and enqueues them for evaluation — nothing is created or charged for on a GET request
- **Eligibility → Fit Scoring → Form Inspection → Resume Routing → Answer Drafting → Verification**, each stage deterministic-first; an LLM call only fires when the deterministic pass is genuinely ambiguous
- Answers are drafted only from a user's **Candidate Profile truth store** (`facts[]` with stable IDs) — the answer agent can cite facts, never invent them, and a verifier checks every claim resolves to a real, approved fact before an application reaches the approval queue
- **Approval Queue** UI: nothing is submitted anywhere without an explicit "Approve & Submit" / "Approve Draft" / "Skip" action from the user
- Controlled auto-submission via Playwright adapters (Greenhouse, Lever, Ashby) with screenshot-backed audit trail, CAPTCHA/login-wall detection (never bypassed — routes to `ACTION_REQUIRED` for the human), pause/resume via persisted browser session state, and a global `APPLY_DRY_RUN` kill switch that always wins over any per-platform auto-submit config
- Provider-neutral LLM layer (`server/src/llm/`) — Gemini is the only provider wired up today, chosen to stay inside its free tier; a self-imposed daily request cap is enforced before the provider's own quota ever gets hit
- Tracks applications per user with streaks, weekly/monthly charts, and a leaderboard
- Auto-scrapes every 2 hours via node-cron; admin can trigger manual scrapes
- Real-time server log terminal (admin only) streamed over SSE
- UptimeRobot pings the service's health endpoint every 5 min to keep Render's free tier awake

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, React Router 6, Vite, plain CSS (design-token based theming) |
| Backend | Node.js, Express |
| Database | MongoDB Atlas (Mongoose) |
| Queue | BullMQ on Redis (Upstash in production) |
| LLM | Google Gemini (`@google/genai`), behind a provider-neutral abstraction |
| Scraping / Automation | Axios + Cheerio, Playwright (Chromium) |
| Auth | JWT (bcrypt passwords) |
| Hosting | Firebase Hosting (frontend), Render free tier (backend — 1 service) |
| Scheduling | node-cron inside the API process |

---

## Architecture — one merged backend service

Everything runs in a single process/service (`hireradar-api`, entry point `src/cron.js`): the Express REST API, the scrape cron (every 2h), event-driven Application discovery after each scrape, and both BullMQ workers (pipeline evaluation + Playwright form-inspection/apply-adapters).

This used to be 3 separate Render services — API, `pipeline-worker`, `apply-worker` — deliberately split so a Playwright/Chromium crash or memory spike in the apply pipeline could never delay or take down job evaluation or the API. That isolation was real, but Render's free tier grants only **750 instance-hours per workspace per month**, shared across every service kept alive — and each service needed its own UptimeRobot monitor pinging every 5 min just to stop it spinning down after 15 min idle, so 3 always-on services cost roughly 3× a single service's worth of hours, blowing well past the 750h budget. Merged back into one service to fit the free tier; the trade-off is a Playwright OOM/crash can now take down the whole process (API included) rather than just the apply pipeline. Render auto-restarts a crashed process, so the practical cost is a brief availability blip, not data loss. Revisit (split back out, or move to a paid plan) if usage grows enough that this trade-off stops being acceptable.

Both workers are still plain importable `start()` functions (`src/workers/pipeline-worker.js`, `src/workers/apply-worker.js`) — `cron.js` just calls both alongside `app.listen()`. `npm run start:worker-dev` still exists for running just the two workers standalone (e.g. to test worker-only changes without the API), and each worker's own trivial health-check HTTP listener (`src/workers/healthServer.js`) still binds its own port (`PIPELINE_WORKER_PORT` / `APPLY_WORKER_PORT`) so the three listeners in one process don't collide — though only the main Express `/health` endpoint actually needs an UptimeRobot monitor now.

---

## Project structure

```
HireRadar/
├── client/
│   └── src/
│       ├── main.jsx              # BrowserRouter > ThemeProvider > AuthProvider > App
│       ├── App.jsx               # Route tree only — no owned business state
│       ├── auth.jsx               # useAuth hook + authFetch helper
│       ├── theme.jsx              # Dark/light theme, localStorage-persisted
│       ├── config/
│       │   └── features.js       # FEATURES.applications / candidateProfile flags
│       ├── routes/
│       │   ├── guards.jsx        # ProtectedRoute, PublicOnlyRoute, AdminRoute
│       │   └── PricingRoute.jsx
│       ├── layout/
│       │   ├── AppShell.jsx      # Sidebar + Outlet + mobile drawer
│       │   ├── Sidebar.jsx
│       │   └── PublicHeader.jsx
│       ├── hooks/
│       │   ├── useJobs.js  useApplications.js  useApplicationCounts.js  usePolling.js
│       ├── pages/
│       │   ├── JobsPage.jsx  JobDetail.jsx  ProgressPage.jsx
│       │   ├── CompaniesPageRoute.jsx  LeaderboardPageRoute.jsx  ProfilePageRoute.jsx
│       │   ├── TerminalPageRoute.jsx  LoginPageRoute.jsx  PricingPageRoute.jsx
│       │   ├── CandidateProfilePage.jsx   # Truth-store editor (skills/projects/facts)
│       │   ├── ApprovalQueuePage.jsx      # Bucketed application queue
│       │   ├── ApplicationDetail.jsx      # State timeline, approve/skip actions
│       │   └── AuditTrailPage.jsx         # Signed screenshots + answer trail
│       ├── components/
│       │   └── ActionRequiredResolver.jsx # Inline captcha/login/free-text resolver
│       └── styles/
│           └── tokens.css        # Design tokens — spacing, radius, type scale, palettes
│
├── server/
│   └── src/
│       ├── cron.js               # Express app + node-cron entry point (hireradar-api)
│       ├── index.js               # Scrape orchestrator — hashing, repost detection, discovery trigger
│       ├── config/
│       │   └── sources.js        # Company/source configs
│       ├── scrapers/
│       │   ├── ats/              # Greenhouse, Lever, Workday, Ashby, SmartRecruiters, Taleo, Eightfold, ZohoRecruit, SAP
│       │   ├── custom/           # Bespoke per-company scrapers
│       │   └── sources/          # json-ld.js, rss.js, sitemap.js, generic-html.js (declarative-selector driven)
│       ├── models/
│       │   ├── application.js         # 18-status state machine, formInspection, answers[], auditLog[]
│       │   ├── candidateProfile.js    # Truth store — facts[] with stable IDs
│       │   ├── resumeVariant.js
│       │   ├── applicationPolicy.js   # User-level decisions (thresholds, blocked companies, daily cap)
│       │   ├── pipelineConfig.js      # Admin operational config (confidence thresholds, per-ATS auto-submit)
│       │   └── llmUsage.js            # Daily LLM request accounting
│       ├── agents/
│       │   ├── pipeline.js       # runEvaluation / runPrepare / runPreparation
│       │   ├── eligibility.js  fitScoring.js  resumeRouting.js  answerAgent.js  verifier.js
│       │   └── computeTier.js    # AUTO / QUICK_APPROVE / DRAFT_ONLY / MANUAL
│       ├── llm/
│       │   ├── client.js  callStructured.js  modelRouter.js  usageLimiter.js  sanitize.js
│       │   ├── providers/gemini.js   # Only file importing @google/genai directly
│       │   └── prompts/*.prompt.js   # { system, buildUserPrompt, schema } per stage
│       ├── form-inspector/
│       │   └── inspect.js        # Platform/CAPTCHA/login-wall/field detection, expired-job detection
│       ├── apply-adapters/
│       │   ├── shared.js         # Screenshot redaction, fillField, idempotency, session persistence
│       │   └── greenhouse.js  lever.js  ashby.js
│       ├── queue/
│       │   ├── connection.js  queues.js
│       │   └── processors/pipelineProcessor.js  inspectionProcessor.js  applyProcessor.js
│       ├── workers/
│       │   ├── pipeline-worker.js  apply-worker.js  worker-dev.js
│       │   └── healthServer.js   # Trivial HTTP listener so Render's web-service check passes
│       ├── routes/
│       │   ├── jobs.js  auth.js  profile.js  admin.js
│       │   ├── profile-candidate.js  resumes.js  applications.js
│       ├── middleware/
│       │   └── auth.js
│       └── utils/
│           ├── db.js  filter.js  logger.js
│           ├── canonicalize.js  recency.js  parseRelativeDate.js
│           ├── applicationState.js   # Allowed-transition map for the Application state machine
│           ├── applicationDiscovery.js
│           └── screenshotSigning.js  # HMAC-signed, user-bound, short-lived screenshot URLs
│
└── render.yaml               # Single-service Blueprint (hireradar-api — API + cron + both BullMQ workers, in-process)
```

---

## Local setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas URI (free tier works)
- Redis (local install, or a hosted instance like Upstash)
- A Gemini API key ([aistudio.google.com](https://aistudio.google.com)) — free tier is enough for personal use

### Backend

```bash
cd server
cp .env.example .env
# Fill in MONGO_URI, JWT_SECRET, REDIS_URL, GEMINI_API_KEY, SCREENSHOT_SIGNING_SECRET
npm install
npm run dev
```

API runs on `http://localhost:5000` — `npm run dev` already starts both BullMQ workers in-process too (matches production topology), so no separate worker processes are needed.

To run just the workers standalone (e.g. testing worker-only changes without the API):

```bash
npm run start:worker-dev   # both pipeline-worker and apply-worker in one process
```

Or as fully separate processes:

```bash
npm run start:pipeline-worker
npm run start:apply-worker
```

### Frontend

```bash
cd client
cp .env.example .env
# Set VITE_API_URL= (leave blank for local proxy)
npm install
npm run dev
```

Runs on `http://localhost:3000`. The Vite proxy forwards API paths to port 5000.

---

## Environment variables

### Server (`server/.env`)

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `PORT` | Optional, defaults to 5000 |
| `REDIS_URL` | BullMQ backend. Use `rediss://` (TLS) for Upstash |
| `PIPELINE_CONCURRENCY` / `APPLY_CONCURRENCY` / `INSPECTION_CONCURRENCY` | Per-queue worker concurrency |
| `APPLY_DRY_RUN` | `true` by default — dry-run always wins over any per-ATS auto-submit config. Adapters stop before the final submit click and write `DRY_RUN_COMPLETED`, never `SUBMITTED` |
| `PIPELINE_WORKER_PORT` / `APPLY_WORKER_PORT` | Disambiguates each in-process worker's own trivial health-check HTTP listener from the API's `PORT` and from each other, since all three now share one process/service |
| `SCREENSHOT_SIGNING_SECRET` | HMAC secret for signed audit-trail screenshot URLs |
| `LLM_PROVIDER` | Currently only `gemini` is registered |
| `GEMINI_API_KEY` | Gemini API key |
| `LLM_MODEL_FAST` / `LLM_MODEL_QUALITY` | Per-tier model names (see `agents/modelRouter.js`'s `STAGE_TIER` map) |
| `LLM_DAILY_REQUEST_LIMIT` | Self-imposed daily cap, enforced before Gemini's own quota |
| `PREPARE_APPLICATIONS_AUTOMATICALLY` | `false` by default — answer generation only starts on explicit `POST /applications/:id/prepare`, never automatically for every recommended job |

### Client (`client/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL in production (e.g. `https://hireradar-api.onrender.com`) — leave blank for local dev |
| `VITE_FEATURE_APPLICATIONS` / `VITE_FEATURE_CANDIDATE_PROFILE` | Flip to `false` to hide those surfaces without a code change |

---

## Deployment

### Frontend — Firebase Hosting

```bash
cd client
npm run build
firebase deploy --only hosting
```

### Backend — Render (Blueprint, single service)

`render.yaml` defines the one `hireradar-api` service. Deploy via Render's **New → Blueprint** flow (not a plain per-service dashboard setup — a git push alone won't create new services unless the existing service is already Blueprint-linked).

The build command deliberately omits `--with-deps`:
```
npm install && PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/.browsers npx playwright install chromium
```
`--with-deps` requires root/`apt-get`, which Render's build sandbox doesn't grant — it fails with `su: Authentication failure` if added back.

Set every `sync: false` env var (`MONGO_URI`, `JWT_SECRET`, `REDIS_URL`, `GEMINI_API_KEY`, `SCREENSHOT_SIGNING_SECRET`) in the dashboard.

Add one UptimeRobot HTTP(s) monitor (5 min interval) so the service doesn't sleep after 15 min idle:
```
https://hireradar-api.onrender.com/health
```
Don't point a monitor at `/jobs` — it requires auth and will always read as down.

If migrating from the old 3-service split: delete the `hireradar-pipeline-worker` and `hireradar-apply-worker` services (and their UptimeRobot monitors) from the dashboard once the merged service is confirmed working — leaving them running idle still burns the shared 750h/month workspace budget.

---

## Adding a new company

Open `server/src/config/sources.js`. Most companies are a single line:

```js
// Greenhouse
{ company: 'Notion', ats: 'greenhouse', greenhouseToken: 'notion' },

// Lever
{ company: 'CRED', ats: 'lever', leverToken: 'cred' },

// Workday
{ company: 'Adobe', ats: 'workday', workdayBase: 'https://adobe.wd5.myworkdayjobs.com', workdayTenant: 'adobe', workdaySite: 'external_experienced' },

// Ashby
{ company: 'Linear', ats: 'ashby', ashbySlug: 'linear' },

// SmartRecruiters
{ company: 'Canva', ats: 'smartrecruiters', smartrecruitersSlug: 'Canva' },
```

For a company career page that isn't behind a known ATS, add a `GENERIC_HTML` source with a declarative selector config instead of writing a bespoke scraper:

```js
{
  company: 'Acme',
  sourceType: 'GENERIC_HTML',
  listUrl: 'https://acme.com/careers',
  selectors: { jobCard: '.job-card', title: '.job-title', location: '.job-location', url: 'a', postedAt: '.job-date' },
}
```

---

## Smart Filter

The scoring engine lives in `server/src/utils/filter.js`. Each user can override every list from their Profile page — changes take effect on the next `/jobs` fetch. This same deterministic scorer is reused as the free, zero-LLM pre-filter that decides which scraped jobs become `Application` candidates at all.

| Signal type | Points | Examples |
|---|---|---|
| Boost keywords | +3 | react, typescript, frontend, nextjs |
| Junior signals | +2 | junior, entry level, sde i, new grad |
| Suppress keywords | −3 | backend, devops, android, ml |
| Title exclusion | hard drop | senior, staff, manager, director |
| Location mismatch | hard drop | non-India/non-remote locations |

---

## The application pipeline

```
DISCOVERED → EVALUATING → READY_FOR_PREPARATION → INSPECTING_FORM → PREPARING → READY_FOR_APPROVAL
    → APPROVED → APPLYING → SUBMITTED
```
(plus `REJECTED`, `SKIPPED`, `ACTION_REQUIRED`, `DRY_RUN_COMPLETED`, `SUBMISSION_UNCONFIRMED`, `SUBMISSION_BLOCKED`, `CANCELLED`, `EXPIRED`, `FAILED` — see `server/src/utils/applicationState.js` for the full allowed-transition map)

1. **Discovery** — event-driven, runs after every scrape. Never triggered by a GET.
2. **Evaluation** — deterministic eligibility + fit-scoring first; LLM only for genuinely ambiguous free text. Passing jobs land in the Approval Queue as `READY_FOR_PREPARATION` — a recommendation, nothing more.
3. **Prepare** (`POST /applications/:id/prepare`, explicit user action only) — form inspection, then resume routing → answer drafting → verification. The answer agent may only cite stable fact IDs from the user's Candidate Profile; the verifier rejects anything that doesn't resolve to an approved fact.
4. **Approval** — the user chooses "Approve & Submit", "Approve Draft", or "Skip". `REJECTED` is written by the pipeline itself (stage 2) and shown read-only with its reasons; there is no user-facing reject button.
5. **Submission** — Playwright adapter fills the form, screenshots with sensitive fields blanked first, and requires two independent positive confirmation signals before writing `SUBMITTED`. A CAPTCHA or login wall always routes to `ACTION_REQUIRED` for a human — never bypassed.

---

## Scraping coverage

800+ companies across Greenhouse, Ashby, SmartRecruiters, Lever, Workday, Taleo, Eightfold, ZohoRecruit, SAP, custom company APIs, and generic JSON-LD/RSS/sitemap/HTML sources.

Companies include: Postman, PhonePe, Stripe, Razorpay, Groww, Figma, Notion, Linear, Supabase, Vercel, Datadog, Discord, Airbnb, Dropbox, Meesho, CRED, Spotify, Canva, Freshworks, Adobe, Cisco, Nvidia, PayPal, Salesforce, Anthropic, IBM, Amazon, Accenture, and more.
