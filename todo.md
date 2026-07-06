# Internet Voice Mining — Project TODO

## Database & Schema
- [x] Mining searches table (keyword, platforms, status, userId)
- [x] Analysis results table (searchId, raw data, themes, quotes)
- [x] Reports table (searchId, market intelligence JSON, content JSON)
- [x] Saved reports table (userId, reportId, name)

## Backend / API
- [x] mining.create — create a new mining search job
- [x] mining.list — list user's searches
- [x] mining.get — get single search with results
- [x] mining.delete — delete a search
- [x] analysis.run — trigger AI analysis on a search
- [x] analysis.getResult — get analysis result for a search
- [x] reports.generate — generate full market intelligence report
- [x] reports.get — get a saved report
- [x] reports.list — list user's reports
- [x] reports.delete — delete a report
- [x] reports.getBySearch — get report by search ID
- [x] content.generateHooks — generate viral hooks from report data (integrated in reports.generate)
- [x] content.generateAdCopy — generate ad copy ideas (integrated in reports.generate)
- [x] content.generateCalendar — generate content calendar (integrated in reports.generate)
- [x] comparison.compare — compare two or more niches side by side

## Frontend Pages
- [x] Landing page (public, premium hero, feature highlights, CTA)
- [x] Dashboard layout with sidebar navigation (AppShell)
- [x] New Search page (keyword input, platform selector, niche config)
- [x] Dashboard page (stats, recent searches, quick actions)
- [x] Analysis results page (pain points, desires, objections, trending phrases, emotional language, charts)
- [x] Market Intelligence Report page (full structured report view with tabs)
- [x] Viral Hooks & Ad Copy tab in Report page
- [x] Skool Posts tab in Report page
- [x] Keywords Intelligence tab in Report page
- [x] Audience Psychology tab in Report page
- [x] Content Calendar page (weekly content ideas and post angles)
- [x] Niche Comparison page (side-by-side multi-keyword comparison with charts)
- [x] Saved Reports page (manage and export saved reports)
- [x] Real-time progress indicator during mining/analysis

## UX & Polish
- [x] Premium dark theme with elegant typography (Inter font)
- [x] Animated progress bar during AI processing
- [x] Categorized insight cards (pain points, desires, objections, triggers)
- [x] Visual breakdowns (pie chart for sentiment, radar chart for themes)
- [x] Export report as downloadable JSON
- [x] Responsive design (mobile-friendly)
- [x] Empty states for all pages
- [x] Loading states with spinners

## Tests
- [x] mining router tests
- [x] analysis router tests
- [x] reports router tests
- [x] auth router tests

## Redesign (May 2026)
- [x] Simplify report tabs: 6 tabs total (Market Intelligence, Viral Hooks, Facebook Ads, Skool Posts, Video Scripts, Email Sequence)
- [x] Merge Market Intelligence + Audience Psychology into one tab
- [x] Remove YouTube/TikTok/UGC ad copy — Facebook-only ads (5 awareness levels)
- [x] Train AI on Hormozi 100M Ads, 100M Leads, 100M Hooks, Sell Like Crazy, Traffic Secrets
- [x] Train AI on A-Z Hook Templates and Viral Scripting Frameworks
- [x] Add Talking Head Video Scripts tab (4 scripts: Steak Method, Authority Sales, Stories That Sell, Contrarian)
- [x] Add Email Sequence tab (Hormozi lead nurture framework, 7-email sequence)
- [x] Add DM workflow to Skool posts (5-step DM sequence after keyword comment)
- [x] Keyword intelligence merged into Market Intelligence language patterns section
- [x] Content Calendar removed as separate page — redirects to report
- [x] Update all tests to match new function signatures

## Critical Fixes (May 2026 - Round 2)
- [x] Fix ALL null-safety crashes in ReportView (map over undefined fields causes TypeError)
- [x] Extract all ZIP files and build comprehensive AI training knowledge base
- [x] Rewrite ALL AI prompts to use verbatim voice data and framework-driven copy
- [x] Add Regenerate Report button so old reports can be refreshed without new search
- [x] Fix CTAs to use natural language (e.g. "Click the link below to register for our free training")
- [x] Ensure AI deeply uses extracted pain points, desires, verbatim quotes in every output
- [x] Fix Audience Psychology section showing empty tags
- [x] Fix Skool Posts showing blank post type and keyword
- [x] Fix Video Scripts and Email Sequence tabs showing empty

