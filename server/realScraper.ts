/**
 * Real Internet Scraper — deep, mostly-free voice-of-customer mining.
 *
 * Free, key-less sources (unlimited or huge quotas):
 *  - Reddit: post search + FULL comment threads (public JSON; optional OAuth
 *    via REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET for reliability from cloud IPs)
 *  - Hacker News: Algolia search API (stories + comments)
 *  - DuckDuckGo: direct HTML results (general + site:quora.com + reviews)
 *  - Trustpilot: review text mined from pages found via DuckDuckGo
 *  - YouTube Data API v3: 2 searches, ~10 videos, ~50 comments each (free quota)
 *  - NewsAPI: headlines + descriptions (free tier)
 *  - Google Suggest: related searches (free, no key)
 *
 * Metered source (spent sparingly — 3 calls/report):
 *  - SerpAPI: Google organic voice-queries + Google Discussions
 *
 * Everything degrades gracefully when a key is missing or a source fails.
 * All scrapers run in parallel; results are deduped, diversity-capped per
 * source, and cached for 24h per keyword.
 */

import { getCachedScrape, saveCachedScrape } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScrapedConversation {
  platform: string;
  text: string;
  source?: string;
}

/** Optional live-progress callback so the UI can show real scraping activity. */
export type ScrapeProgress = (message: string) => void;

// ─── Helper: fetch with retry ─────────────────────────────────────────────────

/**
 * Fetch with up to 3 retries and exponential backoff (500ms, 1s, 2s).
 * Retries on network errors, 429s, and 5xx responses. Returns the last
 * response (or throws the last network error) once retries are exhausted.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retries = 3
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, init);
      const retryable = resp.status === 429 || resp.status >= 500;
      if (!retryable || attempt === retries) return resp;
    } catch (err) {
      lastError = err;
      if (attempt === retries) throw err;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastError;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Decode the handful of HTML entities that show up in scraped snippets. */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// ─── Helper: SerpAPI fetch (metered — free tier ~100 searches/month) ─────────

async function serpFetch(params: Record<string, string>): Promise<Record<string, unknown>> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) return {};
  const qs = new URLSearchParams({ ...params, api_key: apiKey });
  try {
    const resp = await fetchWithRetry(`https://serpapi.com/search.json?${qs}`);
    if (!resp.ok) return {};
    return await resp.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ─── 1. Reddit — posts + full comment threads (FREE) ─────────────────────────

let _redditToken: { token: string; expiresAt: number } | null = null;

/** App-only OAuth token when REDDIT_CLIENT_ID/SECRET are set (more reliable from cloud IPs). */
async function getRedditToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (_redditToken && _redditToken.expiresAt > Date.now()) return _redditToken.token;
  try {
    const resp = await fetchWithRetry("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "voice-mining/1.0",
      },
      body: "grant_type=client_credentials",
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    _redditToken = {
      token: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000,
    };
    return _redditToken.token;
  } catch {
    return null;
  }
}

async function redditGet(path: string, params: Record<string, string>): Promise<unknown> {
  const token = await getRedditToken();
  const qs = new URLSearchParams({ ...params, raw_json: "1" });
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const suffix = token ? "" : ".json";
  const headers: Record<string, string> = { "user-agent": "voice-mining/1.0" };
  if (token) headers.authorization = `Bearer ${token}`;
  const resp = await fetchWithRetry(`${base}${path}${suffix}?${qs}`, { headers }, 2);
  if (!resp.ok) throw new Error(`reddit ${resp.status}`);
  return resp.json();
}

type RedditChild = { kind: string; data: Record<string, unknown> };

function walkRedditComments(children: RedditChild[], out: string[], depth = 0) {
  if (depth > 3 || out.length >= 45) return;
  for (const child of children) {
    if (out.length >= 45) break;
    if (child.kind !== "t1") continue;
    const body = child.data.body as string | undefined;
    if (body && body.length > 25 && body.length < 700 && !body.includes("[removed]") && !body.includes("[deleted]")) {
      out.push(body.replace(/\s+/g, " ").trim());
    }
    const replies = child.data.replies as { data?: { children?: RedditChild[] } } | "" | undefined;
    if (replies && typeof replies === "object" && replies.data?.children) {
      walkRedditComments(replies.data.children, out, depth + 1);
    }
  }
}

