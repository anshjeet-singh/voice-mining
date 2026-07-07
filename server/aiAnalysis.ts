import { invokeLLM } from "./_core/llm";
import type {
  AdCopyIdea,
  CompetitorIntel,
  DeepMarketIntelligence,
  EmailSequence,
  InsightItem,
  InsightList,
  SkoolPostWithDMWorkflow,
  SentimentBreakdown,
  TalkingHeadScript,
  Theme,
  VerbatimQuote,
  ViralHook,
  YouTubeIdea,
} from "../drizzle/schema";
import { estimateScriptSeconds, insightTexts } from "../shared/reportContent";
import {
  HOOK_TEMPLATES,
  HORMOZI_HOOK_BANK,
  GOATED_ADS_FRAMEWORK,
  FACEBOOK_AD_FRAMEWORKS,
  SKOOL_POST_FRAMEWORKS,
  EMAIL_SEQUENCE_FRAMEWORKS,
  CONTENT_SCRIPT_FRAMEWORKS,
} from "./trainingData";

// Real internet scraping — imported from realScraper.ts
import { scrapeCompetitorsForKeyword, scrapeCompetitorUrls, scrapeInternetForKeyword } from "./realScraper";

// ─── Helper to extract string content from LLM response ─────────────────────

function extractContent(raw: string | unknown[]): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const textPart = raw.find((p: unknown) => (p as { type: string }).type === "text") as { type: string; text: string } | undefined;
    return textPart?.text ?? "{}";
  }
  return "{}";
}

/**
 * Parse LLM JSON output with repair fallbacks. Models occasionally emit
 * trailing commas, smart quotes, or prose around the object — a raw
 * JSON.parse throw here used to kill the entire report pipeline.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLLMJson(content: string): Record<string, any> {
  try {
    return JSON.parse(content);
  } catch {
    // Fall through to repairs
  }
  let repaired = content
    // cut anything before the first { and after the last }
    .slice(content.indexOf("{"), content.lastIndexOf("}") + 1)
    // smart quotes → straight quotes (only when used as JSON string delimiters)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // trailing commas before } or ]
    .replace(/,\s*([}\]])/g, "$1")
    // unescaped control characters inside strings (keep \n for the last-resort pass)
    .replace(/[\u0000-\u0009\u000B-\u001F]/g, " ");
  try {
    return JSON.parse(repaired);
  } catch {
    // Last resort: escape literal newlines that appear inside string values
    repaired = repaired.replace(/("(?:[^"\\]|\\.)*)\n((?:[^"\\]|\\.)*")/g, "$1\\n$2");
    return JSON.parse(repaired);
  }
}

// Strip em-dashes from AI output
function stripEmDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ". ").replace(/\s*–\s*/g, ". ");
}

function stripEmDashesDeep<T>(obj: T): T {
  if (typeof obj === "string") return stripEmDashes(obj) as unknown as T;
  if (Array.isArray(obj)) return obj.map(stripEmDashesDeep) as unknown as T;
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = stripEmDashesDeep(v);
    }
    return result as T;
  }
  return obj;
}

// ─── Core AI Analysis ────────────────────────────────────────────────────────

export interface AnalysisOutput {
  painPoints: InsightItem[];
  desires: InsightItem[];
  objections: InsightItem[];
  fears: InsightItem[];
  buyingTriggers: string[];
  emotionalLanguage: string[];
  trendingPhrases: string[];
  verbatimQuotes: VerbatimQuote[];
  topThemes: Theme[];
  sentimentBreakdown: SentimentBreakdown;
}

/**
 * What the report generators accept: an AnalysisOutput fresh from runAnalysis,
 * or a DB row where the insight columns may still hold legacy string[].
 * Generators normalize via insightTexts()/topInsights() so both shapes work.
 */
export interface AnalysisInput {
  painPoints: InsightList;
  desires: InsightList;
  objections: InsightList;
  fears: InsightList;
  buyingTriggers: string[];
  emotionalLanguage: string[];
  trendingPhrases: string[];
  verbatimQuotes: VerbatimQuote[];
  topThemes: Theme[];
  sentimentBreakdown: SentimentBreakdown;
}

/** Top-N insight texts from either legacy or structured insight lists. */
function topInsights(list: InsightList, n: number): string {
  return insightTexts(list).slice(0, n).join(" | ");
}

/** Coerce LLM output into InsightItem[] even if the model returned plain strings. */
function coerceInsights(raw: unknown): InsightItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): InsightItem | null => {
      if (typeof item === "string") {
        return { text: item, frequency: 0, verbatimExample: "", platform: "", theme: "" };
      }
      if (item && typeof item === "object" && typeof (item as InsightItem).text === "string") {
        const i = item as Partial<InsightItem>;
        return {
          text: i.text ?? "",
          frequency: Math.max(0, Math.min(100, Number(i.frequency) || 0)),
          verbatimExample: typeof i.verbatimExample === "string" ? i.verbatimExample : "",
          platform: typeof i.platform === "string" ? i.platform : "",
          theme: typeof i.theme === "string" ? i.theme : "",
        };
      }
      return null;
    })
    .filter((i): i is InsightItem => i !== null && i.text.length > 0);
}

/**
 * Scrape the internet for a keyword and extract structured voice-of-customer
 * insights (pain points, desires, objections, fears — each with frequency,
 * verbatim example, platform, and theme). Skips the LLM entirely and returns
 * empty results when no real data could be scraped. `onProgress` surfaces
 * live scraping activity (per-source counts) to the UI.
 */
