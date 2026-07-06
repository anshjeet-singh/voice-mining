/**
 * Real Internet Scraper
 * Fetches genuine online conversations for any keyword from:
 *  - SerpAPI: Google organic, Bing, DuckDuckGo, Google Discussions, Google News, Yelp reviews, Amazon reviews
 *  - YouTube Data API v3 (video search + comments)
 *  - Twitter/X API v2 (recent tweets — requires quota)
 *  - NewsAPI (news headlines + descriptions)
 *
 * Falls back gracefully if any API key is missing or a call fails.
 * All scrapers run in parallel to minimise latency.
 */

import { getCachedScrape, saveCachedScrape } from "./db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScrapedConversation {
  platform: string;
  text: string;
  source?: string;
}

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

// ─── Helper: SerpAPI fetch ────────────────────────────────────────────────────

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

// ─── 1. Google Organic (forums, Reddit snippets, blogs) ──────────────────────

async function scrapeGoogle(keyword: string): Promise<ScrapedConversation[]> {
  if (!process.env.SERP_API_KEY) return [];
  const results: ScrapedConversation[] = [];

  const queries = [
    `${keyword} site:reddit.com`,
    `${keyword} "I tried" OR "I wasted" OR "I finally" OR "I can't" OR "I've been"`,
    `${keyword} reviews OR complaints OR testimonials`,
    `${keyword} forum OR community OR "anyone else"`,
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
    // People Also Ask
    const paa = (data.related_questions as Array<Record<string, string>> | undefined) ?? [];
    for (const p of paa) {
      if (p.question) results.push({ platform: "quora", text: p.question });
      if (p.snippet) results.push({ platform: "forums", text: p.snippet });
    }
  }));

  return results;
}

// ─── 2. Bing (different index — surfaces different forums and blogs) ──────────

async function scrapeBing(keyword: string): Promise<ScrapedConversation[]> {
  if (!process.env.SERP_API_KEY) return [];
  const results: ScrapedConversation[] = [];

  const data = await serpFetch({ engine: "bing", q: keyword, count: "20" });
  const organic = (data.organic_results as Array<Record<string, string>> | undefined) ?? [];
  for (const r of organic) {
    if (r.snippet?.length > 30) {
      results.push({ platform: "bing", text: r.snippet, source: r.url });
    }
    if (r.title?.length > 20) {
      results.push({ platform: "bing", text: r.title, source: r.url });
    }
  }
  return results;
}

// ─── 3. DuckDuckGo (privacy-focused index — different coverage) ───────────────

async function scrapeDuckDuckGo(keyword: string): Promise<ScrapedConversation[]> {
  if (!process.env.SERP_API_KEY) return [];
  const results: ScrapedConversation[] = [];

  const data = await serpFetch({ engine: "duckduckgo", q: keyword });
  const organic = (data.organic_results as Array<Record<string, string>> | undefined) ?? [];
  for (const r of organic) {
    if (r.snippet?.length > 30) {
      results.push({ platform: "duckduckgo", text: r.snippet, source: r.link });
    }
  }
  return results;
}

// ─── 4. Google Discussions (forum threads, Reddit posts via Google) ───────────

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

  // Discussions & Forums block (if present)
  const discussions = (data.discussions_and_forums as Array<Record<string, unknown>> | undefined) ?? [];
  for (const d of discussions) {
    const title = d.title as string | undefined;
    const snippet = d.snippet as string | undefined;
    if (title && title.length > 15) results.push({ platform: "forums", text: title });
    if (snippet && snippet.length > 30) results.push({ platform: "forums", text: snippet });
  }

  return results;
}

// ─── 5. Google News ───────────────────────────────────────────────────────────

async function scrapeGoogleNews(keyword: string): Promise<ScrapedConversation[]> {
  if (!process.env.SERP_API_KEY) return [];
  const results: ScrapedConversation[] = [];

  const data = await serpFetch({ engine: "google", q: keyword, tbm: "nws", num: "15" });
  const news = (data.news_results as Array<Record<string, string>> | undefined) ?? [];
  for (const r of news) {
    if (r.title?.length > 20) results.push({ platform: "news", text: r.title, source: r.link });
    if (r.snippet?.length > 30) results.push({ platform: "news", text: r.snippet, source: r.link });
  }
  return results;
}

