/**
 * Live follower/subscriber stats for a client's OWN socials, for the Overview
 * card. YouTube via the free Data API; Instagram via an Apify profile actor.
 * Cached in-memory for an hour so the Overview never hammers either API.
 */

export interface SocialStat {
  platform: "instagram" | "youtube";
  handle: string;
  url: string;
  followers?: number;
  posts?: number;
  extra?: number; // YT total views
  extraLabel?: string;
  error?: string;
}

const cache = new Map<string, { at: number; stat: SocialStat }>();
const TTL_MS = 60 * 60 * 1000;

const cleanHandle = (h: string) => h.replace(/^@+/, "").replace(/.*\/(@?[^/?]+).*/, "$1").replace(/^@/, "").trim();

async function fetchYouTube(raw: string): Promise<SocialStat> {
  const handle = cleanHandle(raw);
  const url = `https://youtube.com/@${handle}`;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { platform: "youtube", handle, url, error: "no API key" };
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=statistics&forHandle=@${encodeURIComponent(handle)}&key=${key}`
    );
    const data = (await res.json()) as {
      items?: Array<{ statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string } }>;
    };
    const s = data.items?.[0]?.statistics;
    if (!s) return { platform: "youtube", handle, url, error: "channel not found" };
    return {
      platform: "youtube",
      handle,
      url,
      followers: Number(s.subscriberCount) || 0,
      posts: Number(s.videoCount) || 0,
      extra: Number(s.viewCount) || 0,
      extraLabel: "total views",
    };
  } catch (err) {
    return { platform: "youtube", handle, url, error: (err as Error).message.slice(0, 120) };
  }
}

async function fetchInstagram(raw: string): Promise<SocialStat> {
  const handle = cleanHandle(raw);
  const url = `https://instagram.com/${handle}`;
  const token = process.env.APIFY_TOKEN;
  if (!token) return { platform: "instagram", handle, url, error: "no Apify token" };
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernames: [handle] }),
      }
    );
    if (!res.ok) return { platform: "instagram", handle, url, error: `Apify HTTP ${res.status}` };
    const items = (await res.json()) as Array<{ followersCount?: number; postsCount?: number }>;
    const p = items?.[0];
    if (!p) return { platform: "instagram", handle, url, error: "profile not found" };
    return {
      platform: "instagram",
      handle,
      url,
      followers: Number(p.followersCount) || 0,
      posts: Number(p.postsCount) || 0,
    };
  } catch (err) {
    return { platform: "instagram", handle, url, error: (err as Error).message.slice(0, 120) };
  }
}

async function cached(platform: "instagram" | "youtube", raw: string): Promise<SocialStat> {
  const cacheKey = `${platform}:${cleanHandle(raw)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.stat;
  const stat = platform === "youtube" ? await fetchYouTube(raw) : await fetchInstagram(raw);
  // Only cache successes; let errors retry next load
  if (!stat.error) cache.set(cacheKey, { at: Date.now(), stat });
  return stat;
}

/** Fetch whichever of the client's socials are set, in parallel. */
export async function getClientSocialStats(client: {
  instagramHandle?: string | null;
  youtubeHandle?: string | null;
}): Promise<SocialStat[]> {
  const jobs: Promise<SocialStat>[] = [];
  if (client.instagramHandle?.trim()) jobs.push(cached("instagram", client.instagramHandle));
  if (client.youtubeHandle?.trim()) jobs.push(cached("youtube", client.youtubeHandle));
  return Promise.all(jobs);
}