export async function runAnalysis(
  keyword: string,
  platforms: string[],
  brandVoice?: string,
  onProgress?: (message: string) => void
): Promise<AnalysisOutput> {
  // One search can carry several comma-separated keywords ("kw1, kw2, kw3")
  // that all feed the SAME report. Scrape each one and merge the blobs.
  const keywords = keyword
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 10);

  const blobs: string[] = [];
  for (const [i, kw] of Array.from(keywords.entries())) {
    const prefix = keywords.length > 1 ? `[${i + 1}/${keywords.length}] "${kw}": ` : "";
    const blob = await scrapeInternetForKeyword(kw, platforms, onProgress ? (m) => onProgress(prefix + m) : undefined);
    if (blob !== "NO_SCRAPED_DATA" && blob.trim().length > 0) {
      blobs.push(keywords.length > 1 ? `═══ KEYWORD: ${kw} ═══\n${blob}` : blob);
    }
  }
  const conversations = blobs.join("\n\n");

  // If no scraped data came back, skip LLM entirely — never generate from niche context
  const hasRealData = conversations.trim().length > 0;
  if (!hasRealData) {
    return {
      painPoints: [],
      desires: [],
      objections: [],
      fears: [],
      buyingTriggers: [],
      emotionalLanguage: [],
      trendingPhrases: [],
      verbatimQuotes: [],
      topThemes: [],
      sentimentBreakdown: { positive: 0, negative: 0, neutral: 100 },
    };
  }

  // Truncate brand voice to 2000 chars. The LLM only needs enough to understand the niche/audience.
  // Pasting a full transcript (10,000+ chars) overwhelms the context and causes the model to echo it.
  const brandVoiceSnippet = brandVoice ? brandVoice.slice(0, 2000) : undefined;

  // Brand voice goes in the system message (audience context only), conversations in the user message.
  // This structural separation prevents the LLM from treating brand voice as source material.
  const systemContent = [
    "You are an expert market research analyst and voice-of-customer specialist.",
    "Your ONLY job is to analyze the CONVERSATIONS data in the user message and extract what real people are saying online.",
    "CRITICAL RULE: Every pain point, desire, phrase, and quote MUST come exclusively from the CONVERSATIONS data. Never copy, paraphrase, or echo the audience context.",
    "Always respond with valid JSON only.",
    ...(brandVoiceSnippet
      ? ["", "--- AUDIENCE CONTEXT (read once to understand the niche only — do NOT use as source data) ---", brandVoiceSnippet, "--- END AUDIENCE CONTEXT ---"]
      : []),
  ].join("\n");

  const insightShape = {
    text: "the insight phrase in their exact words",
    frequency: 85,
    verbatimExample: "an exact quote from the CONVERSATIONS data that shows this insight",
    platform: "reddit",
    theme: "short theme/cluster name this insight belongs to",
  };

  const conversationPrompt = [
    `Analyze these online conversations about "${keyword}" and extract market intelligence.`,
    "",
    "CONVERSATIONS:",
    conversations,
    "",
    "Return a JSON object with exactly this structure:",
    JSON.stringify({
      painPoints: [insightShape],
      desires: [insightShape],
      objections: [insightShape],
      fears: [insightShape],
      buyingTriggers: ["trigger phrase 1"],
      emotionalLanguage: ["emotional phrase 1"],
      trendingPhrases: ["trending phrase 1"],
      verbatimQuotes: [{ text: "exact quote", category: "pain_point", platform: "reddit" }],
      topThemes: [{ name: "Theme Name", description: "brief description", frequency: 85, sentiment: "negative" }],
      sentimentBreakdown: { positive: 25, negative: 55, neutral: 20 },
    }, null, 2),
    "",
    "Rules for painPoints, desires, objections, fears (structured insight objects):",
    "- frequency: 1-100 score for how often this shows up across the CONVERSATIONS data. Be honest: a one-off mention is 10-20, a dominant recurring complaint is 80-100",
    "- verbatimExample: an EXACT quote copied from the CONVERSATIONS data (strip the [PLATFORM] prefix). Never invent quotes",
    "- platform: the platform tag the verbatim example came from, lowercase (reddit, youtube_comments, yelp_reviews, twitter, forums, news, amazon_reviews, google, bing, duckduckgo, quora)",
    "- theme: a 2-4 word cluster name. Reuse the same theme name across insights that belong together so they can be grouped (e.g. all cost complaints share one theme)",
    "- Sort each list by frequency, highest first",
    "",
    "Counts: painPoints 8-12, desires 8-12, objections 6-10, fears 6-10, buyingTriggers 6-10, emotionalLanguage 10-15, trendingPhrases 8-12, verbatimQuotes 10-15, topThemes 5-8, sentimentBreakdown sums to 100.",
  ].join("\n");

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: conversationPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLLMJson(content);

  return stripEmDashesDeep({
    painPoints: coerceInsights(parsed.painPoints),
    desires: coerceInsights(parsed.desires),
    objections: coerceInsights(parsed.objections),
    fears: coerceInsights(parsed.fears),
    buyingTriggers: parsed.buyingTriggers ?? [],
    emotionalLanguage: parsed.emotionalLanguage ?? [],
    trendingPhrases: parsed.trendingPhrases ?? [],
    verbatimQuotes: parsed.verbatimQuotes ?? [],
    topThemes: parsed.topThemes ?? [],
    sentimentBreakdown: parsed.sentimentBreakdown ?? { positive: 33, negative: 34, neutral: 33 },
  });
}

// ─── Shared comment keywords ─────────────────────────────────────────────────
// The user wants ONE consistent set of 3 comment keywords across Skool posts,
// video scripts, and YouTube ideas — not a different keyword per asset.
const KEYWORD_STOPWORDS = new Set(["THE", "AND", "FOR", "HOW", "BEST", "TOP", "WITH", "YOUR", "GET"]);

export function deriveCommentKeywords(keyword: string): [string, string, string] {
  // Multi-keyword searches store "kw1, kw2, kw3" — derive from the first one.
  const primary = keyword.split(",")[0] ?? keyword;
  const words = primary
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && w.length <= 12 && !KEYWORD_STOPWORDS.has(w));
  const topic = words.length ? words[words.length - 1] : "";
  const pool = ["GUIDE", "PLAN", "RESULTS", "PLAYBOOK"];
  const out: string[] = topic ? [topic] : [];
  for (const p of pool) {
    if (out.length >= 3) break;
    if (!out.includes(p)) out.push(p);
  }
  return [out[0], out[1], out[2]];
}

// ─── Shared brand voice helper ───────────────────────────────────────────────
// Truncates brand voice to 2000 chars. The LLM only needs enough to understand
// the audience segment — pasting a full transcript overwhelms the context window
// and causes the model to echo the transcript back instead of analysing the data.
function buildBrandVoiceSystemSuffix(brandVoice?: string): string {
  if (!brandVoice?.trim()) return "";
  const snippet = brandVoice.slice(0, 2000);
  return `\n\n--- AUDIENCE CONTEXT (read once to understand the niche only — do NOT use as source data) ---\n${snippet}\n--- END AUDIENCE CONTEXT ---`;
}

// ─── Deep Market Intelligence (merged with Audience Psychology) ──────────────

/**
 * Executive market intelligence + audience psychology: trends, competitor
 * patterns, opportunities, beliefs, and keyword intelligence, all sourced
 * from the analysis voice data.
 */
