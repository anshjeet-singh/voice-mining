/**
 * Scheduled endpoint handlers for cron-triggered jobs.
 * Authenticated with a shared secret: the cron service must send
 * `Authorization: Bearer <CRON_SECRET>`.
 * Mounted explicitly in server/_core/index.ts before the Vite/static fallthrough.
 *
 * Trend Tracker runs WEEKLY (every Monday 7 AM EST = 12:00 UTC) via any
 * external cron service (e.g. cron-job.org) POSTing to
 * /api/scheduled/trend-refresh with an empty JSON body.
 * Deep research pipeline:
 *  - Real SerpAPI scraping (Google + Reddit + Quora + forums)
 *  - Real YouTube search + comments
 *  - Real NewsAPI headlines
 *  - 5x deeper LLM analysis pass using all scraped data
 *
 * When no keywords are provided in the payload, the handler automatically loads
 * all distinct keywords from past user searches in the database.
 */

import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { saveTrendSnapshot, getDb } from "./db";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { scrapeHackerNews, scrapeRedditConversations, searchYouTubeVideos } from "./realScraper";
import { miningSearches } from "../drizzle/schema";

// ─── /api/scheduled/trend-refresh ────────────────────────────────────────────
// Called weekly by an external cron service (every Monday 7 AM EST = 12:00 UTC)
// with header `Authorization: Bearer <CRON_SECRET>`.
// Also callable manually from the UI via the trends.manualRefresh tRPC procedure.

export async function trendRefreshHandler(req: Request, res: Response) {
  try {
    // Auth: the external cron service must send `Authorization: Bearer <CRON_SECRET>`
    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!ENV.cronSecret || token !== ENV.cronSecret) {
      return res.status(403).json({ error: "cron-only endpoint (invalid or missing CRON_SECRET)" });
    }

    const body = req.body as { keywords?: string[] };
    let keywords: string[] =
      Array.isArray(body?.keywords) && body.keywords.length > 0 ? body.keywords : [];

    // If no keywords provided in payload, auto-load all distinct keywords from DB
    if (keywords.length === 0) {
      try {
        const db = await getDb();
        if (db) {
          const rows = await db
            .selectDistinct({ keyword: miningSearches.keyword })
            .from(miningSearches)
            .orderBy(miningSearches.keyword);
          keywords = rows.map((r) => r.keyword).filter(Boolean);
        }
      } catch (err) {
        console.error("[trend-refresh] Failed to load keywords from DB:", err);
      }
    }

    if (keywords.length === 0) {
      return res.json({ ok: true, skipped: "no keywords in DB or payload", snapshots: 0 });
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const results: { keyword: string; ok: boolean; error?: string }[] = [];
    const risingAlerts: string[] = [];

    for (const keyword of keywords) {
      try {
        const snapshot = await generateTrendSnapshot(keyword, today);
        await saveTrendSnapshot({
          keyword,
          snapshotDate: today,
          trendingTopics: snapshot.trendingTopics,
          trendingPhrases: snapshot.trendingPhrases,
          emergingQuestions: snapshot.emergingQuestions,
        });
        results.push({ keyword, ok: true });

        // Collect rising/emerging topics for the new-trend notification
        const rising = (snapshot.trendingTopics as Array<{ name: string; momentum: string; score: number }>)
          .filter((t) => t.momentum === "Rising" || t.momentum === "Emerging")
          .sort((a, b) => b.score - a.score)
          .slice(0, 2);
        for (const topic of rising) {
          risingAlerts.push(`"${topic.name}" is ${topic.momentum.toLowerCase()} for ${keyword} (score ${topic.score})`);
        }
      } catch (err) {
        console.error(`[trend-refresh] Failed for keyword "${keyword}":`, err);
        results.push({ keyword, ok: false, error: String(err) });
      }
    }

    // Notify when new trends are detected (console or NOTIFY_WEBHOOK_URL)
    if (risingAlerts.length > 0) {
      await notifyOwner({
        title: `VoiceMining: ${risingAlerts.length} new trend${risingAlerts.length === 1 ? "" : "s"} detected`,
        content: risingAlerts.slice(0, 10).join("\n"),
      }).catch((err) => console.warn("[trend-refresh] Notification failed:", err));
    }

    return res.json({ ok: true, date: today, snapshots: results.length, results });
  } catch (err) {
    console.error("[trend-refresh] Handler error:", err);
    return res.status(500).json({
      error: String(err),
      context: { url: req.url, taskUid: "unknown" },
      timestamp: new Date().toISOString(),
    });
  }
}