/** Search Reddit for the keyword and mine full comment threads from top posts. */
export async function scrapeRedditConversations(keyword: string): Promise<ScrapedConversation[]> {
  const results: ScrapedConversation[] = [];
  try {
    // Two searches: most relevant + top voted this year
    const searches = await Promise.allSettled([
      redditGet("/search", { q: keyword, sort: "relevance", limit: "12", t: "year" }),
      redditGet("/search", { q: keyword, sort: "top", limit: "12", t: "year" }),
    ]);

    const posts = new Map<string, { id: string; title: string; selftext: string; permalink: string; num_comments: number }>();
    for (const s of searches) {
      if (s.status !== "fulfilled") continue;
      const children = ((s.value as { data?: { children?: RedditChild[] } }).data?.children ?? []);
      for (const c of children) {
        const d = c.data;
        const id = d.id as string;
        if (!id || posts.has(id)) continue;
        posts.set(id, {
          id,
          title: (d.title as string) ?? "",
          selftext: (d.selftext as string) ?? "",
          permalink: (d.permalink as string) ?? "",
          num_comments: (d.num_comments as number) ?? 0,
        });
      }
    }

    for (const post of Array.from(posts.values())) {
      if (post.title.length > 15) {
        results.push({ platform: "reddit", text: post.title, source: `https://reddit.com${post.permalink}` });
      }
      if (post.selftext && post.selftext.length > 40) {
        results.push({
          platform: "reddit",
          text: post.selftext.replace(/\s+/g, " ").slice(0, 600),
          source: `https://reddit.com${post.permalink}`,
        });
      }
    }

    // Mine comment threads from the 6 most-discussed posts
    const topPosts = Array.from(posts.values())
      .sort((a, b) => b.num_comments - a.num_comments)
      .slice(0, 6);

    await Promise.allSettled(
      topPosts.map(async (post) => {
        const thread = (await redditGet(`/comments/${post.id}`, { limit: "80", depth: "3", sort: "top" })) as Array<{
          data?: { children?: RedditChild[] };
        }>;
        const comments: string[] = [];
        walkRedditComments(thread?.[1]?.data?.children ?? [], comments);
        for (const comment of comments) {
          results.push({ platform: "reddit_comments", text: comment, source: `https://reddit.com${post.permalink}` });
        }
      })
    );
  } catch (err) {
    console.warn("[realScraper] Reddit unavailable:", String(err).slice(0, 120));
  }
  return results;
}

// ─── 2. Hacker News — Algolia search API (FREE, no key) ──────────────────────