export async function generateDeepMarketIntelligence(
  keyword: string,
  analysis: AnalysisInput,
  brandVoice?: string
): Promise<DeepMarketIntelligence> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a senior market intelligence analyst and consumer psychologist.
Generate executive-level market intelligence combined with deep audience psychology analysis.
CRITICAL RULE: Use ONLY the voice data in the user message as the source of all insights. Every trend, pattern, competitor observation, and opportunity must come from the voice data only. Never echo or paraphrase the audience context.
Always respond with valid JSON only.${buildBrandVoiceSystemSuffix(brandVoice)}`,
      },
      {
        role: "user",
        content: `Generate a comprehensive market intelligence + audience psychology report for "${keyword}".

Voice data:
Pain Points: ${insightTexts(analysis.painPoints).join(" | ")}
Desires: ${insightTexts(analysis.desires).join(" | ")}
Fears: ${insightTexts(analysis.fears).join(" | ")}
Buying Triggers: ${analysis.buyingTriggers.join(" | ")}
Emotional Language: ${analysis.emotionalLanguage.join(" | ")}
Trending Phrases: ${analysis.trendingPhrases.join(" | ")}
Top Themes: ${analysis.topThemes.map((t) => `${t.name} (${t.sentiment})`).join(", ")}

Return JSON:
{
  "executiveSummary": "3-4 sentence executive summary using their exact language",
  "trendingTopics": [
    {"topic": "topic name", "velocity": "rising", "engagementScore": 87, "description": "brief description using their language"},
    ...
  ], // 5-7 topics, velocity: rising/stable/declining, engagementScore: 1-100
  "competitorPatterns": ["pattern 1", ...], // 5-7 patterns observed in competitor content/messaging
  "emergingOpportunities": ["opportunity 1", ...], // 5-7 emerging gaps and opportunities
  "marketShifts": ["shift 1", ...], // 4-6 notable market shifts
  "topDesires": ["desire 1", ...], // 6-8 deepest desires in their exact words
  "topFears": ["fear 1", ...], // 6-8 core fears in their exact words
  "dominantBeliefs": ["belief 1", ...], // 6-8 dominant beliefs/worldviews this market holds
  "emotionalTriggers": ["trigger 1", ...], // 6-8 emotional triggers that move this audience
  "languagePatterns": ["pattern 1", ...], // 6-8 recurring language patterns and phrases they use
  "verbatimPhrases": ["phrase 1", ...], // 10-15 exact phrases from the voice data to use in copy
  "keywordIntelligence": {
    "longTailKeywords": ["keyword 1", ...], // 10-15 long-tail keywords
    "emotionalKeywords": ["keyword 1", ...], // 8-12 emotionally charged keywords
    "highConvertingPhrases": ["phrase 1", ...], // 8-12 high-converting phrases
    "relatedSearches": ["search 1", ...], // 8-12 related searches
    "trendingTerms": ["term 1", ...] // 8-12 trending terms
  }
}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  return stripEmDashesDeep(parseLLMJson(content) as unknown as DeepMarketIntelligence);
}

// ─── Viral Hooks (trained on A-Z + Hormozi frameworks) ───────────────────────

/**
 * 26 categorised viral hooks (short-form video, carousel, email subject,
 * ad headline), each tagged with a hook type and a one-line explanation of
 * why it works.
 */
export async function generateViralHooks(
  keyword: string,
  analysis: AnalysisInput,
  brandVoice?: string
): Promise<ViralHook[]> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a world-class copywriter trained on proven viral hook frameworks.
You create scroll-stopping hooks using real human language extracted from voice-of-customer research.
You MUST model your hooks on the proven templates provided. No generic marketing language.
Always respond with valid JSON only.${buildBrandVoiceSystemSuffix(brandVoice)}`,
      },
      {
        role: "user",
        content: `Create the 20 best hooks for "${keyword}" using this exact human language from voice mining.

Pain Points: ${topInsights(analysis.painPoints, 6)}
Emotional Language: ${analysis.emotionalLanguage.slice(0, 8).join(" | ")}
Trending Phrases: ${analysis.trendingPhrases.slice(0, 6).join(" | ")}
Desires: ${topInsights(analysis.desires, 5)}
Fears: ${topInsights(analysis.fears, 4)}

${HORMOZI_HOOK_BANK}

MORE PROVEN TEMPLATES:
${HOOK_TEMPLATES}

Write EXACTLY 20 hooks. One style, one quality bar:
- Each hook is a bold, standalone statement or command a real person would say out loud. The kind of first line that works as a video opener, a carousel slide 1, or an ad opener interchangeably
- Model them on the $100M patterns above, filled with THIS market's verbatim language from the voice data
- Follow the winning distribution: mostly statements and commands, a couple of questions, one or two lists or stories
- Every hook must pass the QUALITY BAR above. If a hook would not stop this exact market's scroll, replace it before answering

Each hook also gets:
- hookType: exactly one of curiosity, pain, desire, social_proof, pattern_interrupt (used internally, spread them)
- whyThisWorks: ONE short line, plain English

Hard rules:
- THEIR exact words, never industry jargon or polished marketing speak
- Specific beats vague: "$147K" not "six figures", "18 months" not "quickly"
- No hype words. No em dashes. No compound sentences. One idea per hook

Return JSON: {"hooks": [{"category": "short_form_video", "hook": "...", "hookType": "pain", "whyThisWorks": "..."}, ...]}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLLMJson(content);
  if (!Array.isArray(parsed.hooks)) return [];

  const validCategories = new Set(["short_form_video", "carousel", "email_subject", "ad_headline"]);
  const validTypes = new Set(["curiosity", "pain", "desire", "social_proof", "pattern_interrupt"]);

  return stripEmDashesDeep(
    parsed.hooks
      .filter((h: unknown): h is ViralHook => !!h && typeof (h as ViralHook).hook === "string")
      .map((h: ViralHook): ViralHook => ({
        category: validCategories.has(h.category) ? h.category : "ad_headline",
        hook: h.hook,
        hookType: validTypes.has(h.hookType) ? h.hookType : "curiosity",
        whyThisWorks: typeof h.whyThisWorks === "string" ? h.whyThisWorks : "",
      }))
  );
}

// ─── Facebook Ad Copy — Talking Head + Instagram Story formats ───────────────

/**
 * 8 ads across two formats (5 Talking Head, 3 Instagram Story) with a 1-10
 * pain agitation score per ad.
 */