// ─── Deep weekly trend snapshot with real scraping ───────────────────────────

export async function generateTrendSnapshotForKeyword(keyword: string, date: string) {
  return generateTrendSnapshot(keyword, date);
}

async function scrapeForTrends(keyword: string): Promise<string> {
  const lines: string[] = [];
  const seen = new Set<string>();

  function addLine(platform: string, text: string) {
    const clean = text.trim();
    if (clean.length < 15) return;
    const key = clean.toLowerCase().slice(0, 80);
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(`[${platform.toUpperCase()}] ${clean}`);
  }

  // Run all scrapers in parallel
  await Promise.allSettled([
    // Reddit — posts + live comment threads (free)
    (async () => {
      for (const r of await scrapeRedditConversations(keyword)) {
        addLine(r.platform, r.text);
      }
    })(),

    // Hacker News — stories + comments (free)
    (async () => {
      for (const r of await scrapeHackerNews(keyword)) {
        addLine(r.platform, r.text);
      }
    })(),

    // SerpAPI — 2 targeted trend queries (metered, spent sparingly)
    (async () => {
      const apiKey = process.env.SERP_API_KEY;
      if (!apiKey) return;
      const queries = [
        `${keyword} trending 2025 OR 2026`,
        `${keyword} "what's working" OR "what works" OR "best way"`,
      ];
      await Promise.allSettled(
        queries.map(async (q) => {
          try {
            const url = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&num=10&api_key=${apiKey}`;
            const resp = await fetch(url);
            if (!resp.ok) return;
            const data = await resp.json();
            for (const r of data.organic_results ?? []) {
              if (r.snippet) addLine("reddit", r.snippet);
              if (r.title && r.title.length > 20) addLine("google", r.title);
            }
            for (const paa of data.related_questions ?? []) {
              if (paa.question) addLine("quora", paa.question);
              if (paa.snippet) addLine("forums", paa.snippet);
            }
          } catch { /* skip */ }
        })
      );
    })(),

    // YouTube — search + comments from top 8 videos
    (async () => {
      const ytKey = process.env.YOUTUBE_API_KEY;
      try {
        const videos = await searchYouTubeVideos(keyword, 8);
        for (const v of videos) {
          addLine("youtube", v.title);
          if (v.description) addLine("youtube", v.description);
        }

        if (ytKey && videos.length > 0) {
          const topIds = videos.slice(0, 5).map((v) => v.videoId).filter(Boolean);
          await Promise.allSettled(
            topIds.map(async (videoId) => {
              try {
                const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=40&order=relevance&key=${ytKey}`;
                const resp = await fetch(url);
                if (!resp.ok) return;
                const data = await resp.json();
                for (const item of data.items ?? []) {
                  const comment = item.snippet?.topLevelComment?.snippet?.textDisplay;
                  if (comment && comment.length > 20 && comment.length < 600) {
                    addLine("youtube_comments", comment.replace(/<[^>]+>/g, "").trim());
                  }
                }
              } catch { /* skip */ }
            })
          );
        }
      } catch (err) {
        console.error("[trend-snapshot] YouTube error:", err);
      }
    })(),

    // NewsAPI — recent news about the keyword
    (async () => {
      const apiKey = process.env.NEWS_API_KEY;
      if (!apiKey) return;
      try {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(keyword)}&language=en&sortBy=publishedAt&pageSize=30&apiKey=${apiKey}`;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const data = await resp.json();
        for (const article of data.articles ?? []) {
          if (article.title && !article.title.includes("[Removed]")) addLine("news", article.title);
          if (article.description && article.description.length > 30) addLine("news", article.description);
        }
      } catch { /* skip */ }
    })(),
  ]);

  if (lines.length === 0) {
    return `[NOTE: No scraped data available for "${keyword}". Use your knowledge of what people say online about this topic.]`;
  }

  // Cap to 200 lines for deep analysis (more than the 150 used in regular reports)
  return lines.slice(0, 400).join("\n");
}

async function generateTrendSnapshot(keyword: string, date: string) {
  // Step 1: Scrape real internet data
  const scrapedData = await scrapeForTrends(keyword);
  const hasRealData = !scrapedData.startsWith("[NOTE:");

  const systemPrompt = `You are an expert internet trend analyst specialising in identifying what is gaining momentum online for any keyword or niche.

Your job is to analyse real scraped internet data and extract:
1. What topics within this keyword are trending RIGHT NOW (gaining momentum, being discussed more)
2. The exact phrases and language real people are using when they talk about this keyword online
3. The questions people are actively asking on forums, Reddit, YouTube, and social media

CRITICAL RULES:
- Every output must be 100% specific to the keyword "${keyword}"
- Use verbatim language from the scraped data where possible — real phrases people actually typed
- Do NOT use polished marketing speak — use raw, authentic language from real conversations
- Do NOT substitute any other niche or industry
- Always respond with valid JSON only`;

  const userPrompt = hasRealData
    ? `Here is real scraped internet data about "${keyword}" collected on ${date}:

---SCRAPED DATA START---
${scrapedData}
---SCRAPED DATA END---

Based on this real data, identify what is trending for "${keyword}". Extract patterns from the actual language people are using above.

Return a JSON object:
{
  "trendingTopics": [
    {
      "name": "Topic name (3-7 words, from the data)",
      "description": "2-3 sentences describing what is trending and why, citing specific patterns from the scraped data",
      "score": 85,
      "momentum": "Rising"
    }
  ],
  "trendingPhrases": [
    "exact phrase from the scraped data",
    "another phrase real people are using"
  ],
  "emergingQuestions": [
    "Exact question from the scraped data or derived from it?",
    "Another question people are asking?"
  ]
}

Rules:
- trendingTopics: exactly 10 topics (more than usual because this is a deep weekly analysis), score 1-100, momentum: Rising | Stable | Emerging | Declining
- trendingPhrases: exactly 15 phrases (verbatim language from the scraped data above)
- emergingQuestions: exactly 10 questions (from the scraped data or clearly derived from it)
- Prioritise phrases and topics that appear multiple times in the scraped data — those are the real trends`
    : `Analyse current internet trends for the keyword: "${keyword}" as of ${date}.

Return a JSON object:
{
  "trendingTopics": [
    {
      "name": "Topic name (3-7 words)",
      "description": "2-3 sentences describing what is trending and why, specific to ${keyword}",
      "score": 85,
      "momentum": "Rising"
    }
  ],
  "trendingPhrases": [
    "exact phrase people are using about ${keyword}",
    "another trending phrase"
  ],
  "emergingQuestions": [
    "What question people are actively asking about ${keyword}?",
    "Another question gaining traction?"
  ]
}

Rules:
- trendingTopics: exactly 10 topics, score 1-100, momentum: Rising | Stable | Emerging | Declining
- trendingPhrases: exactly 15 phrases (verbatim language from real conversations)
- emergingQuestions: exactly 10 questions people are actively asking
- ALL content must be specific to "${keyword}" only`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const rawContent = response.choices[0]?.message?.content ?? "{}";
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  const parsed = JSON.parse(content);

  return {
    trendingTopics: parsed.trendingTopics ?? [],
    trendingPhrases: parsed.trendingPhrases ?? [],
    emergingQuestions: parsed.emergingQuestions ?? [],
  };
}