export async function scrapeHackerNews(keyword: string): Promise<ScrapedConversation[]> {
  const results: ScrapedConversation[] = [];
  try {
    const q = encodeURIComponent(keyword);
    const [commentsResp, storiesResp] = await Promise.allSettled([
      fetchWithRetry(`https://hn.algolia.com/api/v1/search?query=${q}&tags=comment&hitsPerPage=40`),
      fetchWithRetry(`https://hn.algolia.com/api/v1/search?query=${q}&tags=story&hitsPerPage=15`),
    ]);

    if (commentsResp.status === "fulfilled" && commentsResp.value.ok) {
      const data = (await commentsResp.value.json()) as { hits?: Array<{ comment_text?: string; objectID?: string }> };
      for (const hit of data.hits ?? []) {
        const text = stripHtml(hit.comment_text ?? "");
        if (text.length > 30 && text.length < 700) {
          results.push({
            platform: "hackernews",
            text,
            source: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          });
        }
      }
    }
    if (storiesResp.status === "fulfilled" && storiesResp.value.ok) {
      const data = (await storiesResp.value.json()) as { hits?: Array<{ title?: string; objectID?: string }> };
      for (const hit of data.hits ?? []) {
        if (hit.title && hit.title.length > 20) {
          results.push({
            platform: "hackernews",
            text: hit.title,
            source: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[realScraper] HN unavailable:", String(err).slice(0, 120));
  }
  return results;
}

// ─── 3. DuckDuckGo — direct HTML results (FREE, no key) ──────────────────────

interface DdgResult {
  title: string;
  snippet: string;
  url: string;
}

async function ddgSearch(query: string): Promise<DdgResult[]> {
  try {
    const resp = await fetchWithRetry(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "user-agent": BROWSER_UA } },
      2
    );
    if (!resp.ok) return [];
    const html = await resp.text();
    const results: DdgResult[] = [];
    const blockRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(html)) !== null && results.length < 15) {
      let url = m[1];
      const uddg = url.match(/uddg=([^&]+)/);
      if (uddg) url = decodeURIComponent(uddg[1]);
      results.push({ url, title: stripHtml(m[2]), snippet: stripHtml(m[3]) });
    }
    return results;
  } catch {
    return [];
  }
}

/** General DDG coverage + targeted Quora mining. */
async function scrapeDuckDuckGoDirect(keyword: string): Promise<ScrapedConversation[]> {
  const results: ScrapedConversation[] = [];
  const queries: Array<{ q: string; platform: (url: string) => string }> = [
    { q: `${keyword} "anyone else" OR "I tried" OR complaints`, platform: (u) => (u.includes("reddit.com") ? "reddit" : u.includes("quora.com") ? "quora" : "forums") },
    { q: `${keyword} site:quora.com`, platform: () => "quora" },
  ];
  await Promise.allSettled(
    queries.map(async ({ q, platform }) => {
      for (const r of await ddgSearch(q)) {
        if (r.title.length > 20) results.push({ platform: platform(r.url), text: r.title, source: r.url });
        if (r.snippet.length > 30) results.push({ platform: platform(r.url), text: r.snippet, source: r.url });
      }
    })
  );
  return results;
}

// ─── 4. Trustpilot — review text via DDG-discovered pages (FREE) ─────────────

async function scrapeTrustpilotReviews(keyword: string): Promise<ScrapedConversation[]> {
  const results: ScrapedConversation[] = [];
  try {
    const found = await ddgSearch(`${keyword} site:trustpilot.com/review`);
    const pages = found.filter((r) => r.url.includes("trustpilot.com/review")).slice(0, 2);
    // The search snippets themselves are review language too
    for (const r of found.slice(0, 6)) {
      if (r.snippet.length > 30) results.push({ platform: "trustpilot", text: r.snippet, source: r.url });
    }
    await Promise.allSettled(
      pages.map(async (page) => {
        const resp = await fetchWithRetry(page.url, { headers: { "user-agent": BROWSER_UA } }, 1);
        if (!resp.ok) return;
        const html = await resp.text();
        const reviewRe = /"reviewBody"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
        let m: RegExpExecArray | null;
        let count = 0;
        while ((m = reviewRe.exec(html)) !== null && count < 12) {
          try {
            const body = (JSON.parse(`"${m[1]}"`) as string).replace(/\s+/g, " ").trim();
            if (body.length > 40 && body.length < 700) {
              results.push({ platform: "trustpilot", text: body, source: page.url });
              count++;
            }
          } catch { /* skip malformed */ }
        }
      })
    );
  } catch { /* non-fatal */ }
  return results;
}

// ─── 5. Google organic + Discussions (SerpAPI — 3 metered calls total) ───────

async function scrapeGoogle(keyword: string): Promise<ScrapedConversation[]> {
  if (!process.env.SERP_API_KEY) return [];
  const results: ScrapedConversation[] = [];

  // Consolidated voice-of-customer queries (2 calls instead of 4)
  const queries = [
    `${keyword} "I tried" OR "I wasted" OR "I finally" OR "anyone else"`,
    `${keyword} reviews OR complaints OR forum site:reddit.com OR site:quora.com OR site:trustpilot.com`,
  ];

  await Promise.allSettled(queries.map(async (q) => {
    const data = await serpFetch({ engine: "google", q, num: "10" });
    const organic = (data.organic_results as Array<Record<string, string>> | undefined) ?? [];
    for (const r of organic) {
      if (r.snippet?.length > 30) {
        const platform = r.link?.includes("reddit.com") ? "reddit"
          : r.link?.includes("quora.com") ? "quora"
          : r.link?.includes("trustpilot.com") ? "trustpilot"
          : "forums";
        results.push({ platform, text: r.snippet, source: r.link });
      }
      if (r.title?.length > 20) {
        results.push({ platform: "google", text: r.title, source: r.link });
      }
    }
    // People Also Ask — real questions people type into Google
    const paa = (data.related_questions as Array<Record<string, string>> | undefined) ?? [];
    for (const p of paa) {
      if (p.question) results.push({ platform: "google_questions", text: p.question });
      if (p.snippet) results.push({ platform: "forums", text: p.snippet });
    }
  }));

  return results;
}

async function scrapeGoogleDiscussions(keyword: string): Promise<ScrapedConversation[]> {
  if (!process.env.SERP_API_KEY) return [];
  const results: ScrapedConversation[] = [];

  const data = await serpFetch({
    engine: "google",
    q: `${keyword} forum OR reddit OR community OR discussion`,
    num: "15",
  });

  const organic = (data.organic_results as Array<Record<string, string>> | undefined) ?? [];
  for (const r of organic) {
    if (r.snippet?.length > 30) {
      const platform = r.link?.includes("reddit.com") ? "reddit" : "forums";
      results.push({ platform, text: r.snippet, source: r.link });
    }
  }

  const discussions = (data.discussions_and_forums as Array<Record<string, unknown>> | undefined) ?? [];
  for (const d of discussions) {
    const title = d.title as string | undefined;
    const snippet = d.snippet as string | undefined;
    if (title && title.length > 15) results.push({ platform: "forums", text: title });
    if (snippet && snippet.length > 30) results.push({ platform: "forums", text: snippet });
  }

  return results;
}

// ─── 6. YouTube (Data API v3 — FREE quota; deep comment mining) ──────────────

/** YouTube Data API v3 search.list — titles + descriptions for a keyword. */
export async function searchYouTubeVideos(
  keyword: string,
  maxResults = 10
): Promise<Array<{ videoId: string; title: string; description?: string }>> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}` +
      `&relevanceLanguage=en&q=${encodeURIComponent(keyword)}&key=${apiKey}`;
    const resp = await fetchWithRetry(url);
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; description?: string } }>;
    };
    return (data.items ?? [])
      .map((item) => ({
        videoId: item.id?.videoId ?? "",
        title: item.snippet?.title ?? "",
        description: item.snippet?.description,
      }))
      .filter((v) => v.videoId && v.title);
  } catch (err) {
    console.error("[realScraper] YouTube search error:", err);
    return [];
  }
}

async function scrapeYouTube(keyword: string): Promise<ScrapedConversation[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const results: ScrapedConversation[] = [];

  try {
    // Two searches: the keyword itself + experience/review phrasing
    const [primary, experience] = await Promise.all([
      searchYouTubeVideos(keyword, 8),
      searchYouTubeVideos(`${keyword} review OR "my experience"`, 6),
    ]);
    const seen = new Set<string>();
    const videos = [...primary, ...experience].filter((v) => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    });

    for (const vid of videos) {
      results.push({ platform: "youtube", text: vid.title, source: `https://youtube.com/watch?v=${vid.videoId}` });
      if (vid.description && vid.description.length > 20) {
        results.push({ platform: "youtube", text: vid.description, source: `https://youtube.com/watch?v=${vid.videoId}` });
      }
    }

    // Deep comment mining: top 10 videos, up to 50 relevance-ranked comments each
    if (apiKey && videos.length > 0) {
      const topVideoIds = videos.slice(0, 10).map((v) => v.videoId);
      await Promise.allSettled(topVideoIds.map(async (videoId) => {
        try {
          const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=50&order=relevance&key=${apiKey}`;
          const resp = await fetchWithRetry(url);
          if (!resp.ok) return;
          const data = await resp.json() as { items?: Array<{ snippet: { topLevelComment: { snippet: { textDisplay: string } } } }> };
          for (const item of data.items ?? []) {
            const comment = item.snippet?.topLevelComment?.snippet?.textDisplay;
            if (comment && comment.length > 20 && comment.length < 600) {
              results.push({
                platform: "youtube_comments",
                text: comment.replace(/<[^>]+>/g, "").trim(),
                source: `https://youtube.com/watch?v=${videoId}`,
              });
            }
          }
        } catch { /* skip */ }
      }));
    }
  } catch (err) {
    console.error("[realScraper] YouTube error:", err);
  }

  return results;
}

