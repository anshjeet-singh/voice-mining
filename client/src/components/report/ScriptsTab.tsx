import { useState } from "react";
import { ChevronDown, ChevronUp, Clapperboard, Clock, Video, Youtube } from "lucide-react";
import type { TalkingHeadScript, YouTubeIdea } from "@shared/reportContent";
import { CopyAllBtn, CopyBtn, RegenerateSectionBtn, SaveBtn, TagList } from "./reportShared";

const VOLUME_TIER_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: "High Search Volume", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  medium: { label: "Medium Search Volume", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  low: { label: "Low Search Volume", color: "text-muted-foreground bg-card/60 border-border/40" },
};

const FUNNEL_STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  TOF: { label: "TOF · New Eyeballs", color: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
  MOF: { label: "MOF · Nurture", color: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
  BOF: { label: "BOF · Converts", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
};

function formatLength(seconds?: number): string | null {
  if (!seconds) return null;
  if (seconds < 60) return `~${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `~${m}m ${s}s` : `~${m}m`;
}

function scriptText(script: TalkingHeadScript): string {
  return [
    script.patternInterrupt ? `PATTERN INTERRUPT: ${script.patternInterrupt}` : null,
    `HOOK: ${script.hook}`,
    `MIND READ: ${script.mindRead}`,
    `TWIST/TEASE: ${script.twistTease}`,
    `CTA BEFORE PAYOFF: ${script.ctaBeforePayoff}`,
    `PAYOFF: ${script.payoff}`,
    `CLOSING CTA: ${script.closingCta}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function ScriptsTab({
  scripts,
  youtubeIdeas,
  reportId,
  reportName,
}: {
  scripts: TalkingHeadScript[];
  youtubeIdeas: YouTubeIdea[];
  reportId: number;
  reportName: string;
}) {
  const [expandedScript, setExpandedScript] = useState<number | null>(null);
  const [expandedIdea, setExpandedIdea] = useState<number | null>(null);

  return (
    <div className="space-y-8">
      {/* YouTube Ideas */}
      {youtubeIdeas.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/40" />
            <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider px-3 py-1 rounded-full bg-rose-400/10 border border-rose-400/20 flex items-center gap-1.5">
              <Youtube className="w-3 h-3" />
              YouTube Video Ideas
            </span>
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Packaged like the niche's proven winners: each idea is modeled on a real top-performing video, with the outline in 5-6 bullets and a 30-second hook.
            </p>
            <RegenerateSectionBtn reportId={reportId} section="youtubeIdeas" />
          </div>
          <div className="space-y-3">
            {youtubeIdeas.map((idea, i) => {
              const tier = VOLUME_TIER_CONFIG[idea.searchVolumeTier ?? ""] ?? null;
              const isOpen = expandedIdea === i;
              const stage = FUNNEL_STAGE_CONFIG[idea.funnelStage ?? ""] ?? null;
              const fullText = [
                `TITLE: ${idea.title}`,
                idea.basedOn ? `MODELED ON: ${idea.basedOn}` : null,
                `DESCRIPTION: ${idea.description}`,
                idea.contentBullets?.length ? `WHAT THE VIDEO COVERS:\n${idea.contentBullets.map((b, j) => `${j + 1}. ${b}`).join("\n")}` : null,
                idea.hook ? `FIRST 30 SECONDS:\n${idea.hook}` : null,
                idea.ctaIdea ? `CTA: ${idea.ctaIdea}` : null,
                idea.thumbnailConcept ? `THUMBNAIL: ${idea.thumbnailConcept}` : null,
                idea.tags?.length ? `TAGS: ${idea.tags.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join("\n\n");
              return (
                <div key={i} className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
                  <button
                    onClick={() => setExpandedIdea(isOpen ? null : i)}
                    className="w-full flex items-start gap-3 px-4 py-4 hover:bg-card/50 transition-colors text-left"
                  >
                    <span className="text-xs font-mono text-muted-foreground/40 mt-0.5 w-5 flex-shrink-0">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-semibold text-foreground">{idea.title}</p>
                        {stage && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${stage.color}`}>
                            {stage.label}
                          </span>
                        )}
                        {tier && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${tier.color}`}>
                            {tier.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{idea.description}</p>
                      {idea.basedOn && (
                        <p className="text-xs text-rose-300/70 mt-1">Modeled on: {idea.basedOn}</p>
                      )}
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 space-y-4">
                      <div className="flex justify-end gap-1">
                        <SaveBtn reportId={reportId} searchKeyword={reportName} contentType="youtube_idea" label={idea.title.slice(0, 80)} content={fullText} />
                        <CopyBtn text={fullText} />
                      </div>
                      {idea.whyItWorks && (
                        <p className="text-xs text-muted-foreground italic">Why this packaging works: {idea.whyItWorks}</p>
                      )}
                      {(idea.contentBullets?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">What The Video Covers</p>
                          <ol className="space-y-1.5">
                            {(idea.contentBullets ?? []).map((b, j) => (
                              <li key={j} className="flex gap-2.5 text-sm text-foreground/90 leading-relaxed">
                                <span className="text-xs font-mono text-rose-300/60 mt-0.5 flex-shrink-0">{j + 1}.</span>
                                <span>{b}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                      {idea.hook && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">First 30 Seconds (Hook Script)</p>
                          <div className="p-4 rounded-lg border border-border/30 bg-card/20">
                            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{idea.hook}</p>
                          </div>
                        </div>
                      )}
                      {idea.ctaIdea && (
                        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                          <p className="text-xs text-primary font-semibold uppercase tracking-wider mb-0.5">CTA</p>
                          <p className="text-sm text-foreground/90">{idea.ctaIdea}</p>
                        </div>
                      )}
                      {idea.thumbnailConcept && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Thumbnail Concept</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">{idea.thumbnailConcept}</p>
                        </div>
                      )}
                      {(idea.tags?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">SEO Tags</p>
                          <TagList items={idea.tags ?? []} color="bg-rose-400/10 border-rose-400/20 text-rose-300" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Talking Head Scripts */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border/40" />
          <span className="text-xs font-semibold text-primary uppercase tracking-wider px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            Talking Head Video Scripts
          </span>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            5 scripts using the Steak Method, Authority Sales, Stories That Sell, Contrarian Take, and Curiosity Loop frameworks. Each includes a pattern interrupt opener and per-section B-roll suggestions.
          </p>
          <div className="flex items-center gap-2">
            <CopyAllBtn getText={() => scripts.map((s, i) => `SCRIPT ${i + 1}: ${s.title}\n\n${scriptText(s)}`).join("\n\n=====\n\n")} />
            <RegenerateSectionBtn reportId={reportId} section="talkingHeadScripts" />
          </div>
        </div>

        {scripts.map((script, i) => {
          const isOpen = expandedScript === i;
          const length = formatLength(script.estimatedLengthSeconds);
          const brollBySection = new Map((script.bRollSuggestions ?? []).map((b) => [b.section.toLowerCase(), b.visual]));
          const broll = (names: string[]) => {
            for (const n of names) {
              const hit = brollBySection.get(n.toLowerCase());
              if (hit) return hit;
            }
            return null;
          };
          const sections = [
            { label: "PATTERN INTERRUPT", text: script.patternInterrupt, color: "border-l-fuchsia-400", brollKeys: ["Pattern Interrupt"] },
            { label: "HOOK", text: script.hook, color: "border-l-primary", brollKeys: ["Hook"] },
            { label: "MIND READ", text: script.mindRead, color: "border-l-blue-400", brollKeys: ["Mind Read"] },
            { label: "TWIST / TEASE", text: script.twistTease, color: "border-l-amber-400", brollKeys: ["Twist/Tease", "Twist / Tease", "Twist"] },
            { label: "CTA BEFORE PAYOFF", text: script.ctaBeforePayoff, color: "border-l-purple-400", brollKeys: ["CTA", "CTA Before Payoff"] },
            { label: "PAYOFF", text: script.payoff, color: "border-l-emerald-400", brollKeys: ["Payoff"] },
            { label: "CLOSING CTA", text: script.closingCta, color: "border-l-rose-400", brollKeys: ["Closing CTA"] },
          ].filter((s) => !!s.text);

          return (
            <div key={i} className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
              <button
                onClick={() => setExpandedScript(isOpen ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-card/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Video className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{script.title}</p>
                      {length && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{script.patternInterrupt ?? script.hook}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-mono text-primary/60 hidden sm:block">
                    Comment: {script.commentKeyword}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-5 pb-5">
                  <div className="flex justify-end mb-3 gap-1">
                    <SaveBtn reportId={reportId} searchKeyword={reportName} contentType="script" label={`Script: ${script.title.slice(0, 60)}`} content={scriptText(script)} />
                    <CopyBtn text={scriptText(script)} />
                  </div>
                  <div className="space-y-4">
                    {sections.map(({ label, text, color, brollKeys }) => {
                      const visual = broll(brollKeys);
                      return (
                        <div key={label} className={`pl-4 border-l-2 ${color}`}>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
                          <p className="text-sm text-foreground/90 leading-relaxed">{text}</p>
                          {visual && (
                            <p className="text-xs text-muted-foreground/70 mt-1.5 flex items-start gap-1.5">
                              <Clapperboard className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              <span>B-roll: {visual}</span>
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-primary font-semibold uppercase tracking-wider mb-0.5">Comment Keyword CTA</p>
                      <p className="text-sm font-mono text-foreground font-bold">{script.commentKeyword}</p>
                    </div>
                    <CopyBtn text={`Comment "${script.commentKeyword}" below and I'll send you the full breakdown.`} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
