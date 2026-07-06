# Cashflow Coaches Voice Mining

Market intelligence SaaS for coaches and course creators. Enter a keyword, and the app scrapes real online conversations across 10 sources, extracts the exact language your market uses, and turns it into a full report: viral hooks, ads, Skool posts, video scripts, email sequences, YouTube ideas, and competitor intelligence.

**Fully self-owned stack — no platform dependencies.** You control the code, the database, the auth, and the AI keys.

## Stack

- **Frontend:** Vite + React 19 + TypeScript + TailwindCSS + shadcn/ui + tRPC client + Recharts
- **Backend:** Node.js + Express + tRPC 11 + Drizzle ORM + MySQL
- **Auth:** Google sign-in (your own Google Cloud OAuth app) + self-signed JWT session cookies
- **AI:** Anthropic API directly (`@anthropic-ai/sdk`), model configurable via `ANTHROPIC_MODEL`
- **Scraping:** SerpAPI (7 engines), YouTube Data API v3, NewsAPI, Twitter/X API v2
- **Cron:** any external cron service (e.g. cron-job.org) hitting a secret-protected endpoint

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection string, e.g. `mysql://user:pass@host:4000/voicemining?ssl={"rejectUnauthorized":true}` |
| `SESSION_SECRET` | Long random string used to sign session JWTs (`openssl rand -hex 32`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 web client credentials |
| `ANTHROPIC_API_KEY` | Anthropic API key — powers all report generation |
| `ANTHROPIC_MODEL` | Claude model ID (default `claude-opus-4-8`; set `claude-sonnet-5` to cut cost) |
| `SERP_API_KEY` | SerpAPI — Google/Bing/DuckDuckGo/Discussions/News/Yelp/Amazon + competitor scan + keyword suggestions |
| `YOUTUBE_API_KEY` | YouTube Data API v3 (video search + comments) |
| `NEWS_API_KEY` | NewsAPI headlines |
| `TWITTER_BEARER_TOKEN` | Twitter/X recent search |
| `CRON_SECRET` | Shared secret the cron service must send as `Authorization: Bearer <secret>` |
| `ADMIN_EMAIL` | Google account email that gets the admin role on sign-in (optional) |
| `NOTIFY_WEBHOOK_URL` | Optional webhook (Slack-compatible) for new-trend notifications; falls back to console logs |

Every scraper degrades gracefully when its key is missing. If *all* sources fail, the scraper returns the `NO_SCRAPED_DATA` sentinel and the AI analysis is skipped entirely — the app never invents market data.

## Local development

```bash
pnpm install
cp .env.example .env      # or export the vars above
pnpm db:push              # generate + run migrations (needs DATABASE_URL)
pnpm dev                  # http://localhost:3000
pnpm check                # strict typecheck
pnpm test                 # vitest (validateApiKeys.test.ts needs live API keys)
pnpm build && pnpm start  # production build + serve
```

For Google sign-in on localhost, add `http://localhost:3000/api/oauth/callback` as an authorized redirect URI on your Google OAuth client.

## Deploying the free stack (Render + TiDB Cloud + cron-job.org)

### 1. Database — TiDB Cloud Serverless (free, MySQL-compatible)

1. Sign up at tidbcloud.com → create a **Serverless** cluster (free tier).
2. Create a database named `voicemining`.
3. Copy the connection string (host, user, password, port 4000) and build `DATABASE_URL`:
   `mysql://<user>:<password>@<host>:4000/voicemining?ssl={"rejectUnauthorized":true}`

### 2. Google OAuth app

1. Google Cloud Console → APIs & Services → Credentials → **Create credentials → OAuth client ID** (type: Web application).
2. Configure the consent screen (External, add your email as a test user or publish).
3. Authorized redirect URIs: `https://<your-app>.onrender.com/api/oauth/callback` (and the localhost one for dev).
4. Copy the client ID and secret.

### 3. Anthropic API key

console.anthropic.com → API Keys → create one. Reports cost roughly $0.50–$1.50 each on the default `claude-opus-4-8` (8 AI calls per report); set `ANTHROPIC_MODEL=claude-sonnet-5` to roughly halve that.

### 4. App hosting — Render (free web service)

1. Push this repo to GitHub.
2. Render → New → **Blueprint** → connect the repo ([render.yaml](render.yaml) configures everything), or create a Web Service manually with:
   - Build command: `corepack enable && pnpm install && pnpm db:push && pnpm build`
   - Start command: `pnpm start`
3. Fill in the environment variables from the table above.
4. Note: the free plan sleeps after ~15 minutes idle; the first visit after that takes ~30–50s to wake.

### 5. Weekly trend cron — cron-job.org (free)

1. Create a job: URL `https://<your-app>.onrender.com/api/scheduled/trend-refresh`, method POST, schedule Mondays 12:00 UTC.
2. Add a request header: `Authorization: Bearer <your CRON_SECRET>`.
3. The handler snapshots every keyword in the DB and sends a notification (console or `NOTIFY_WEBHOOK_URL`) when new Rising/Emerging topics are detected.

## Architecture

```
client/src/
  pages/            one file per route (Dashboard, NewSearch, ReportView, Vault,
                    ContentCalendar, TrendTracker, SharedReport, BulkProgress, ...)
  components/report/  ReportView tab components + shared report UI primitives
  components/CommandPalette.tsx  Cmd+K palette + global shortcuts
shared/
  reportContent.ts  all report/analysis content types + normalize helpers
                    (safe for client AND server; handles legacy JSON shapes)
server/
  routers.ts        the entire tRPC API (mining, analysis, reports, share,
                    vault, calendar, dashboard, trends, comparison)
  aiAnalysis.ts     runAnalysis + one generator per report section
  realScraper.ts    10 scrapers + retry/backoff + 24h cache + in-flight dedup
  scheduledHandlers.ts  weekly trend cron handler (+ new-trend notifications)
  db.ts             all Drizzle queries
  _core/
    auth.ts         Google OAuth + JWT sessions (self-owned)
    oauth.ts        /api/auth/google and /api/oauth/callback routes
    llm.ts          Anthropic SDK adapter (invokeLLM)
    notification.ts console/webhook notifications
drizzle/
  schema.ts         tables (re-exports content types from shared/reportContent)
  *.sql             migrations (append-only; generate with drizzle-kit)
```

### Data flow

1. `mining.create` (or `mining.createBulk` for up to 10 keywords) inserts a search and fires `processAnalysis` in the background.
2. `processAnalysis` scrapes (cached 24h per keyword, 3 retries with backoff, concurrent requests deduped), runs `runAnalysis` to extract structured insights, then generates all report sections **in parallel** and auto-creates the report.
3. The client polls `mining.getStatus` (or `getStatuses` for bulk) and shows a live progress log, then redirects to `/report/:id`.

### Legacy data compatibility

Older rows store insight lists as `string[]` and hooks as `"[CATEGORY] text"` strings. New rows store structured objects (`InsightItem`, `ViralHook`). Everything that reads these columns goes through `normalizeInsights()` / `normalizeHooks()` / `insightTexts()` from `shared/reportContent.ts`, so old reports keep rendering and a **Regenerate** click upgrades them.

## How to add a new AI generation function

1. Define the output type in `shared/reportContent.ts` (optional fields for anything legacy rows won't have).
2. If it's stored on reports, add a `json(...)` column in `drizzle/schema.ts` and run `pnpm db:push`.
3. Write the generator in `server/aiAnalysis.ts`:
   - accept `(keyword, analysis: AnalysisInput, brandVoice?)`,
   - build voice-data lines with `topInsights()` / `insightTexts()`,
   - call `invokeLLM` with `response_format: { type: "json_object" }`,
   - sanitize the parsed output and finish with `stripEmDashesDeep(...)` (no em dashes may ever reach the UI).
4. Add it to `generateAllSections` in `server/routers.ts` and to the `REPORT_SECTIONS` enum if it should support per-section regeneration.
5. Render it: add a tab component in `client/src/components/report/` and register it in `ReportView.tsx` (and in the PDF export + `SharedReport.tsx` if it should be public).

## How to add a new scraping engine

1. Add a `scrapeX(keyword)` function in `server/realScraper.ts` returning `ScrapedConversation[]`. Use `serpFetch` for SerpAPI engines or `fetchWithRetry` for direct APIs; return `[]` when the key is missing.
2. Add it to the `Promise.all` in `doScrape` and slot it into the priority-ordered `allResults` array (verbatim customer language first, headlines last).
3. That's it — caching, dedup, the `NO_SCRAPED_DATA` sentinel, and the LLM formatting all live downstream.

## Conventions

- **No em dashes** in AI output — always pipe generated content through `stripEmDashesDeep`.
- **Dark theme only** — use the oklch CSS variables in `client/src/index.css`, never hardcoded colours.
- **tRPC + Drizzle only** — no REST endpoints, no raw SQL.
- **Ownership checks** on every procedure: verify `userId === ctx.user.id` before returning or mutating rows.
- **Copy tone:** confident, direct, results-focused. Written for marketers, not engineers.