// ─── 6. Yelp Reviews (verbatim customer language — very high quality) ─────────

async function scrapeYelp(keyword: string): Promise<ScrapedConversation[]> {
  if (!process.env.SERP_API_KEY) return [];
  const results: ScrapedConversation[] = [];

  try {
    const data = await serpFetch({
      engine: "yelp",
      find_desc: keyword,
      find_loc: "United States",
    });

    const organic = (data.organic_results as Array<Record<string, unknown>> | undefined) ?? [];
    for (const r of organic) {
      // Yelp returns reviews array per business
      const reviews = (r.reviews as Array<Record<string, string>> | undefined) ?? [];
      for (const review of reviews) {
        const comment = review.comment;
        if (comment && comment.length > 20) {
          const website = r.website as string | undefined;
          results.push({ platform: "yelp_reviews", text: comment, source: website });
        }
      }
      // Also grab the business snippet/description
      const snippet = r.snippet as string | undefined;
      if (snippet && snippet.length > 20) {
        results.push({ platform: "yelp_reviews", text: snippet });
      }
    }
  } catch {
    // Yelp may not be relevant for all keywords — skip silently
  }

  return results;
}

// ─── 7. Amazon Reviews (buyer language — excellent for product niches) ────────

async function scrapeAmazon(keyword: string): Promise<ScrapedConversation[]> {
  if (!process.env.SERP_API_KEY) return [];
  const results: ScrapedConversation[] = [];

  try {
    const data = await serpFetch({ engine: "amazon", k: keyword });
    const organic = (data.organic_results as Array<Record<string, unknown>> | undefined) ?? [];
    for (const r of organic) {
      // Amazon returns product titles and sometimes review snippets
      const title = r.title as string | undefined;
      if (title && title.length > 20) {
        results.push({ platform: "amazon", text: title });
      }
      const reviews = r.reviews as Record<string, unknown> | undefined;
      if (reviews) {
        const snippet = reviews.snippet as string | undefined;
        if (snippet && snippet.length > 20) {
          results.push({ platform: "amazon_reviews", text: snippet });
        }
      }
    }
  } catch {
    // Amazon may not be relevant for all keywords — skip silently
  }

  return results;
}

// ─── 8. YouTube (Data API v3 — video search + comments) ──────────────────────

