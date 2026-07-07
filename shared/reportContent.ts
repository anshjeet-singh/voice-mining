/**
 * Shared content types for analysis results and report sections, plus
 * normalize helpers that let the UI and generators read both legacy and
 * upgraded JSON shapes. Safe to import from both client and server.
 */

// ─── Voice-of-customer insights ──────────────────────────────────────────────

/**
 * A structured voice-of-customer insight. New analyses store these; analyses
 * created before the upgrade store plain strings — hence InsightList below.
 */
export interface InsightItem {
  text: string;
  /** How often this shows up in the scraped data, 1-100 */
  frequency: number;
  /** A verbatim quote from the scraped data illustrating this insight */
  verbatimExample: string;
  /** Platform the verbatim example came from (reddit, youtube_comments, ...) */
  platform: string;
  /** Theme/cluster this insight belongs to, for grouping in the UI */
  theme: string;
}

export type InsightList = InsightItem[] | string[];

/** Normalize a legacy string[] or new InsightItem[] into InsightItem[]. */
export function normalizeInsights(list: InsightList | null | undefined): InsightItem[] {
  if (!list) return [];
  return (list as Array<string | InsightItem>).map((item) =>
    typeof item === "string"
      ? { text: item, frequency: 0, verbatimExample: "", platform: "", theme: "" }
      : item
  );
}

/** Plain text of each insight (works for both shapes). */
export function insightTexts(list: InsightList | null | undefined): string[] {
  return normalizeInsights(list).map((i) => i.text);
}

export interface VerbatimQuote {
  text: string;
  category: "pain_point" | "desire" | "objection" | "fear" | "buying_trigger" | "success";
  platform?: string;
}

export interface Theme {
  name: string;
  description: string;
  frequency: number; // 1-100
  sentiment: "positive" | "negative" | "neutral" | "mixed";
}

export interface SentimentBreakdown {
  positive: number;
  negative: number;
  neutral: number;
}

// ─── Market intelligence ─────────────────────────────────────────────────────

export interface TrendingTopic {
  topic: string;
  velocity: "rising" | "stable" | "declining";
  engagementScore: number;
  description: string;
}

export interface KeywordIntelligence {
  longTailKeywords: string[];
  emotionalKeywords: string[];
  highConvertingPhrases: string[];
  relatedSearches: string[];
  trendingTerms: string[];
}

export interface DeepMarketIntelligence {
  executiveSummary: string;
  trendingTopics: TrendingTopic[];
  competitorPatterns: string[];
  emergingOpportunities: string[];
  marketShifts: string[];
  // Audience psychology merged in
  topDesires: string[];
  topFears: string[];
  dominantBeliefs: string[];
  emotionalTriggers: string[];
  languagePatterns: string[];
  verbatimPhrases: string[];
  keywordIntelligence: KeywordIntelligence;
}

// ─── Viral hooks ─────────────────────────────────────────────────────────────

export type HookCategory = "short_form_video" | "carousel" | "email_subject" | "ad_headline";
export type HookType = "curiosity" | "pain" | "desire" | "social_proof" | "pattern_interrupt";

export interface ViralHook {
  category: HookCategory;
  hook: string;
  hookType: HookType;
  whyThisWorks: string;
}

/** Normalize legacy "[CATEGORY] hook text" strings or new ViralHook objects. */
export function normalizeHooks(list: ViralHook[] | string[] | null | undefined): ViralHook[] {
  if (!list) return [];
  return (list as Array<string | ViralHook>).map((item) => {
    if (typeof item !== "string") return item;
    const match = item.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
    const legacyCategory = (match ? match[1] : "").toLowerCase();
    const hook = match ? match[2] : item;
    const category: HookCategory = legacyCategory.includes("video") ? "short_form_video" : "ad_headline";
    const hookType: HookType = legacyCategory.includes("pain")
      ? "pain"
      : legacyCategory.includes("authority")
        ? "social_proof"
        : legacyCategory.includes("interrupt")
          ? "pattern_interrupt"
          : "curiosity";
    return { category, hook, hookType, whyThisWorks: "" };
  });
}

// ─── Ads ─────────────────────────────────────────────────────────────────────

/** b_roll is legacy only — no longer generated, hidden in the UI. */
export type AdFormat = "talking_head" | "instagram_story" | "b_roll";
export type AwarenessLevel = "most_aware" | "product_aware" | "solution_aware" | "problem_aware" | "unaware";

