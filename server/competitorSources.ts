/**
 * Competitor source harvesting: finds Instagram accounts and YouTube channels
 * in a client's voice-mining research + onboarding material. Feeds the
 * Competitor Desk miner and the worker's auto-refresh mining.
 */

export type CompetitorSource = {
  platform: "instagram" | "youtube";
  handle: string;
  url: string;
  origin: "research" | "onboarding";
  /** Human-readable name (resolved channel title for raw YouTube channel ids). */
  label?: string;
};

/** Raw UC... channel ids mean nothing to the operator: resolve real channel names. */
const ytLabelCache = new Map<string, string>();
export async function resolveYouTubeLabels(sources: CompetitorSource[]): Promise<CompetitorSource[]> {
  const key = process.env.YOUTUBE_API_KEY;
  const unresolved = key
    ? sources.filter((s) => s.platform === "youtube" && /^UC/.test(s.handle) && !ytLabelCache.has(s.handle))
    : [];
  if (unresolved.length) {
    try {
      const ids = unresolved.map((s) => s.handle).join(",");
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${ids}&key=${key}`
      );
      if (res.ok) {
        const data = (await res.json()) as { items?: Array<{ id: string; snippet?: { title?: string } }> };
        for (const item of data.items ?? []) {
          if (item.snippet?.title) ytLabelCache.set(item.id, item.snippet.title);
        }
      }
    } catch {
      /* offline or quota: chips fall back to the raw id */
    }
  }
  return sources.map((s) =>
    s.platform === "youtube" && ytLabelCache.has(s.handle) ? { ...s, label: ytLabelCache.get(s.handle) } : s
  );
}

const IG_NON_HANDLES = ["p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct"];

/** Harvest platform-tagged competitor sources from texts, research first. */
export function harvestCompetitorSources(inputs: {
  /** Competitor URLs pasted into voice-mining searches. */
  researchUrls: string[];
  /** Full text of the research report (competitor intel section carries links). */
  researchText?: string;
  /** Onboarding document contents. */
  onboardingTexts: string[];
  max?: number;
}): CompetitorSource[] {
  const sources = new Map<string, CompetitorSource>();

  const addSource = (platform: CompetitorSource["platform"], rawHandle: string, origin: CompetitorSource["origin"]) => {
    const isChannelId = platform === "youtube" && /^UC[A-Za-z0-9_-]{10,}$/.test(rawHandle);
    const handle = isChannelId ? rawHandle : rawHandle.replace(/^@/, "").toLowerCase();
    if (!handle || (platform === "instagram" && IG_NON_HANDLES.includes(handle))) return;
    const key = `${platform}:${handle}`;
    if (sources.has(key)) return;
    sources.set(key, {
      platform,
      handle,
      url:
        platform === "instagram"
          ? `https://instagram.com/${handle}`
          : isChannelId
            ? `https://youtube.com/channel/${handle}`
            : `https://youtube.com/@${handle}`,
      origin,
    });
  };

  const harvest = (text: string, origin: CompetitorSource["origin"]) => {
    for (const m of Array.from(text.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/g))) addSource("instagram", m[1], origin);
    for (const m of Array.from(text.matchAll(/youtube\.com\/(@[A-Za-z0-9._-]{2,30})/g))) addSource("youtube", m[1], origin);
    for (const m of Array.from(text.matchAll(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{10,})/g))) addSource("youtube", m[1], origin);
    for (const m of Array.from(text.matchAll(/youtube\.com\/(?:c|user)\/([A-Za-z0-9._-]{2,30})/g))) addSource("youtube", m[1], origin);
  };

  for (const u of inputs.researchUrls) harvest(u, "research");
  if (inputs.researchText) harvest(inputs.researchText, "research");
  for (const t of inputs.onboardingTexts) {
    harvest(t, "onboarding");
    for (const m of Array.from(t.matchAll(/(?:^|[\s(])@([A-Za-z0-9._]{3,30})\b/g))) {
      addSource("instagram", m[1], "onboarding");
    }
  }

  return Array.from(sources.values()).slice(0, inputs.max ?? 24);
}

/** The standard deep-mine request the miner and the auto-refresh both send. */
export function composeMineRequest(sources: CompetitorSource[]): string {
  const ig = sources.filter((s) => s.platform === "instagram").map((s) => s.handle);
  const yt = sources
    .filter((s) => s.platform === "youtube")
    .map((s) => (s.handle.startsWith("UC") ? s.handle : `@${s.handle}`));
  return (
    `Run competitor content intel.` +
    (ig.length ? ` INSTAGRAM accounts: ${ig.join(", ")}.` : "") +
    (yt.length ? ` YOUTUBE channels: ${yt.join(", ")}.` : "") +
    ` Mine DEEP on every source: 10 reels per Instagram account blending its top performers with its newest posts, and 10 recent long-form videos per YouTube channel.` +
    ` If the total source count is under 10, DISCOVER more top competitors in this niche (research report competitor intel + web search) until you have at least 10 sources across both platforms, and mine those too.`
  );
}