export async function generateAdCopy(
  keyword: string,
  analysis: AnalysisInput,
  brandVoice?: string
): Promise<AdCopyIdea[]> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a direct response copywriter trained on Alex Hormozi's GOATed Ads method and $100M Leads.
You write Facebook and Instagram ads ONLY. You understand the 5 levels of audience awareness and match copy to each level.
You use the customer's exact language. Never polished marketing speak.
You produce two formats: Talking Head (full script for a person speaking to camera) and Instagram Story (vertical full-screen story frames with a link-sticker CTA).
Always respond with valid JSON only.${buildBrandVoiceSystemSuffix(brandVoice)}`,
      },
      {
        role: "user",
        content: `Write 8 ads for "${keyword}" — 5 Talking Head (one per awareness level) + 3 Instagram Story (most_aware, solution_aware, problem_aware).

Voice mining data (use this exact language):
Pain Points: ${topInsights(analysis.painPoints, 5)}
Buying Triggers: ${analysis.buyingTriggers.slice(0, 5).join(" | ")}
Desires: ${topInsights(analysis.desires, 5)}
Fears: ${topInsights(analysis.fears, 4)}
Emotional Language: ${analysis.emotionalLanguage.slice(0, 6).join(" | ")}

${GOATED_ADS_FRAMEWORK}

FACEBOOK AD FRAMEWORKS (follow these exactly):
${FACEBOOK_AD_FRAMEWORKS}

TALKING HEAD FORMAT (5 ads — one per awareness level):
Each Talking Head ad is a full script for someone speaking directly to camera.
Vary the MEAT format across the 5 ads: use at least one testimonial-style, one education-style, and one story-style script. Do not write 5 identical pitch scripts.
Structure:
HOOK (1-2 lines. MUST match the awareness level per the GOATed method above: offer-driven for most_aware, proof for product_aware, promise for solution_aware, pain for problem_aware, curiosity for unaware)
[blank line]
AGITATE (2-3 lines, their exact pain language — make them feel seen)
[blank line]
CREDIBILITY (1-2 lines, specific numbers and results)
[blank line]
SOLUTION (2-3 lines, the mechanism — what you do differently)
[blank line]
SOCIAL PROOF (1-2 lines, specific client result)
[blank line]
CTA (1-2 natural-language lines that spell out what to do, how, when, what they get, and what happens next — e.g. "Click the link below, drop your email, and the full playbook lands in your inbox in the next two minutes")

INSTAGRAM STORY FORMAT (3 ads — most_aware, solution_aware, problem_aware):
Story ads are full-screen vertical frames the viewer taps through. Each frame is ONE short text block on screen.
Write EXACTLY 4 frames per story ad:
FRAME 1 (Hook — 5-10 words. Verbatim pain, fear, or desire from the voice data. Must stop the tap-through)
FRAME 2 (Agitate or contrast — 8-14 words. Their exact language)
FRAME 3 (Promise or proof — 8-14 words. A specific outcome or number)
FRAME 4 (CTA — 4-8 words paired with a link sticker, e.g. "Tap the link for the free training")
Story ads feel native: casual, personal, like a friend talking. NOT polished ad speak.

Awareness levels for Talking Head (one each):
1. most_aware
2. product_aware
3. solution_aware
4. problem_aware
5. unaware

Rules for all ads:
- No em dashes. Use a full stop or start a new line
- Short paragraphs, max 2-3 lines each
- Specificity beats vague: "$147K" not "six figures"
- One CTA only per ad
- Write for cold traffic
- painAgitationScore: 1-10 rating of how hard THIS ad presses on the pain. Score honestly: a desire-led most_aware ad might be a 2, a problem_aware ad built on their worst fear might be a 9. Vary with awareness level

Return JSON:
{"ads": [
  {
    "type": "facebook",
    "format": "talking_head",
    "awarenessLevel": "most_aware",
    "headline": "The ad headline",
    "body": "Full ad body copy with \\n for line breaks",
    "cta": "Single CTA line",
    "painAgitationScore": 4
  },
  {
    "type": "facebook",
    "format": "instagram_story",
    "awarenessLevel": "most_aware",
    "headline": "Frame 1 text (hook)",
    "body": "Frame 2 text\\nFrame 3 text",
    "cta": "Frame 4 CTA text",
    "painAgitationScore": 5
  },
  ...
]}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLLMJson(content);
  const ads: AdCopyIdea[] = Array.isArray(parsed.ads) ? parsed.ads : [];
  return stripEmDashesDeep(
    ads.map((ad) => ({
      ...ad,
      painAgitationScore: Math.max(1, Math.min(10, Math.round(Number(ad.painAgitationScore) || 5))),
    }))
  );
}

// ─── Skool Posts — keyword trigger only, with DM follow-up sequence ──────────

/**
 * 6 keyword-trigger Skool posts (tagged story/list/question/controversy/
 * case_study) each with a 6-step no-reply DM workflow ending in a 7-day
 * re-open.
 */