export interface AdCopyIdea {
  type: "facebook";
  format: AdFormat;
  headline: string;
  body: string;
  cta: string;
  awarenessLevel: AwarenessLevel;
  /** How hard the ad presses on the pain, 1-10. Absent on legacy ads. */
  painAgitationScore?: number;
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

export interface YouTubeIdea {
  title: string;
  description: string;
  /** First-30-seconds hook script (4-beat framework). Absent on legacy ideas. */
  hook?: string;
  /** What the thumbnail should show. Absent on legacy ideas. */
  thumbnailConcept?: string;
  /** 10 SEO tags. Absent on legacy ideas. */
  tags?: string[];
  /** Estimated search volume tier. Absent on legacy ideas. */
  searchVolumeTier?: "high" | "medium" | "low";
  /** The real outlier video this packaging is modeled on. Absent on legacy ideas. */
  basedOn?: string;
  /** One line: why this packaging works. Absent on legacy ideas. */
  whyItWorks?: string;
  /** 5-6 bullets: exactly what the video covers, in order. Absent on legacy ideas. */
  contentBullets?: string[];
  /** Funnel stage this video serves. Absent on legacy ideas. */
  funnelStage?: "TOF" | "MOF" | "BOF";
  /** One-line lead-magnet CTA with the comment keyword. Absent on legacy ideas. */
  ctaIdea?: string;
}

// ─── Video scripts ───────────────────────────────────────────────────────────

export interface ScriptBRollSuggestion {
  section: string;
  visual: string;
}

export interface TalkingHeadScript {
  title: string;
  hook: string;
  mindRead: string;
  twistTease: string;
  ctaBeforePayoff: string;
  payoff: string;
  closingCta: string;
  commentKeyword: string;
  /** Scroll-stopping opener delivered before the hook. Absent on legacy scripts. */
  patternInterrupt?: string;
  /** Estimated spoken length in seconds at 130 WPM. Absent on legacy scripts. */
  estimatedLengthSeconds?: number;
  /** What visuals to show during each section. Absent on legacy scripts. */
  bRollSuggestions?: ScriptBRollSuggestion[];
}

/** Words spoken per minute for script length estimates. */
export const SCRIPT_WPM = 130;

/** Estimate spoken length in seconds from all script sections at 130 WPM. */
export function estimateScriptSeconds(script: Pick<TalkingHeadScript, "patternInterrupt" | "hook" | "mindRead" | "twistTease" | "ctaBeforePayoff" | "payoff" | "closingCta">): number {
  const words = [
    script.patternInterrupt,
    script.hook,
    script.mindRead,
    script.twistTease,
    script.ctaBeforePayoff,
    script.payoff,
    script.closingCta,
  ]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.round((words / SCRIPT_WPM) * 60);
}

// ─── Skool posts ─────────────────────────────────────────────────────────────

export type SkoolPostFormat = "story" | "list" | "question" | "controversy" | "case_study";

export interface SkoolPostWithDMWorkflow {
  /** keyword_trigger posts ask for a comment keyword; link_cta posts just send a link. */
  postType: "keyword_trigger" | "link_cta";
  style?: string;
  /** Post format tag. Absent on legacy posts. */
  postFormat?: SkoolPostFormat;
  postCopy: string;
  /** Only present on keyword_trigger posts. */
  commentKeyword?: string;
  /** Empty on link_cta posts — the link is the whole CTA. */
  dmWorkflow: DMMessage[];
}

export interface DMMessage {
  dmNumber: number;
  timing: string;
  copy: string;
}

// ─── Email sequence ──────────────────────────────────────────────────────────

export interface EmailSequence {
  sequenceName: string;
  emails: EmailMessage[];
}

export interface EmailMessage {
  dayNumber: number;
  subject: string;
  previewText: string;
  body: string;
  signOff?: string;
  /** Alternative subject line for split testing. Absent on legacy emails. */
  splitTestSubject?: string;
  /** Predicted open rate quality of the subject line, 1-10. Absent on legacy emails. */
  openRatePrediction?: number;
  /** Email purpose tag, e.g. "re_engagement" for the cold-subscriber email. */
  emailType?: string;
}

// ─── Competitor intelligence ─────────────────────────────────────────────────

export interface CompetitorEntry {
  name: string;
  angle: string;
  weakness: string;
  gap: string;
  pricingSignals: string;
  /** What they post, what performs, how often. Absent on legacy intel. */
  contentPlaybook?: string;
  /** What they actually sell and how they monetise. Absent on legacy intel. */
  offer?: string;
  /** 2-3 specific tactics of theirs worth copying. Absent on legacy intel. */
  steal?: string[];
  /** The concrete move that beats them. Absent on legacy intel. */
  counter?: string;
}

export interface CompetitorIntel {
  competitors: CompetitorEntry[];
  marketGaps: string[];
  /** 5-7 concrete do-this-now moves built from the gaps. Absent on legacy intel. */
  actionPlan?: string[];
  positioningStatement?: string;
  generatedAt: string; // ISO date
}

export interface AudiencePsychology {
  topDesires: string[];
  topFears: string[];
  dominantBeliefs: string[];
  emotionalTriggers: string[];
  languagePatterns: string[];
}