## UI & AI Overhaul (May 2026 Round 3)
- [x] Remove "Their Exact Language" accordion/dropdown — show all language data open by default
- [x] Remove all em-dashes from AI outputs (replace with full stops or line breaks)
- [x] Fix email subject line "pretext" label — remove the word "pretext" from subject line display
- [x] Fix email sign-off from "i Talk soon" to "Talk soon"
- [x] Use {{ subscriber.first_name }} for email name token (ConvertKit)
- [x] Use #NAME# for Skool DM name token
- [x] Facebook Ads: add B-roll ad format alongside Talking Head format
- [x] Video Scripts tab: replace with 5 YouTube video ideas (title + 1-2 lines) + 5 Talking Head scripts
- [x] Skool Posts: remove intro/welcome post types — only keyword trigger posts (FUNDING, CREDIT, ROADMAP, PLAYBOOK)
- [x] Skool DM workflow: use #NAME# token, include 3-day follow-up sequence if no reply
- [x] All CTAs across scripts/posts: use consistent keywords only (FUNDING, CREDIT, ROADMAP, PLAYBOOK)
- [x] Add brand voice upload to NewSearch: accept text/transcript/copy so AI learns user's voice
- [x] Update trainingData.ts with LGF Inner Circle paid community post patterns
- [x] Update trainingData.ts with master email copy prompt framework

## Bug Fixes & Improvements (Round 4 — May 2026)

- [x] Fix niche context contaminating market intelligence — context must only guide targeting, never be regurgitated as market data
- [x] Fix email sign-off duplicated — "talk soon, john" appears twice; remove the duplicate
- [x] Fix markdown asterisks rendering raw in email body — strip ** and render as actual bold HTML
- [x] Fix B-roll ad format — text-only overlay on creative background, no voiceover, proper CTA (click link below, join free Skool community)
- [x] Expand talking head scripts — all 6 sections must be fully populated, ~150 words minimum per script
- [x] Improve Skool posts — add emojis, more value/insight, dual CTAs (book a call + keyword comment)
- [x] Fix DM workflow — remove "if they reply" branch; only no-reply follow-ups: 4h, 1 day, 2 days, 1 day
- [x] Fix sign-up/login page — professional look, no Manus branding visible to users

## Round 5 — UX Overhaul & New Features (May 2026)

- [x] Simplify navigation: replace sidebar with minimal top-bar, 2-step flow (input then generate)
- [x] Replace "Compare Niches" with "Trend Tracker" (real-time trending topics/FAQs from internet)
- [x] Add Vault feature: save individual hooks, emails, posts, scripts, ads to a personal vault
- [x] Fix PDF export: clean readable layout, no boxes-in-boxes, properly formatted for AI agents to read
- [x] Strip all em dashes from AI outputs globally (report titles, all generated copy)
- [x] Fix email sequence day numbering: Day 1, Day 2, Day 3... (not "Email 1 of 7" etc.)
- [x] Fix B-roll ad format: text-only overlays, no voiceover, clean visual layout in report
- [x] Rewrite Skool post prompt with master system prompt (3 styles, GIF suggestion, banned words, formatting rules)

## Round 6 — UX Simplification & Trend Tracker Overhaul (May 2026)

