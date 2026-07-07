# Client OS — Slice 1: Clients → Onboarding → Research → Foundation Docs

Date: 2026-07-08
Status: Approved by owner
Snapshot before this build: git tag `v1-research-engine`

## Purpose

Evolve Voice Mining from a research engine into the agency's internal fulfillment
engine ("Client OS"). Slice 1 covers: create client → upload onboarding material →
run voice-mining research under the client → generate the four Foundation docs via
the owner's real agency skills, with an approve/reject-and-learn loop.

Not client-facing. One user (the owner). Less is more: clean, minimal, powerful.

## Engine decision (the big one)

Generation does NOT call any paid API. A local worker on the owner's Mac runs
headless Claude Code (`claude -p`) under his Max subscription — the same model,
the same real skill files, the same harness he uses on claude.ai today. Quality is
identical by construction; marginal cost is $0.

- The deployed app (Render) is mission control: clients, buttons, statuses, library.
- The Mac is the engine: polls for queued jobs, runs the skills, posts results back.
- If volume ever exceeds Max plan caps, API overflow can be added later via a
  skills-table mechanism (additive change; out of scope now).

## Data model (TiDB, direct ALTER — drizzle-kit push needs TTY)

- `clients`: id, userId, name, niche, funnelType ('webinar'|'call'), pricePoint
  (nullable text), createdAt, updatedAt.
- `client_documents`: id, clientId, kind ('onboarding'|'foundation'|'lesson'),
  docType (e.g. 'voice_transcript'|'competitors'|'intake'|'icp_snapshot'|'offers'|
  'brand_positioning'|'course_outline'|'note'), title, content (LONGTEXT — extracted
  text only, no binary storage), source (original filename, nullable),
  createdAt, updatedAt.
- `jobs`: id, clientId, userId, type ('foundation'), status ('queued'|'running'|
  'review'|'approved'|'failed'), payload JSON (includes feedback on regen),
  error (nullable), createdAt, startedAt, finishedAt.
- `mining_searches`: add nullable `clientId`.

## Flow / UX

New nav item **Clients**.

- **Client list**: minimal rows + "New Client".
- **New client**: exactly four fields — name, niche, funnel type (webinar/call),
  price point (optional).
- **Client page** = the pipeline as a vertical checklist. Live stages:
  1. **Onboarding** — drag-in PDF (server extracts text via pdf-parse; verified the
     real 48-page voice-transcript PDF extracts cleanly) + paste boxes (competitor
     list, intake answers). Material stacks; add any time.
  2. **Research** — "Run Research" opens the existing New Search pre-attached to the
     client (`clientId` on the search). Reports list under the client. Standalone
     research (no client) keeps working unchanged.
  3. **Foundation** — "Generate Foundation Docs" queues a job. Worker returns four
     docs in mother-skill order: ICP Snapshot → Offers → Brand & Positioning →
     Course Outline. Rendered as four clean documents; each editable in-app.
     One Approve action; Reject takes an optional "what's wrong" note.
  Future stages (Skool, Funnel, Emails, Ads) rendered greyed as "coming next" so the
  page already reads as the fulfillment tracker.
- Stage status chips: empty / in progress / waiting for your Mac / ready for review /
  approved.

## The worker

`npm run worker` (script in repo, runs on the Mac):

- Polls `POST /api/worker/claim` every ~15s (Bearer WORKER_SECRET).
- On a foundation job: assembles a job folder — client meta, all onboarding text,
  the client's research report (readable render), funnel type, prior feedback if
  regen — plus pointers to the REAL skill files (mother skill Step 1 child skills:
  avatar-extraction, schwartz-awareness-mapper, offer-extraction, offer-architecture,
  offer-math-pricing, mechanism-builder, vsl-and-sales-page-writer FOUNDATIONS,
  course-builder MENU) and the relevant LEARNINGS files.
- Runs headless Claude Code instructing it to read those skills and write the four
  docs to output files; posts them to `POST /api/worker/complete`.
- Mac asleep → job stays queued; UI shows "waiting for your Mac".

Skills note: the agency skills live in the claude.ai local-agent cache (synced, may
be overwritten), so the worker never mutates them. Learnings live as companion files
(see below) injected alongside the skill at generation time — functionally an
additive LEARNINGS section, without touching the synced cache.

## The learning loop

Every rejection note is triaged by Claude in the worker into one of two destinations:

1. **Client lesson** (taste/voice — "this client hates emojis"): saved as a
   `client_documents` row (kind 'lesson') and auto-injected into every future
   generation for that client. Never touches skills.
2. **Craft lesson** (universal — "build urgency before the CTA"): appended to
   `worker/learnings/<skill-name>.md` in a git-versioned learnings folder, each
   commit stamped with its source. Additive-only is automatic; anything that would
   rewrite a skill's core rules is surfaced in the app as a one-click approval.

Performance-data ingestion (ConvertKit screenshots/exports → pattern extraction →
same triage) ships with the email/ads slices, when there is performance to measure.

## Out of scope (this slice)

Drive export, Notion integration, later pipeline stages, client-facing views,
API overflow, analytics ingestion.

## Testing

- Unit: PDF text extraction, worker claim/complete auth, job state machine.
- End-to-end (manual): create real client with the Ibby PDF, run research,
  generate foundation, verify four docs match claude.ai quality.