// ─── 7. Twitter/X ─────────────────────────────────────────────────────────────

async function scrapeTwitter(keyword: string): Promise<ScrapedConversation[]> {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) return [];
  const results: ScrapedConversation[] = [];

  try {
    const query = encodeURIComponent(`${keyword} -is:retweet lang:en`);
    const resp = await fetchWithRetry(
      `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=50&tweet.fields=text`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    );
    if (!resp.ok) return results; // free tier has no search quota — skip silently
    const data = await resp.json() as { data?: Array<{ id: string; text: string }> };
    for (const tweet of data.data ?? []) {
      if (tweet.text?.length > 20 && !tweet.text.startsWith("RT ")) {
        results.push({
          platform: "twitter",
          text: tweet.text.replace(/https?:\/\/\S+/g, "").trim(),
          source: `https://twitter.com/i/web/status/${tweet.id}`,
        });
      }
    }
  } catch (err) {
    console.error("[realScraper] Twitter error:", err);
  }

  return results;
}

// ─── 8. NewsAPI ───────────────────────────────────────────────────────────────

async function scrapeNews(keyword: string): Promise<ScrapedConversation[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return [];
  const results: ScrapedConversation[] = [];

  try {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(keyword)}&language=en&sortBy=relevancy&pageSize=20&apiKey=${apiKey}`;
    const resp = await fetchWithRetry(url);
    if (!resp.ok) return results;
    const data = await resp.json() as { articles?: Array<{ title: string; description: string; url: string }> };
    for (const article of data.articles ?? []) {
      if (article.title && !article.title.includes("[Removed]")) {
        results.push({ platform: "news", text: article.title, source: article.url });
      }
      if (article.description?.length > 30) {
        results.push({ platform: "news", text: article.description, source: article.url });
      }
    }
  } catch (err) {
    console.error("[realScraper] NewsAPI error:", err);
  }

  return results;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

// In-flight request dedup: if the same keyword is already being scraped,
// reuse that promise instead of firing a second round of API calls.
const inFlightScrapes = new Map<string, Promise<string>>();

/** Per-source line caps keep the blob diverse instead of one source dominating. */
const SOURCE_CAPS: Record<string, number> = {
  reddit_comments: 120,
  reddit: 45,
  youtube_comments: 120,
  youtube: 25,
  hackernews: 45,
  trustpilot: 30,
  quora: 25,
  forums: 40,
  google: 20,
  google_questions: 20,
  google_trends: 20,
  duckduckgo: 20,
  twitter: 40,
  news: 30,
};

const TOTAL_CAP = 500;

/**
 * Scrape all sources for a keyword and return an LLM-ready text blob.
 * Results are cached for 24 hours per keyword (repeat searches are instant),
 * and concurrent requests for the same keyword share one in-flight scrape.
 * Pass `onProgress` to surface live per-source counts in the UI.
 */
export async function scrapeInternetForKeyword(
  keyword: string,
  platforms: string[],
  onProgress?: ScrapeProgress
): Promise<string> {
  const cacheKey = keyword.toLowerCase().trim();

  // 24h cache: repeat searches reuse the raw scrape
  const cached = await getCachedScrape(cacheKey).catch(() => undefined);
  if (cached) {
    onProgress?.(`Using fresh scrape from the last 24 hours (${cached.split("\n").length} snippets)`);
    return cached;
  }

  const inFlight = inFlightScrapes.get(cacheKey);
  if (inFlight) return inFlight;

  const scrapePromise = doScrape(keyword, platforms, onProgress)
    .then(async (result) => {
      if (result !== "NO_SCRAPED_DATA") {
        await saveCachedScrape(cacheKey, result).catch((err) =>
          console.warn("[realScraper] Cache save failed:", err)
        );
      }
      return result;
    })
    .finally(() => {
      inFlightScrapes.delete(cacheKey);
    });

  inFlightScrapes.set(cacheKey, scrapePromise);
  return scrapePromise;
}

async function doScrape(
  keyword: string,
  _platforms: string[],
  onProgress?: ScrapeProgress
): Promise<string> {
  onProgress?.("Scraping Reddit threads, YouTube comments, Hacker News, Trustpilot, Google, DuckDuckGo, Quora, news...");

  // Run all scrapers in parallel for maximum speed
  const [
    redditResults,
    hnResults,
    ddgResults,
    trustpilotResults,
    googleResults,
    discussionResults,
    youtubeResults,
    twitterResults,
    newsResults,
    googleTrends,
  ] = await Promise.all([
    scrapeRedditConversations(keyword),
    scrapeHackerNews(keyword),
    scrapeDuckDuckGoDirect(keyword),
    scrapeTrustpilotReviews(keyword),
    scrapeGoogle(keyword),
    scrapeGoogleDiscussions(keyword),
    scrapeYouTube(keyword),
    scrapeTwitter(keyword),
    scrapeNews(keyword),
    fetchGoogleTrends(keyword),
  ]);

  const trendResults: ScrapedConversation[] = [
    ...googleTrends.rising.map((q) => ({ platform: "google_trends", text: `RISING SEARCH: ${q}` })),
    ...googleTrends.top.map((q) => ({ platform: "google_trends", text: `TOP SEARCH: ${q}` })),
  ];

  // Priority order: raw comments and reviews first (richest verbatim voice),
  // then discussion snippets, then titles/headlines.
  const allResults: ScrapedConversation[] = [
    ...redditResults,
    ...youtubeResults,
    ...hnResults,
    ...trustpilotResults,
    ...discussionResults,
    ...googleResults,
    ...trendResults,
    ...ddgResults,
    ...twitterResults,
    ...newsResults,
  ];

  if (allResults.length === 0) {
    onProgress?.("No data came back from any source. Try a broader keyword.");
    return `NO_SCRAPED_DATA`;
  }

  // Dedupe, apply per-source diversity caps, format for the LLM
  const seen = new Set<string>();
  const perSource: Record<string, number> = {};
  const lines: string[] = [];

  for (const r of allResults) {
    if (lines.length >= TOTAL_CAP) break;
    const clean = r.text.trim();
    if (clean.length < 15) continue;
    const key = clean.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    const cap = SOURCE_CAPS[r.platform] ?? 20;
    if ((perSource[r.platform] ?? 0) >= cap) continue;
    seen.add(key);
    perSource[r.platform] = (perSource[r.platform] ?? 0) + 1;
    lines.push(`[${r.platform.toUpperCase()}] ${clean}`);
  }

  const summary = Object.entries(perSource)
    .sort((a, b) => b[1] - a[1])
    .map(([source, n]) => `${source} ${n}`)
    .join(", ");
  onProgress?.(`Collected ${lines.length} real snippets: ${summary}`);
  console.log(`[realScraper] "${keyword}": ${lines.length} snippets (${summary})`);

  return lines.join("\n");
}

// ─── Competitor Intelligence Scrape ──────────────────────────────────────────

/**
 * Dedicated competitor sweep: SerpAPI (2 calls) + free DDG queries for
 * top brands/providers, their messaging, review complaints, and pricing
 * signals. Returns an LLM-ready text blob, or "NO_SCRAPED_DATA".
 */
export async function scrapeCompetitorsForKeyword(keyword: string): Promise<string> {
  const lines: string[] = [];

  const serpQueries = process.env.SERP_API_KEY
    ? [
        { q: `best ${keyword} companies OR services OR programs`, tag: "TOP_PLAYERS" },
        { q: `${keyword} reviews complaints "not worth it" OR scam OR disappointed`, tag: "COMPLAINTS" },
      ]
    : [];
  const ddgQueries = [
    { q: `${keyword} competitors comparison`, tag: "COMPARISONS" },
    { q: `${keyword} pricing cost "per month" OR fee`, tag: "PRICING" },
  ];

  await Promise.allSettled([
    ...serpQueries.map(async ({ q, tag }) => {
      const data = await serpFetch({ engine: "google", q, num: "10" });
      const organic = (data.organic_results as Array<Record<string, string>> | undefined) ?? [];
      for (const r of organic) {
        if (r.title) lines.push(`[${tag}] TITLE: ${r.title}${r.link ? ` (${r.link})` : ""}`);
        if (r.snippet) lines.push(`[${tag}] ${r.snippet}`);
      }
      const paa = (data.related_questions as Array<Record<string, string>> | undefined) ?? [];
      for (const p of paa) {
        if (p.question) lines.push(`[${tag}] QUESTION: ${p.question}`);
        if (p.snippet) lines.push(`[${tag}] ${p.snippet}`);
      }
    }),
    ...ddgQueries.map(async ({ q, tag }) => {
      for (const r of await ddgSearch(q)) {
        if (r.title) lines.push(`[${tag}] TITLE: ${r.title} (${r.url})`);
        if (r.snippet) lines.push(`[${tag}] ${r.snippet}`);
      }
    }),
  ]);

  if (lines.length === 0) return "NO_SCRAPED_DATA";

  const seen = new Set<string>();
  const deduped = lines.filter((line) => {
    const key = line.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.slice(0, 120).join("\n");
}

// ─── Direct Competitor URL Scraping ──────────────────────────────────────────

/**
 * Fetch the competitor URLs the user pasted (Instagram, Facebook, Skool,
 * websites) and extract whatever is publicly readable: title, meta/og tags,
 * ld+json, headings, and visible page text. Social platforms block full
 * pages for anonymous requests, but their og: meta tags (bio, follower
 * blurbs) usually survive. Returns an LLM-ready blob, or "" if nothing
 * could be read.
 */
export async function scrapeCompetitorUrls(urls: string[]): Promise<string> {
  const sections = await Promise.allSettled(
    urls.slice(0, 10).map(async (url) => {
      const resp = await fetchWithRetry(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
        redirect: "follow",
      }, 1);
      if (!resp.ok) return "";
      const html = (await resp.text()).slice(0, 400_000);

      const lines: string[] = [`=== COMPETITOR: ${url} ===`];
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      if (title) lines.push(`TITLE: ${stripHtml(title)}`);

      for (const m of Array.from(html.matchAll(/<meta[^>]+(?:name|property)=["'](description|og:title|og:description|og:site_name|twitter:description)["'][^>]+content=["']([^"']+)["']/gi))) {
        lines.push(`${m[1].toUpperCase()}: ${decodeEntities(m[2])}`);
      }
      for (const m of Array.from(html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](description|og:title|og:description)["']/gi))) {
        lines.push(`${m[2].toUpperCase()}: ${decodeEntities(m[1])}`);
      }

      for (const m of Array.from(html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)).slice(0, 12)) {
        const text = stripHtml(m[1]);
        if (text.length > 3) lines.push(`HEADING: ${text}`);
      }

      for (const m of Array.from(html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)).slice(0, 3)) {
        const json = m[1].trim().slice(0, 2000);
        if (json) lines.push(`STRUCTURED_DATA: ${json}`);
      }

      const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
      const text = stripHtml(body).slice(0, 3000);
      if (text.length > 100) lines.push(`PAGE_TEXT: ${text}`);

      return lines.length > 1 ? lines.join("\n") : "";
    })
  );

  return sections
    .map((s) => (s.status === "fulfilled" ? s.value : ""))
    .filter(Boolean)
    .join("\n\n");
}

// ─── Deep competitor mining: YouTube channels + Skool/review searches ────────

/**
 * Mine a competitor's YouTube channel via the Data API: channel stats plus
 * their most recent and most viewed uploads (titles are their hooks, view
 * counts show what actually performs).
 */
async function scrapeYouTubeChannel(handle: string): Promise<string> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return "";
  try {
    const chResp = await fetchWithRetry(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`,
      undefined,
      1
    );
    if (!chResp.ok) return "";
    const chData = (await chResp.json()) as {
      items?: Array<{
        snippet?: { title?: string; description?: string };
        statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
        contentDetails?: { relatedPlaylists?: { uploads?: string } };
      }>;
    };
    const ch = chData.items?.[0];
    if (!ch) return "";

    const lines: string[] = [];
    lines.push(`YOUTUBE CHANNEL: ${ch.snippet?.title ?? handle} | ${ch.statistics?.subscriberCount ?? "?"} subscribers | ${ch.statistics?.videoCount ?? "?"} videos | ${ch.statistics?.viewCount ?? "?"} total views`);
    if (ch.snippet?.description) lines.push(`CHANNEL BIO: ${ch.snippet.description.slice(0, 500)}`);

    const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
    if (uploads) {
      const plResp = await fetchWithRetry(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploads}&maxResults=15&key=${apiKey}`,
        undefined,
        1
      );
      if (plResp.ok) {
        const plData = (await plResp.json()) as {
          items?: Array<{ snippet?: { title?: string; resourceId?: { videoId?: string } } }>;
        };
        const videoIds = (plData.items ?? [])
          .map((i) => i.snippet?.resourceId?.videoId)
          .filter((v): v is string => !!v);

        if (videoIds.length) {
          const statsResp = await fetchWithRetry(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds.join(",")}&key=${apiKey}`,
            undefined,
            1
          );
          if (statsResp.ok) {
            const statsData = (await statsResp.json()) as {
              items?: Array<{ snippet?: { title?: string }; statistics?: { viewCount?: string; commentCount?: string } }>;
            };
            const videos = (statsData.items ?? [])
              .map((v) => ({
                title: v.snippet?.title ?? "",
                views: Number(v.statistics?.viewCount ?? 0),
              }))
              .filter((v) => v.title);
            videos.sort((a, b) => b.views - a.views);
            for (const v of videos) {
              lines.push(`VIDEO (${v.views.toLocaleString()} views): ${v.title}`);
            }
          }
        }
      }
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/** Extract a searchable identity (handle or slug) from a competitor URL. */
function competitorIdentity(url: string): string {
  const m = url.match(/(?:instagram\.com|youtube\.com|facebook\.com|tiktok\.com|skool\.com)\/(@?[A-Za-z0-9._-]+)/i);
  return (m?.[1] ?? "").replace(/^@/, "");
}