- [x] Move navigation from top-bar to left-side vertical nav (slim, no sidebar panel, just icons+labels)
- [x] Increase base font size across the app — everything bigger and more readable
- [x] Simplify dashboard: remove redundant quick actions, clean up layout
- [x] Fix Vault icon (currently looks like X) — use a Vault icon from lucide-react
- [x] Trend Tracker: daily auto-refresh from live internet scraping (not pulled from past reports)
- [x] Trend Tracker: show 7-day trending topics with a trend graph
- [x] Trend Tracker: keyword selector dropdown (auto-populated from user's past searches)
- [x] Skool post labels: simplify to "Post N — Style X" with keyword shown separately
- [x] DM workflow timing: "Immediate" / "4 hours later, no reply" / "1 day later, no reply" x3
- [x] DM workflow: no-reply-only sequence, 5 DMs at correct intervals
- [x] B-roll ads: 4-5 sentences in the on-screen text overlays section (not just 2 lines)
- [x] Scheduled endpoint /api/scheduled/trend-refresh for daily cron
- [x] trend_snapshots DB table with trendingTopics, trendingPhrases, emergingQuestions JSON columns
- [x] trends tRPC router (getUserKeywords, getKeywords, getSnapshots)

## Round 7 — Prompt & UX Fixes (May 2026)

- [x] Video scripts: restore talking head format (was working before, got broken)
- [x] Video scripts: fix empty sections in Contrarian Take and Authority Sales styles
- [x] Email: use real HTML bold/italic/underline in email body (not markdown)
- [x] Email sign-off: always "Talk soon,\n[Client Name] "[Nickname]" [Last Name]\nP.S. ..." -- P.S. in caps
- [x] B-roll ads: opening hook must use verbatim language from market intelligence (pain, fears, desires, emotional triggers, dominant beliefs)
- [x] B-roll ads: on-screen text overlays must use exact verbatim quotes from the report data
- [x] Skool post labels: "Post 1: Keyword CTA [FUNDING]" / "Post 2: Link CTA" / "Post 3: Keyword CTA [PLAYBOOK]" etc.
- [x] Skool post labels: remove em-dashes from post headers
- [x] DM timing labels: "Immediate (off comment)" / "4 hours later, no reply" / "1 day later, no reply" x3
- [x] Trend Tracker: remove all em-dashes from UI
- [x] Trend Tracker: change cron to 7am EST daily
- [x] Trend Tracker: focus on "business funding" as the umbrella keyword (not per-report keywords)
- [x] Trend Tracker: add Refresh Now button (manual snapshot trigger)
- [x] Export button: download as formatted PDF (not text file)
- [x] Remove "Print PDF" button -- merged into Export PDF
- [x] Report view: unify market intelligence dashboard + report into one single view (auto-redirect + charts in MI tab)

## Round 8 — Real Scraping & Prompt Decontamination (May 2026)

- [x] Strip ALL hardcoded business funding/credit examples from every AI prompt (aiAnalysis.ts PLATFORM_CONVERSATIONS block removed)
- [x] Make every prompt keyword-agnostic: runAnalysis now uses real scraped data, not hardcoded niche examples
- [x] Fix Trend Tracker prompt: no hardcoded niche, uses selected keyword only
- [x] Add real YouTube scraping (YouTube Data API v3 — video search + comments, key confirmed working)
- [x] Add real SerpAPI scraping (Google search results, Reddit snippets, Quora, forums — key confirmed working)
- [x] Add real NewsAPI scraping (news headlines and descriptions — key confirmed working)
- [x] Add Twitter/X scraping (token provided but needs correct Bearer Token format from developer.twitter.com)
- [x] Wire all real scraped quotes/posts into the AI analysis pipeline via realScraper.ts
- [x] Graceful fallback: if no scraped data, LLM uses keyword-only context (no niche contamination)

## Round 9 — Rate Limiting & Deeper Trend Tracker (May 2026)

- [x] Add 3-reports-per-week rate limit per user (DB tracking, server enforcement, UI shows remaining count)
- [x] Upgrade Trend Tracker to weekly deep-research: real SerpAPI + YouTube scraping before LLM analysis
- [x] Trend Tracker deep analysis: 10 trending topics, 15 phrases, 10 questions (vs 8/12/8 before) + real scraped data fed into LLM
- [x] Configure weekly Heartbeat cron for Trend Tracker refresh — POST /api/scheduled/trend-refresh every Monday 7 AM EST (12:00 UTC). Handler auto-loads all keywords from DB when payload is empty. Endpoint live and ready. Activate after publishing: manus-heartbeat create --name weekly-trend-refresh --cron "0 0 12 * * 1" --path /api/scheduled/trend-refresh --payload '{}' --description "Weekly Trend Tracker refresh every Monday 7AM EST"

## Round 10 — Maximise SerpAPI Coverage (May 2026)

- [x] Add Bing engine to scraper (different index, surfaces different forums/blogs)
- [x] Add DuckDuckGo engine to scraper (privacy-focused index, 30 results per call)
- [x] Add Google Discussions engine (forum threads, Reddit posts via Google)
- [x] Add Google News engine (industry language, news headlines)
- [x] Add Yelp reviews engine (verbatim customer complaints and praise)
- [x] Add Amazon reviews engine (buyer language, product-related niches)
- [x] Increase scraped data cap from 150 to 200 results per report
- [x] Priority ordering: YouTube comments > Yelp > Amazon > Forums > Google > Bing/DDG > Twitter > News

## Round 11 — Auto-Report & Scraping Confirmation (May 2026)

- [x] Auto-generate full report immediately after analysis completes (no manual "Generate Report" button)
- [x] Remove the intermediate SearchResults dashboard and report-name modal — navigate straight to the report
- [x] Update progress messages to reflect the full pipeline (scraping + analysis + report generation)
- [x] Confirm all 10 scraping engines feed the main report (already true via realScraper.ts — document this)

## Round 11 — Edge Case Fixes (May 2026)

- [x] Handle weekly limit edge case in auto-report flow: show clear "limit reached" state instead of infinite "redirecting shortly" spinner
- [x] Check the progress message stored in DB when limit is reached and surface it in SearchResults

## Round 12 — Remove Rate Limit (May 2026)

- [x] Remove 3-report weekly limit check from backend (processAnalysis in routers.ts)
- [x] Remove weekly limit check from reports.generate procedure
- [x] Remove any frontend messaging about the weekly limit in SearchResults.tsx

## Round 13 — Remove Input Character Limits (Jun 2026)

- [x] Raise all string max() validators in routers.ts to 100,000 characters (keyword, niche, brandVoice, name, label)

## Round 13b — Fix Niche Context Contamination (Jun 2026)

- [x] Fix realScraper.ts: return "NO_SCRAPED_DATA" sentinel instead of a fallback LLM instruction when scraping returns nothing
- [x] Fix aiAnalysis.ts runAnalysis: skip LLM entirely when no scraped data — return empty arrays, never generate from niche context
- [x] Tighten NICHE CONTEXT prompt injection: brand voice only passed when real scraped data exists
