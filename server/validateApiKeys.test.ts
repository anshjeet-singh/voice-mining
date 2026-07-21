/**
 * API Key Validation Tests
 * Validates that all real scraping API keys are configured and working.
 * These hit LIVE external APIs, so they only run with RUN_LIVE_TESTS=1 —
 * the default `pnpm test` stays deterministic and offline-safe.
 */
import { describe, it, expect } from "vitest";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY;

describe.skipIf(!process.env.RUN_LIVE_TESTS)("API Key Validation", () => {
  it("YOUTUBE_API_KEY is set", () => {
    expect(YOUTUBE_API_KEY).toBeTruthy();
    expect(YOUTUBE_API_KEY!.length).toBeGreaterThan(10);
  });

  it("TWITTER_BEARER_TOKEN is set", () => {
    expect(TWITTER_BEARER_TOKEN).toBeTruthy();
    expect(TWITTER_BEARER_TOKEN!.length).toBeGreaterThan(10);
  });

  it("NEWS_API_KEY is set", () => {
    expect(NEWS_API_KEY).toBeTruthy();
    expect(NEWS_API_KEY!.length).toBeGreaterThan(10);
  });

  it("SERP_API_KEY is set", () => {
    expect(SERP_API_KEY).toBeTruthy();
    expect(SERP_API_KEY!.length).toBeGreaterThan(10);
  });

  it("YouTube Data API v3 responds to a real search", async () => {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test+keyword&maxResults=3&key=${YOUTUBE_API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    // Should return items, not an error
    expect(data.error).toBeUndefined();
    expect(data.items).toBeDefined();
    expect(data.items.length).toBeGreaterThan(0);
  }, 15000);

  it("SerpAPI responds to a real search", async () => {
    const url = `https://serpapi.com/search.json?q=test+keyword&num=3&api_key=${SERP_API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    expect(data.error).toBeUndefined();
    expect(data.organic_results).toBeDefined();
  }, 15000);

  it("NewsAPI responds to a real search", async () => {
    const url = `https://newsapi.org/v2/everything?q=test&language=en&pageSize=3&apiKey=${NEWS_API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    expect(data.status).toBe("ok");
    expect(data.articles).toBeDefined();
  }, 15000);

  it("Twitter Bearer Token is valid (token authenticated, quota may be depleted)", async () => {
    const url = `https://api.twitter.com/2/tweets/search/recent?query=test%20-is:retweet%20lang:en&max_results=10`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` },
    });
    // 200 = success with data
    // 402 = credits depleted (token valid, monthly quota exhausted — resets next month)
    // 403 = forbidden (free tier endpoint restriction but token is valid)
    // 401 = unauthorized (wrong token — this should NOT happen)
    expect(resp.status).not.toBe(401);
    expect([200, 402, 403]).toContain(resp.status);
  }, 15000);
});