export async function generateSkoolPosts(
  keyword: string,
  analysis: AnalysisInput,
  brandVoice?: string
): Promise<SkoolPostWithDMWorkflow[]> {
  const commentKeywords = deriveCommentKeywords(keyword);
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a Skool community post writer. Your job is to write posts for a free online community that drive one of two outcomes: keyword comments that trigger a DM sequence, or direct clicks on a link.

You write as the community host: someone who has achieved the result personally, not someone who teaches theory.

The audience is sceptical of generic coaching content. They stop scrolling for specific numbers, insider knowledge, and posts that feel like real information. They ignore anything that reads like an ad or a template.

FORMATTING RULES (Skool renders PLAIN TEXT — markdown does not work):
- NEVER use asterisks, underscores, hashes, or any markdown syntax anywhere. No **bold**, no *italics*, no # headers. Asterisks show up literally and look broken.
- Headline: Every post starts with a plain-text headline line. 1-2 emojis at the very start. Title case. Must be a specific result, bold claim, or counterintuitive fact. Never a question. Never generic.
- Body: Short paragraphs. No walls of text. Sentences under 18 words. Blank line between paragraphs.
- Lists: Maximum one list per post. Each item gets a single emoji bullet. No dashes or asterisks as bullets.
- Emojis: 1-2 in the headline only. In the body, emojis only as list bullets or very sparingly.
- GIF suggestion: Every post ends with its own line: GIF: [2-4 word search term]

BANNED WORDS: journey, struggle, frustrating, game-changer, transform, empower, "sound familiar?", "you're not alone", "many people", "so many of you", "I see this all the time", "in today's world"

TWO POST TYPES (write exactly 3 of each):
1. keyword_trigger (3 posts): End with "Comment [KEYWORD] below and I'll send you [specific named resource]." These posts get a DM workflow.
2. link_cta (3 posts): End with ONE plain link line, e.g. "Grab the free training here: [link]" or "Book your free call here: [link]". The link IS the entire CTA. NO comment keyword, NO "drop a comment", NO DM workflow. Never mix a keyword ask into a link post.

WRITING RULES:
- Lead every post with a specific number, result, or counterintuitive fact. Never a question, never a problem statement.
- Debunk objections like an insider, not a coach.
- Never open with empathy or pain-framing.
- At least one specific number, named strategy, or real-world datapoint per post.
- The post must read like it was written by someone who has done it.
- No em dashes anywhere. Use a full stop or start a new line.

DM WORKFLOW RULES (keyword_trigger posts only — EXACTLY 5 DMs):
Every DM sequence exists to do ONE of two things: get them to book a call, or get them to click a lead-magnet link. Pick one goal per post and every DM drives toward it.
- DM 1 fires within 5 minutes of keyword comment: deliver the promised resource link + one light qualifying question
- DM 2 fires 4 hours later IF no reply: ask if they got a chance to look, restate the one-line benefit
- DM 3 fires 1 day later IF no reply: share one quick win or datapoint, then the call/link ask again
- DM 4 fires 2 days later IF no reply: short and casual, direct ask with the booking or resource link
- DM 5 fires 7 days later IF no reply: final casual re-open, reference something new, zero pressure, link one last time
- NO "if they reply" branch. Every DM is a no-reply follow-up only.
- Use #NAME# as the personalisation token.
- Write like a real person texting, not a corporate script. 1-3 short sentences per DM.
- No em dashes, no asterisks, no markdown in DMs.

Always respond with valid JSON only.${buildBrandVoiceSystemSuffix(brandVoice)}`,
      },
      {
        role: "user",
        content: `Create 6 Skool posts for the keyword "${keyword}": exactly 3 keyword_trigger posts followed by 3 link_cta posts.

Voice mining data (use this exact language from real customers):
Pain Points: ${topInsights(analysis.painPoints, 6)}
Desires: ${topInsights(analysis.desires, 6)}
Buying Triggers: ${analysis.buyingTriggers.slice(0, 5).join(" | ")}
Emotional Language: ${analysis.emotionalLanguage.slice(0, 8).join(" | ")}
Verbatim Quotes: ${analysis.verbatimQuotes.slice(0, 4).map((q) => q.text).join(" | ")}

COMMENT KEYWORDS — use ONLY these three, one per keyword_trigger post, in this order: ${commentKeywords.join(", ")}. Never write [KEYWORD], [undefined], or invent a different keyword.

For each post:
1. Pick a different angle (insight, result, myth-bust, process, datapoint, story)
2. Tag each post with its postFormat: exactly one of story, list, question, controversy, case_study. Cover at least 4 different formats across the 6 posts. ("question" here means the post is built around a direct question TO the community in the body, even though the headline itself is never a question)
3. keyword_trigger posts get a 5-DM workflow. link_cta posts get "commentKeyword": null and "dmWorkflow": []

Return JSON:
{"posts": [
  {
    "postType": "keyword_trigger",
    "postFormat": "story",
    "postCopy": "Full plain-text post copy with \\n for line breaks. Ends with the comment CTA then the GIF line.",
    "commentKeyword": "${commentKeywords[0]}",
    "dmWorkflow": [
      {"dmNumber": 1, "timing": "Immediate, off comment", "copy": "Hey #NAME#, here's the [resource]: [link]. Quick question: [qualify]"},
      {"dmNumber": 2, "timing": "4 hours later, no reply", "copy": "Follow-up copy"},
      {"dmNumber": 3, "timing": "1 day later, no reply", "copy": "Follow-up copy"},
      {"dmNumber": 4, "timing": "2 days later, no reply", "copy": "Follow-up copy"},
      {"dmNumber": 5, "timing": "7 days later, no reply", "copy": "Final casual re-open copy"}
    ]
  },
  {
    "postType": "link_cta",
    "postFormat": "case_study",
    "postCopy": "Full plain-text post copy ending with one link line then the GIF line.",
    "commentKeyword": null,
    "dmWorkflow": []
  }
]}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLLMJson(content);
  const rawPosts: SkoolPostWithDMWorkflow[] = Array.isArray(parsed.posts) ? parsed.posts : [];

  // Enforce the contract regardless of what the model returns: no markdown
  // asterisks (Skool renders plain text), keyword posts always carry one of the
  // three fixed keywords (fixes the "[undefined]" bug), link posts carry none,
  // and DM workflows are capped at 5 messages.
  const stripAsterisks = (s: string) => s.replace(/\*+/g, "");
  let keywordIndex = 0;
  const posts = rawPosts.map((post) => {
    const isKeywordPost = post.postType !== "link_cta";
    const assignedKeyword = isKeywordPost
      ? (typeof post.commentKeyword === "string" && /^[A-Z]{2,15}$/.test(post.commentKeyword)
          ? post.commentKeyword
          : commentKeywords[keywordIndex % 3])
      : undefined;
    if (isKeywordPost) keywordIndex++;
    return {
      postType: isKeywordPost ? ("keyword_trigger" as const) : ("link_cta" as const),
      postFormat: post.postFormat,
      postCopy: stripAsterisks(post.postCopy ?? ""),
      commentKeyword: assignedKeyword,
      dmWorkflow: isKeywordPost
        ? (post.dmWorkflow ?? []).slice(0, 5).map((dm, i) => ({ ...dm, dmNumber: i + 1, copy: stripAsterisks(dm.copy ?? "") }))
        : [],
    };
  });
  return stripEmDashesDeep(posts);
}

// ─── YouTube Ideas + Talking Head Scripts ────────────────────────────────────

/**
 * 5 fully-packaged YouTube ideas: title, description, first-30-seconds hook
 * script, thumbnail concept, 10 SEO tags, and a search volume tier.
 */
export async function generateYouTubeIdeas(
  keyword: string,
  analysis: AnalysisInput,
  brandVoice?: string
): Promise<YouTubeIdea[]> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a YouTube content strategist who creates viral video ideas for educational/business channels.
You use voice-of-customer data to identify exactly what the audience wants to watch.
You understand YouTube packaging: title, thumbnail, and first 30 seconds decide everything.
Always respond with valid JSON only.${buildBrandVoiceSystemSuffix(brandVoice)}`,
      },
      {
        role: "user",
        content: `Create 5 fully-packaged YouTube video ideas for "${keyword}".