/**
 * Deep sweep of one competitor: their page content, their YouTube channel
 * (if any), and web searches for their Skool community, reviews, and offer.
 */
export async function scrapeCompetitorDeep(url: string): Promise<string> {
  const identity = competitorIdentity(url);
  const sections: string[] = [];

  const [page, channel, searches] = await Promise.all([
    scrapeCompetitorUrls([url]),
    /youtube\.com\/@/i.test(url)
      ? scrapeYouTubeChannel(url.match(/youtube\.com\/(@[A-Za-z0-9._-]+)/i)?.[1] ?? "")
      : Promise.resolve(""),
    identity
      ? Promise.allSettled([
          ddgSearch(`"${identity}" skool community`),
          ddgSearch(`"${identity}" reviews OR scam OR legit`),
        ]).then((rs) =>
          rs
            .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
            .slice(0, 10)
            .map((r) => `WEB: ${r.title} | ${r.snippet}`)
            .join("\n")
        )
      : Promise.resolve(""),
  ]);

  if (page) sections.push(page);
  if (channel) sections.push(channel);
  if (searches) sections.push(`SEARCH RESULTS ABOUT ${identity}:\n${searches}`);
  return sections.join("\n");
}

// ─── Related Keyword Suggestions (Google Suggest — FREE, no key) ─────────────

