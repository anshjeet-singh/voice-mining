/**
 * Apify integration: Facebook Groups voice mining.
 *
 * Facebook hard-walls groups behind login, so this is the one source we pay
 * for: discover public groups where the niche talks (via Google/DDG), then
 * run Apify's maintained facebook-groups-scraper on the top groups and mine
 * post text + comments. Degrades gracefully without APIFY_TOKEN.
 */

export interface GroupConversation {
  platform: string;
  text: string;
  source?: string;
}

/**
 * Pull ranked public group base-URLs out of search result links.
 * Group posts link like facebook.com/groups/<idOrSlug>/posts/<postId>;
 * rank groups by how often they appear in the results. Pure, unit-testable.
 */
export function extractFacebookGroupUrls(links: string[], cap = 2): string[] {
  const counts = new Map<string, number>();
  for (const link of links) {
    const m = link.match(/facebook\.com\/groups\/([A-Za-z0-9._-]+)/i);
    if (!m) continue;
    const base = `https://www.facebook.com/groups/${m[1]}`;
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, cap)
    .map(([url]) => url);
}

/** Map raw actor dataset items to conversations. Defensive: field names vary by actor version. */
export function mapGroupItems(items: Array<Record<string, unknown>>): GroupConversation[] {
  const out: GroupConversation[] = [];
  for (const item of items) {
    const url = typeof item.url === "string" ? item.url : (item.facebookUrl as string | undefined);
    const text = [item.text, item.message, item.post_text].find(
      (t): t is string => typeof t === "string" && t.trim().length > 25
    );
    if (text) {
      out.push({ platform: "facebook_groups", text: text.replace(/\s+/g, " ").slice(0, 700), source: url });
    }
    for (const key of ["topComments", "comments", "latestComments"]) {
      const comments = item[key];
      if (!Array.isArray(comments)) continue;
      for (const c of comments) {
        const ctext = (c as Record<string, unknown>)?.text ?? (c as Record<string, unknown>)?.message;
        if (typeof ctext === "string" && ctext.trim().length > 25) {
          out.push({
            platform: "facebook_groups",
            text: ctext.replace(/\s+/g, " ").slice(0, 500),
            source: url,
          });
        }
      }
    }
  }
  return out;
}

/** Run an Apify actor synchronously and return its dataset items. */
async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
  timeoutSecs = 240
): Promise<Array<Record<string, unknown>>> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return [];
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSecs}&format=json`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((timeoutSecs + 30) * 1000),
  });
  if (!resp.ok) {
    console.warn(`[apify] ${actorId} HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return [];
  }
  const data = (await resp.json()) as unknown;
  return Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
}

/**
 * Voice-mine public Facebook groups for a keyword: find the groups where this
 * market talks, scrape recent posts + comments from the top ones.
 * `findGroupLinks` is injected so the caller supplies its own search engine
 * (SerpAPI/DDG live in realScraper) and this module stays independently testable.
 */
export async function scrapeFacebookGroups(
  keyword: string,
  findGroupLinks: (query: string) => Promise<string[]>
): Promise<GroupConversation[]> {
  if (!process.env.APIFY_TOKEN) return [];
  try {
    const primary = keyword.split(",")[0]?.trim() ?? keyword;
    const links = await findGroupLinks(`site:facebook.com/groups "${primary}"`);
    const groups = extractFacebookGroupUrls(links);
    if (!groups.length) return [];

    const items = await runApifyActor("apify~facebook-groups-scraper", {
      startUrls: groups.map((url) => ({ url })),
      resultsLimit: 20,
      viewOption: "CHRONOLOGICAL",
    });
    const conversations = mapGroupItems(items);
    console.log(
      `[apify] facebook groups "${primary}": ${groups.length} groups -> ${conversations.length} posts/comments`
    );
    return conversations;
  } catch (err) {
    console.warn("[apify] facebook groups failed:", String(err).slice(0, 200));
    return [];
  }
}