Voice mining data (use this to identify what they want to learn):
Pain Points: ${topInsights(analysis.painPoints, 5)}
Desires: ${topInsights(analysis.desires, 5)}
Trending Phrases: ${analysis.trendingPhrases.slice(0, 5).join(" | ")}
Top Themes: ${analysis.topThemes.slice(0, 5).map((t) => t.name).join(" | ")}

Each idea needs:
- title: specific, curiosity-driven, searchable. Use their exact language
- description: 1-2 lines on what the video covers and why it matters to this audience
- hook: the spoken script for the FIRST 30 SECONDS of the video (roughly 65-75 words). Must open a loop, tease the payoff, and give them a reason to stay. Written to be read aloud
- thumbnailConcept: one line describing the thumbnail (facial expression, text overlay of 3-5 words max, visual element). Think MrBeast-level clarity
- tags: exactly 10 SEO tags, lowercase, mixing broad and long-tail terms people actually search
- searchVolumeTier: your honest estimate of search demand for this topic. Exactly one of high, medium, low. Base it on how often the topic appears in the voice data and how mainstream the search phrasing is

Rules:
- No em dashes. Use a colon or full stop instead
- Think: what question are they Googling that leads to this video?

Return JSON:
{"ideas": [
  {"title": "...", "description": "...", "hook": "...", "thumbnailConcept": "...", "tags": ["tag1"], "searchVolumeTier": "high"},
  ...
]}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLLMJson(content);
  const ideas: YouTubeIdea[] = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  return stripEmDashesDeep(
    ideas.map((idea) => ({
      ...idea,
      tags: Array.isArray(idea.tags) ? idea.tags.slice(0, 10) : [],
      searchVolumeTier: ["high", "medium", "low"].includes(idea.searchVolumeTier ?? "")
        ? idea.searchVolumeTier
        : "medium",
    }))
  );
}

/**
 * 5 talking head scripts (one per framework) with a pattern interrupt
 * opener, per-section B-roll suggestions, and a computed length estimate
 * at 130 WPM.
 */
export async function generateTalkingHeadScripts(
  keyword: string,
  analysis: AnalysisInput,
  brandVoice?: string
): Promise<TalkingHeadScript[]> {
  const commentKeywords = deriveCommentKeywords(keyword);
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a viral content scriptwriter trained on the Steak Method (Cost Narration) and authority sales conversion frameworks.
You write short-form talking head scripts that stop the scroll, build curiosity, and convert viewers into leads.
Always respond with valid JSON only.${buildBrandVoiceSystemSuffix(brandVoice)}`,
      },
      {
        role: "user",
        content: `Write 5 talking head video scripts for "${keyword}".

Voice mining data (use this exact language):
Pain Points: ${topInsights(analysis.painPoints, 5)}
Emotional Language: ${analysis.emotionalLanguage.slice(0, 6).join(" | ")}
Trending Phrases: ${analysis.trendingPhrases.slice(0, 5).join(" | ")}
Desires: ${topInsights(analysis.desires, 4)}

SCRIPT FRAMEWORKS (follow these exactly):
${CONTENT_SCRIPT_FRAMEWORKS}

Create 5 scripts — one per framework, in this exact order:
1. The Steak Method (Hook > Mind Read > Twist/Tease > CTA before payoff > Payoff)
2. Authority Sales Conversion (Bold claim > Mind read > Agitate > Mechanism > Solution > CTA)
3. Stories That Sell (Scene > Problem > Failed attempts > Discovery > Result > Bridge > CTA)
4. Contrarian Take (Counterintuitive hook > Why common belief is wrong > Real truth > Proof > CTA)
5. The Curiosity Loop (Tease the answer > Build tension > Withhold > CTA > Reveal)

CRITICAL: Every single field — hook, mindRead, twistTease, ctaBeforePayoff, payoff, closingCta — MUST contain real written content. Empty strings, null, "N/A", or placeholder text will break the output. If a framework does not naturally use a field, adapt the content to fit that field anyway. For example, Authority Sales Conversion does not have a twistTease — write the agitate section there instead. Stories That Sell does not have a ctaBeforePayoff — write the bridge there instead. No field can ever be empty.

Rules:
- patternInterrupt: ONE scroll-stopping line delivered BEFORE the hook. A visual instruction plus spoken line is ideal (e.g. "Stop scrolling if you've ever been denied twice."). Must feel different from every other video in the feed
- Hook must use borrowed relevance (name-drop authority/brand) OR a specific number
- Never reveal the payoff in the hook. Tease it
- "But here's the crazy part..." is a universal transition. Use it
- Short punchy sentences. 8-12 words max
- EVERY section (patternInterrupt, hook, mindRead, twistTease, ctaBeforePayoff, payoff, closingCta) MUST be fully written out. No empty strings. No placeholders
- For frameworks that do not naturally map to all fields: adapt the nearest equivalent content into each field. Never leave any field empty or short
- A 60-second talking head script = approximately 150 words spoken. Each script must be at least 150 words total across all sections
- twistTease must build real curiosity and tension. At least 3 sentences
- payoff must deliver a real insight or mechanism. At least 3 sentences
- End every script with a comment keyword CTA
- COMMENT KEYWORDS: use ONLY these three, spread across the 5 scripts: ${commentKeywords.join(", ")}. Never invent a different keyword, never write [KEYWORD] or [undefined]
- bRollSuggestions: for EACH section (Pattern Interrupt, Hook, Mind Read, Twist/Tease, CTA, Payoff, Closing CTA) describe in one line what visuals/B-roll to show while it is spoken (screen recording, text overlay, cutaway, prop, location change). Concrete and filmable, not "relevant footage"
- No em dashes. Use a full stop or start a new line

Return JSON:
{"scripts": [
  {
    "title": "Script title/framework name",
    "patternInterrupt": "Scroll-stopping opener delivered before the hook",
    "hook": "Opening hook line (borrowed relevance or specific number)",
    "mindRead": "Acknowledge what they're thinking, then subvert it",
    "twistTease": "Build curiosity without revealing the answer",
    "ctaBeforePayoff": "Comment keyword CTA before the reveal",
    "payoff": "The actual insight delivered last",
    "closingCta": "Final call to action",
    "commentKeyword": "KEYWORD",
    "bRollSuggestions": [
      {"section": "Pattern Interrupt", "visual": "What to show on screen"},
      {"section": "Hook", "visual": "..."},
      {"section": "Mind Read", "visual": "..."},
      {"section": "Twist/Tease", "visual": "..."},
      {"section": "CTA", "visual": "..."},
      {"section": "Payoff", "visual": "..."},
      {"section": "Closing CTA", "visual": "..."}
    ]
  },
  ...
]}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLLMJson(content);
  const scripts: TalkingHeadScript[] = Array.isArray(parsed.scripts) ? parsed.scripts : [];
  return stripEmDashesDeep(
    scripts.map((script, i) => ({
      ...script,
      commentKeyword:
        typeof script.commentKeyword === "string" && commentKeywords.includes(script.commentKeyword)
          ? script.commentKeyword
          : commentKeywords[i % 3],
      bRollSuggestions: Array.isArray(script.bRollSuggestions) ? script.bRollSuggestions : [],
      estimatedLengthSeconds: estimateScriptSeconds(script),
    }))
  );
}