// ─── Google Trends (free, no key — unofficial endpoints) ─────────────────────

/** Strip Google's anti-JSON prefix ()]}' or similar) before parsing. */
function parseGoogleJson(text: string): unknown {
  return JSON.parse(text.slice(text.indexOf("\n") + 1));
}

export interface GoogleTrendsQueries {
  top: string[];
  rising: string[];
}

/**
 * Related + rising queries from Google Trends for a keyword (last 3 months).
 * Two-step dance: /explore issues widget tokens, /widgetdata/relatedsearches
 * returns the ranked queries. Fails soft — Trends throttles cloud IPs.
 */
let _trendsCookie: string | null = null;

export async function fetchGoogleTrends(keyword: string): Promise<GoogleTrendsQueries> {
  const empty: GoogleTrendsQueries = { top: [], rising: [] };
  try {
    const exploreReq = JSON.stringify({
      comparisonItem: [{ keyword, geo: "US", time: "today 3-m" }],
      category: 0,
      property: "",
    });
    const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(exploreReq)}`;
    const baseHeaders: Record<string, string> = { "user-agent": BROWSER_UA, accept: "application/json" };

    // Google 429s the first anonymous /explore call but hands out a NID
    // cookie with it. Retry once with that cookie — the standard handshake.
    let exploreResp = await fetch(exploreUrl, {
      headers: _trendsCookie ? { ...baseHeaders, cookie: _trendsCookie } : baseHeaders,
    });
    if (exploreResp.status === 429) {
      const setCookie = exploreResp.headers.get("set-cookie");
      const nid = setCookie?.match(/NID=[^;]+/)?.[0];
      if (!nid) return empty;
      _trendsCookie = nid;
      exploreResp = await fetch(exploreUrl, { headers: { ...baseHeaders, cookie: _trendsCookie } });
    }
    if (!exploreResp.ok) return empty;
    const explore = parseGoogleJson(await exploreResp.text()) as {
      widgets?: Array<{ id?: string; token?: string; request?: unknown }>;
    };
    const widget = explore.widgets?.find((w) => w.id === "RELATED_QUERIES");
    if (!widget?.token || !widget.request) return empty;

    const dataResp = await fetchWithRetry(
      `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${widget.token}`,
      { headers: { ...baseHeaders, ...(_trendsCookie ? { cookie: _trendsCookie } : {}) } },
      1
    );
    if (!dataResp.ok) return empty;
    const data = parseGoogleJson(await dataResp.text()) as {
      default?: { rankedList?: Array<{ rankedKeyword?: Array<{ query?: string }> }> };
    };
    const [topList, risingList] = data.default?.rankedList ?? [];
    return {
      top: (topList?.rankedKeyword ?? []).map((k) => k.query ?? "").filter(Boolean).slice(0, 10),
      rising: (risingList?.rankedKeyword ?? []).map((k) => k.query ?? "").filter(Boolean).slice(0, 10),
    };
  } catch {
    return empty;
  }
}

/**
 * Related search phrases: Google Trends rising/top queries first (real demand
 * signal), padded with Google Suggest autocomplete. Free and unmetered.
 */
export async function fetchRelatedSearches(keyword: string): Promise<string[]> {
  const suggestions: string[] = [];
  const variants = [keyword, `${keyword} for `, `why ${keyword}`, `${keyword} vs`];

  const [trends] = await Promise.all([
    fetchGoogleTrends(keyword),
    Promise.allSettled(
      variants.map(async (v) => {
        try {
          const resp = await fetchWithRetry(
            `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(v)}`,
            { headers: { "user-agent": BROWSER_UA } },
            1
          );
          if (!resp.ok) return;
          const data = (await resp.json()) as [string, string[]];
          for (const s of data[1] ?? []) {
            if (s && s.toLowerCase() !== keyword.toLowerCase()) suggestions.push(s);
          }
        } catch { /* skip */ }
      })
    ),
  ]);

  const merged = [
    ...trends.rising,
    ...trends.top,
    ...suggestions,
  ].filter((s) => s.toLowerCase() !== keyword.toLowerCase());

  return Array.from(new Set(merged)).slice(0, 8);
}
