# HireRadar

A personal job aggregator that scrapes 78 company career pages, filters them for frontend/junior roles in India, and surfaces the best matches — ranked by a configurable scoring engine.

**Live:** [hireradaar.web.app](https://hireradaar.web.app) · **API:** [hireradar-sl0g.onrender.com](https://hireradar-sl0g.onrender.com)

---

## What it does

- Scrapes 78 companies across 6 ATS platforms (Greenhouse, Lever, Workday, Ashby, SmartRecruiters, Taleo) + custom APIs + Playwright for JS-heavy pages
- Smart Filter ranks jobs by keyword scoring — frontend/React signals up, backend/devops signals down — and hard-drops senior/non-eng titles
- Every user configures their own filter rules from a Profile page (location allowlist, title exclusions, boost/suppress keywords, score threshold)
- Tracks applications per user with streaks, weekly/monthly charts, and a leaderboard
- Auto-scrapes every 2 hours via node-cron; admin can trigger manual scrapes
- Real-time server log terminal (admin only) streamed over SSE
- UptimeRobot pings `/health` every 5 min to keep the Render free tier awake

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, plain CSS |
| Backend | Node.js, Express |
| Database | MongoDB Atlas (Mongoose) |
| Scraping | Axios + Cheerio, Playwright (Chromium) |
| Auth | JWT (30-day tokens, bcrypt passwords) |
| Hosting | Firebase Hosting (frontend), Render free tier (backend) |
| Scheduling | node-cron inside the Express process |

---

## Project structure

```
HireRadar/
├── client/                  # React frontend
│   ├── src/
│   │   ├── App.jsx          # Root — routing, job fetch, header
│   │   ├── auth.jsx         # useAuth hook + authFetch helper
│   │   └── components/
│   │       ├── JobTable.jsx
│   │       ├── StatsPanel.jsx
│   │       ├── CompaniesPage.jsx
│   │       ├── Leaderboard.jsx
│   │       ├── ProfilePage.jsx   # Per-user filter config
│   │       ├── TerminalPage.jsx  # Live SSE log stream (admin)
│   │       └── AuthScreen.jsx
│   ├── .env                 # VITE_API_URL (not committed)
│   └── vite.config.js
│
├── server/
│   ├── src/
│   │   ├── cron.js          # Express app + node-cron entry point
│   │   ├── index.js         # Scrape orchestrator
│   │   ├── config/
│   │   │   └── sources.js   # All 78 company configs
│   │   ├── routes/
│   │   │   ├── jobs.js      # /jobs — filtered + raw
│   │   │   ├── auth.js      # /auth/login, /auth/signup
│   │   │   ├── profile.js   # /profile — user prefs
│   │   │   └── admin.js     # /admin/scrape, /admin/logs (SSE)
│   │   ├── middleware/
│   │   │   └── auth.js      # requireAuth, JWT sign
│   │   └── utils/
│   │       ├── db.js        # Mongoose models
│   │       ├── filter.js    # Scoring engine + DEFAULTS
│   │       └── logger.js    # Console patch + circular log buffer
│   └── .env                 # MONGO_URI, JWT_SECRET (not committed)
│
└── render.yaml              # Render deployment config
```

---

## Local setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas URI (free tier works)

### Backend

```bash
cd server
cp .env.example .env
# Fill in MONGO_URI and JWT_SECRET in .env
npm install
npm run dev
```

Runs on `http://localhost:5000`.

### Frontend

```bash
cd client
cp .env.example .env
# Set VITE_API_URL= (leave blank for local proxy)
npm install
npm run dev
```

Runs on `http://localhost:3000`. The Vite proxy forwards `/jobs`, `/auth`, `/admin`, `/profile` to port 5000.

---

## Environment variables

### Server (`server/.env`)

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret for signing JWTs — use a long random string in prod |
| `PORT` | Optional, defaults to 5000 |

### Client (`client/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL in production (e.g. `https://hireradar-sl0g.onrender.com`) — leave blank for local dev |

---

## Deployment

### Frontend — Firebase Hosting

```bash
cd client
npm run build
firebase deploy --only hosting
```

### Backend — Render

Push to `main` → Render auto-deploys via `render.yaml`.

Build command installs Playwright's Chromium binary:
```
npm install && PLAYWRIGHT_BROWSERS_PATH=/opt/render/project/.browsers npx playwright install chromium
```

Required env vars to set in the Render dashboard: `MONGO_URI`, `JWT_SECRET`.

---

## Adding a new company

Open `server/src/config/sources.js`. The comment at the top explains how to identify the ATS in 60 seconds. Most companies are a single line:

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

---

## Smart Filter

The scoring engine lives in `server/src/utils/filter.js`. Each user can override every list from their Profile page — changes take effect on the next `/jobs` fetch.

| Signal type | Points | Examples |
|---|---|---|
| Boost keywords | +3 | react, typescript, frontend, nextjs |
| Junior signals | +2 | junior, entry level, sde i, new grad |
| Suppress keywords | −3 | backend, devops, android, ml |
| Title exclusion | hard drop | senior, staff, manager, director |
| Location mismatch | hard drop | non-India/non-remote locations |

Jobs below the user's score threshold are hidden when Smart Filter is ON. Toggle it off to see all raw scraped jobs.

---

## Scraping coverage

78 companies across: Greenhouse (44), Ashby (12), SmartRecruiters (5), Lever (4), Workday (7), Taleo (1), Custom API (2), Playwright (1).

Companies include: Postman, PhonePe, Stripe, Razorpay, Groww, Figma, Notion, Linear, Supabase, Vercel, Datadog, Discord, Airbnb, Dropbox, Meesho, CRED, Spotify, Canva, Freshworks, Adobe, Cisco, Nvidia, PayPal, Salesforce, and more.