/** YouTube Data API v3 search.list — titles + descriptions for a keyword. */
export async function searchYouTubeVideos(
  keyword: string,
  maxResults = 8
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
    const videos = await searchYouTubeVideos(keyword, 8);

    for (const vid of videos) {
      results.push({ platform: "youtube", text: vid.title, source: `https://youtube.com/watch?v=${vid.videoId}` });
      if (vid.description && vid.description.length > 20) {
        results.push({ platform: "youtube", text: vid.description, source: `https://youtube.com/watch?v=${vid.videoId}` });
      }
    }

    // Fetch comments from top 5 videos
    if (apiKey && videos.length > 0) {
      const topVideoIds = videos.slice(0, 5).map((v) => v.videoId).filter(Boolean);
      await Promise.allSettled(topVideoIds.map(async (videoId) => {
        try {
          const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=30&order=relevance&key=${apiKey}`;
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

// ─── 9. Twitter/X ─────────────────────────────────────────────────────────────

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
    if (!resp.ok) return results; // 402 = quota depleted, skip silently
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

// ─── 10. NewsAPI ──────────────────────────────────────────────────────────────

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

/**
 * Scrape all 10 sources for a keyword and return an LLM-ready text blob.
 * Results are cached for 24 hours per keyword (repeat searches are instant),
 * and concurrent requests for the same keyword share one in-flight scrape.
 */
export async function scrapeInternetForKeyword(
  keyword: string,
  platforms: string[]
): Promise<string> {
  const cacheKey = keyword.toLowerCase().trim();

  // 24h cache: repeat searches reuse the raw scrape
  const cached = await getCachedScrape(cacheKey).catch(() => undefined);
  if (cached) return cached;

  const inFlight = inFlightScrapes.get(cacheKey);
  if (inFlight) return inFlight;

  const scrapePromise = doScrape(keyword, platforms)
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

async function doScrape(keyword: string, _platforms: string[]): Promise<string> {
  // Run all scrapers in parallel for maximum speed
  const [
    googleResults,
    bingResults,
    ddgResults,
    discussionResults,
    googleNewsResults,
    yelpResults,
    amazonResults,
    youtubeResults,
    twitterResults,
    newsResults,
  ] = await Promise.all([
    scrapeGoogle(keyword),
    scrapeBing(keyword),
    scrapeDuckDuckGo(keyword),
    scrapeGoogleDiscussions(keyword),
    scrapeGoogleNews(keyword),
    scrapeYelp(keyword),
    scrapeAmazon(keyword),
    scrapeYouTube(keyword),
    scrapeTwitter(keyword),
    scrapeNews(keyword),
  ]);

  // Priority order: comments/reviews first (richest voice mining), then organic, then news
  const allResults: ScrapedConversation[] = [
    ...youtubeResults,       // YouTube comments — richest verbatim language
    ...yelpResults,          // Yelp reviews — verbatim customer complaints/praise
    ...amazonResults,        // Amazon reviews — buyer language
    ...discussionResults,    // Forum/Reddit threads
    ...googleResults,        // Google organic + People Also Ask
    ...ddgResults,           // DuckDuckGo — different index coverage
    ...bingResults,          // Bing — different index coverage
    ...twitterResults,       // Twitter/X posts
    ...googleNewsResults,    // Google News
    ...newsResults,          // NewsAPI articles
  ];

  if (allResults.length === 0) {
    return `NO_SCRAPED_DATA`;
  }

  // Deduplicate and format for LLM consumption
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const r of allResults) {
    const clean = r.text.trim();
    if (clean.length < 15) continue;
    const key = clean.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`[${r.platform.toUpperCase()}] ${clean}`);
    if (lines.length >= 200) break; // Increased cap for richer data
  }

  return lines.join("\n");
}

// ─── Competitor Intelligence Scrape ──────────────────────────────────────────

/**
 * Dedicated SerpAPI sweep for competitor research on a keyword: top
 * brands/providers, their messaging (titles + snippets), review complaints,
 * and pricing signals. Returns an LLM-ready text blob, or "NO_SCRAPED_DATA".
 */
export async function scrapeCompetitorsForKeyword(keyword: string): Promise<string> {
  if (!process.env.SERP_API_KEY) return "NO_SCRAPED_DATA";

  const queries = [
    { q: `best ${keyword} companies OR services OR programs`, tag: "TOP_PLAYERS" },
    { q: `${keyword} competitors comparison`, tag: "COMPARISONS" },
    { q: `${keyword} reviews complaints "not worth it" OR scam OR disappointed`, tag: "COMPLAINTS" },
    { q: `${keyword} pricing cost "per month" OR "one time" OR fee`, tag: "PRICING" },
  ];

  const lines: string[] = [];

  await Promise.allSettled(
    queries.map(async ({ q, tag }) => {
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
    })
  );

  if (lines.length === 0) return "NO_SCRAPED_DATA";

  // Dedupe and cap
  const seen = new Set<string>();
  const deduped = lines.filter((line) => {
    const key = line.toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.slice(0, 120).join("\n");
}

// ─── Related Keyword Suggestions ─────────────────────────────────────────────

/**
 * Quick SerpAPI call returning up to 5 related search phrases for a keyword.
 * Used by the New Search page for live keyword suggestions.
 */
export async function fetchRelatedSearches(keyword: string): Promise<string[]> {
  if (!process.env.SERP_API_KEY) return [];

  const data = await serpFetch({ engine: "google", q: keyword, num: "10" });

  const suggestions: string[] = [];

  const related = (data.related_searches as Array<Record<string, unknown>> | undefined) ?? [];
  for (const r of related) {
    const query = r.query as string | undefined;
    if (query && query.toLowerCase() !== keyword.toLowerCase()) suggestions.push(query);
  }

  // Backfill from People Also Ask if related_searches came up short
  if (suggestions.length < 5) {
    const paa = (data.related_questions as Array<Record<string, string>> | undefined) ?? [];
    for (const p of paa) {
      if (p.question) suggestions.push(p.question);
    }
  }

  return Array.from(new Set(suggestions)).slice(0, 5);
}
