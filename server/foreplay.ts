/**
 * Foreplay ad-spy integration. Pulls ads that are actually running (and
 * staying live) in the client's niche from the Foreplay discovery library,
 * formatted as pattern models for the ad generator. A long-running live ad
 * is a profitably spending ad; its hook shape and offer framing are proven.
 */

interface ForeplayAd {
  id: string;
  name?: string;
  headline?: string;
  description?: string;
  full_transcription?: string | null;
  cta_type?: string;
  display_format?: string;
  live?: boolean;
  running_duration?: { days?: number };
  emotional_drivers?: Record<string, number>;
  product_category?: string;
}

/** Format Foreplay ads as an LLM-ready blob. Pure, unit-testable. */
export function formatForeplayAds(ads: ForeplayAd[], cap = 12): string {
  const lines: string[] = [];
  for (const ad of ads.slice(0, cap)) {
    const bits: string[] = [];
    const days = ad.running_duration?.days ?? 0;
    bits.push(
      `AD by ${ad.name ?? "unknown"} (${(ad.display_format ?? "?").toLowerCase()}, ${
        ad.live ? "LIVE" : "ended"
      }, running ${days}+ days${ad.product_category ? `, sells: ${ad.product_category}` : ""})`
    );
    if (ad.headline) bits.push(`HEADLINE: ${ad.headline}`);
    if (ad.description) bits.push(`COPY: ${ad.description.replace(/\s+/g, " ").slice(0, 450)}`);
    if (ad.full_transcription) {
      bits.push(`VIDEO SCRIPT: ${ad.full_transcription.replace(/\s+/g, " ").slice(0, 500)}`);
    }
    if (ad.cta_type) bits.push(`CTA: ${ad.cta_type}`);
    const emotions = Object.entries(ad.emotional_drivers ?? {})
      .filter(([, v]) => v >= 7)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v}/10`);
    if (emotions.length) bits.push(`LEANS ON: ${emotions.join(", ")}`);
    lines.push(bits.join("\n"));
  }
  return lines.join("\n\n");
}

/**
 * Fetch winning ads for a niche: longest-running first (proven spenders),
 * topped up with most-relevant. Returns "" when no key or no results,
 * so callers can degrade gracefully.
 */
export async function fetchForeplayWinningAds(keyword: string): Promise<string> {
  const key = process.env.FOREPLAY_API_KEY;
  if (!key) return "";
  const primary = keyword.split(",")[0]?.trim() ?? keyword;
  const base = "https://public.api.foreplay.co/api/discovery/ads";
  const queries = [
    `${base}?query=${encodeURIComponent(primary)}&limit=10&order=longest_running`,
    `${base}?query=${encodeURIComponent(primary)}&limit=8&order=most_relevant`,
  ];

  const seen = new Set<string>();
  const ads: ForeplayAd[] = [];
  await Promise.allSettled(
    queries.map(async (url) => {
      try {
        const resp = await fetch(url, {
          headers: { Authorization: key },
          signal: AbortSignal.timeout(20_000),
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { data?: ForeplayAd[] };
        for (const ad of data.data ?? []) {
          if (!ad.id || seen.has(ad.id)) continue;
          seen.add(ad.id);
          ads.push(ad);
        }
      } catch (err) {
        console.warn("[foreplay] fetch failed:", String(err).slice(0, 120));
      }
    })
  );

  if (!ads.length) return "";
  // Longest-running live ads first: they are the proven spenders
  ads.sort(
    (a, b) =>
      (b.live ? 1 : 0) - (a.live ? 1 : 0) ||
      (b.running_duration?.days ?? 0) - (a.running_duration?.days ?? 0)
  );
  console.log(`[foreplay] "${primary}": ${ads.length} ads from the library`);
  return formatForeplayAds(ads);
}