// ─── Email Sequence (exact framework from user's prompt, ConvertKit tokens) ──

/**
 * 8-email nurture sequence (Day 1-7 + Day 14 re-engagement) with split test
 * subject variants and a 1-10 open rate prediction per email.
 */
export async function generateEmailSequence(
  keyword: string,
  analysis: AnalysisInput,
  brandVoice?: string
): Promise<EmailSequence> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a direct response email copywriter following this exact framework:

VOICE AND TONE:
- Lowercase throughout. No capitalisation except for bolded key phrases, proper nouns, and dollar amounts
- Casual, direct, conversational. Like a text from a smart friend who knows the system inside out
- No corporate language. No fluff. No filler sentences
- Short punchy paragraphs. Never more than 3-4 lines before a line break
- No em dashes anywhere. Use a full stop or a new line instead
- Contractions everywhere: "i've", "you're", "we've", "don't", "won't"
- First person throughout
- Sign off every email in this EXACT format (two lines):
  Line 1: Talk soon,
  Line 2: [Client Name] "[Nickname]" [Last Name]
  Then a blank line, then: P.S. [one sentence urgency or social proof teaser]
- "P.S." is always in caps. "Talk soon," starts with capital T.
- The signOff field is separate from the body. NEVER put the sign-off text inside the body field.
- Use {{ subscriber.first_name }} as the ConvertKit personalisation token for the reader's name

FORMATTING RULES FOR EMAIL BODY:
- Use <strong>text</strong> for bold phrases (NOT **text**)
- Use <em>text</em> for italic text (NOT _text_)
- Use <u>text</u> for underlined text
- The last 3 lines of the body (before sign-off) must be wrapped in <em></em> for italics
- CTAs use a 👉 emoji before the link text

EMAIL STRUCTURE:
1. Subject line: lowercase, curiosity-driven or story-driven, never salesy
2. Preview text: adds intrigue without giving away the story
3. Opening: lead with a real person, real situation, or real quote. No preamble
4. Build tension: expand on the pain. Make them feel described, not just the story character
5. First CTA: drop naturally after tension, before resolution
6. The insight/reframe: the most important part. Something they've never heard but instantly know is true
7. Resolution/social proof: specific result with real numbers
8. Second CTA: same format as first
9. Sign off: talk soon, [Name]
10. P.S. line: add final social proof, urgency, or remind them what they're leaving on the table

FORMATTING RULES:
- Bold key phrases only, never full sentences
- No bullet points inside body unless listing bonuses
- No em dashes anywhere
- No exclamation marks unless quoting someone directly
- Blank line every 3-4 lines maximum
- Teach the WHAT and the WHY. Never the HOW

Always respond with valid JSON only.${buildBrandVoiceSystemSuffix(brandVoice)}`,
      },
      {
        role: "user",
        content: `Write an 8-email welcome/nurture sequence for "${keyword}".

Voice mining data (use this exact language in the emails):
Pain Points: ${topInsights(analysis.painPoints, 5)}
Desires: ${topInsights(analysis.desires, 5)}
Fears: ${topInsights(analysis.fears, 4)}
Objections: ${topInsights(analysis.objections, 4)}
Buying Triggers: ${analysis.buyingTriggers.slice(0, 4).join(" | ")}
Emotional Language: ${analysis.emotionalLanguage.slice(0, 6).join(" | ")}

EMAIL FRAMEWORKS (follow these exactly):
${EMAIL_SEQUENCE_FRAMEWORKS}

Write 8 emails following this sequence structure:
- Email 1 (Day 1): Big result story. Lead with a specific win to hook attention immediately
- Email 2 (Day 2): Objection handling. Address the "i don't know enough to start" belief
- Email 3 (Day 3): Third party story. Someone who almost didn't take action but did and won
- Email 4 (Day 4): Mechanism email. Explain the system through a specific example without giving away the how
- Email 5 (Day 5): Emotional story. The most vulnerable or relatable transformation
- Email 6 (Day 6): Direct question email. Call out what's really stopping them. Pattern interrupt
- Email 7 (Day 7): Last call. Short. Direct. No new information. Just the decision
- Email 8 (Day 14): Re-engagement for cold subscribers who never clicked. Subject line follows the pattern "still interested in [topic]?" (lowercase, fill in the actual topic). Short, casual, zero pressure. One question, one link. Set emailType to "re_engagement" on this one

Rules:
- Use {{ subscriber.first_name }} for the reader's name (ConvertKit token)
- Subject line is the hook. Treat it like an ad headline
- Preview text is the second hook. Pull them in before they open
- First line must earn the second. No fluff openers
- Short paragraphs. 1-3 lines max
- Specific numbers always beat vague claims
- P.S. lines for urgency or teasers
- One CTA per email. Never two
- CTA must use natural language: "click the link below to register for our free training", "book your free strategy call here", "reply to this email and i'll send you the playbook"
- Write like texting a smart friend, not sending a newsletter
- Sign off in this EXACT format (stored in the signOff field, NOT in body):
  "Talk soon,\n[Client Name] \"[Nickname]\" [Last Name]"
  Then separately, the P.S. line goes at the END of the body field (before the signOff)
- "P.S." is always in caps
- The signOff field is rendered separately by the UI. Do NOT include the sign-off text inside the body field
- Use <strong>text</strong> for bold, <em>text</em> for italic, <u>text</u> for underline in the body
- The last 3 lines of the body must be wrapped in <em></em> for italics
- CTAs use a 👉 emoji
- No em dashes anywhere
- splitTestSubject: a second subject line for A/B testing. Must take a DIFFERENT psychological angle from the main subject (if the main is curiosity, the variant is a direct benefit or a question). Same lowercase style
- openRatePrediction: score the MAIN subject line 1-10 for likely open rate. Judge honestly on curiosity gap, specificity, length under 45 chars, and whether it reads like a friend not a brand. Most decent subject lines are 5-7; reserve 9-10 for genuinely exceptional ones

Return JSON:
{
  "sequenceName": "8-Day ${keyword} Welcome Sequence",
  "emails": [
    {
      "dayNumber": 1,
      "subject": "email subject line (lowercase)",
      "splitTestSubject": "alternative subject line for split testing (lowercase)",
      "openRatePrediction": 7,
      "previewText": "preview text that adds intrigue",
      "body": "Full email body with \\n for line breaks",
      "signOff": "Talk soon,\n[Client Name] \"[Nickname]\" [Last Name]",
      "emailType": "nurture"
    },
    ...
  ]
}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLLMJson(content) as unknown as EmailSequence;
  if (Array.isArray(parsed.emails)) {
    parsed.emails = parsed.emails.map((email) => ({
      ...email,
      openRatePrediction: Math.max(1, Math.min(10, Math.round(Number(email.openRatePrediction) || 5))),
    }));
  }
  return stripEmDashesDeep(parsed);
}

// ─── Competitor Intelligence ─────────────────────────────────────────────────

/**
 * Run a dedicated competitor scrape for the keyword, then extract competitor
 * names, messaging angles, weaknesses (from review complaints), pricing
 * signals, and ownable market gaps. Returns null when nothing could be
 * scraped — the tab shows a retry state instead of invented competitors.
 */
export async function generateCompetitorIntel(
  keyword: string,
  brandVoice?: string,
  competitorUrls?: string[],
  competitorNotes?: string
): Promise<CompetitorIntel | null> {
  const [searchScraped, directScraped] = await Promise.all([
    scrapeCompetitorsForKeyword(keyword),
    competitorUrls?.length ? scrapeCompetitorUrls(competitorUrls) : Promise.resolve(""),
  ]);
  const hasSearchData = searchScraped !== "NO_SCRAPED_DATA";
  const notes = competitorNotes?.trim().slice(0, 8000) ?? "";
  if (!hasSearchData && !directScraped && !notes) return null;

  const scraped = [
    notes
      ? `── THE USER'S OWN COMPETITOR NOTES (first-hand knowledge — treat as the highest-signal data) ──\n${notes}`
      : "",
    directScraped
      ? `── DIRECT COMPETITOR PAGES (pasted by the user — analyse these FIRST and in the most depth) ──\n${directScraped}`
      : "",
    hasSearchData ? `── SEARCH & REVIEW DATA ──\n${searchScraped}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a competitive intelligence analyst for direct response marketers.
You analyse real search results about competitors in a market and extract who the players are, how they position themselves, where they are weak, and what gaps a new entrant can own.
CRITICAL RULE: Every competitor, angle, weakness, and pricing signal MUST come from the COMPETITOR DATA in the user message. Never invent companies or facts. If the data does not name real competitors, describe competitor TYPES instead (e.g. "traditional brokers", "DIY course sellers").
Always respond with valid JSON only.${buildBrandVoiceSystemSuffix(brandVoice)}`,
      },
      {
        role: "user",
        content: `Extract competitor intelligence for the "${keyword}" market from this scraped data.

COMPETITOR DATA:
${scraped}

Return JSON:
{
  "competitors": [
    {
      "name": "Competitor or competitor-type name",
      "angle": "Their core messaging angle in one line",
      "weakness": "Their biggest weakness, pulled from complaints/reviews in the data",
      "gap": "The specific gap this weakness opens that you can own",
      "pricingSignals": "What the data says about their pricing (or 'No pricing signals found')"
    }
  ],
  "marketGaps": ["gap 1", "gap 2", ...]
}

Rules:
- 4-8 competitors, ranked by how prominent they are in the data
- If the USER'S OWN COMPETITOR NOTES name specific competitors, every one of them MUST appear as its own entry, listed first with the deepest analysis. Combine the user's first-hand observations with the scraped page data for these
- If DIRECT COMPETITOR PAGES are present, each one MUST appear as its own competitor entry with deep analysis: quote their actual headline/bio language in "angle", and infer weakness from what their page does NOT address that the market complains about
- marketGaps: 3-6 gaps NOBODY in the data is filling, each one line, each ownable by a coach/course creator
- Weaknesses must be grounded in actual complaint language from the data
- No em dashes. Use a full stop instead
- Plain confident language a non-technical marketer understands`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLLMJson(content);
  if (!Array.isArray(parsed.competitors) || parsed.competitors.length === 0) return null;

  return stripEmDashesDeep({
    competitors: parsed.competitors,
    marketGaps: Array.isArray(parsed.marketGaps) ? parsed.marketGaps : [],
    generatedAt: new Date().toISOString(),
  });
}

/**
 * One-click positioning statement built from the gaps found in competitor
 * intel. Returns a short, punchy statement the user can drop into their copy.
 */
export async function generatePositioningStatement(
  keyword: string,
  intel: CompetitorIntel,
  brandVoice?: string
): Promise<string> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a positioning strategist trained on April Dunford's Obviously Awesome and Alex Hormozi's offer frameworks.
You write ONE positioning statement that plants a flag in the exact gap competitors leave open.
Always respond with valid JSON only.${buildBrandVoiceSystemSuffix(brandVoice)}`,
      },
      {
        role: "user",
        content: `Write a unique positioning statement for a "${keyword}" offer based on these competitor gaps.

Competitor weaknesses:
${intel.competitors.map((c) => `- ${c.name}: ${c.weakness} -> gap: ${c.gap}`).join("\n")}

Market gaps nobody owns:
${intel.marketGaps.map((g) => `- ${g}`).join("\n")}

Rules:
- 2-3 sentences maximum
- Structure: who it's for + the mechanism/approach that exploits the biggest gap + why the alternatives fail them
- Specific and confident. No hedging, no "we believe"
- Use plain language the market itself uses
- No em dashes. Use a full stop instead

Return JSON: {"positioningStatement": "..."}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = extractContent(response.choices[0]?.message?.content ?? "{}");
  const parsed = parseLLMJson(content);
  return stripEmDashes(typeof parsed.positioningStatement === "string" ? parsed.positioningStatement : "");
}
