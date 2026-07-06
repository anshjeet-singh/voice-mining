import { Instagram, Megaphone, Video } from "lucide-react";
import type { AdCopyIdea } from "@shared/reportContent";
import {
  AwarenessFunnel,
  CopyAllBtn,
  CopyBtn,
  RegenerateSectionBtn,
  SaveBtn,
  ScoreMeter,
} from "./reportShared";

const FORMAT_META = {
  talking_head: {
    label: "Talking Head Ads",
    blurb: "Direct-to-camera ad scripts. Read these to camera or use as teleprompter scripts.",
    icon: Video,
    accent: "text-primary",
    pill: "text-primary bg-primary/10 border-primary/20",
    cardBorder: "border-border/40",
    ctaBorder: "border-primary/20 bg-primary/5",
    ctaText: "text-primary",
    hookLabel: "Hook / Opening Line",
    bodyLabel: "Script Body",
  },
  b_roll: {
    label: "B-Roll Ads",
    blurb: "Text-overlay ads. Bold on-screen text over B-roll footage. No voiceover needed.",
    icon: Megaphone,
    accent: "text-amber-400",
    pill: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    cardBorder: "border-amber-400/10",
    ctaBorder: "border-amber-400/20 bg-amber-400/5",
    ctaText: "text-amber-400",
    hookLabel: "Opening Hook (On-Screen Text)",
    bodyLabel: "On-Screen Text Overlays",
  },
  instagram_story: {
    label: "Instagram Story Ads",
    blurb: "Full-screen vertical story frames with a link-sticker CTA. Casual and native, like a friend talking.",
    icon: Instagram,
    accent: "text-rose-400",
    pill: "text-rose-400 bg-rose-400/10 border-rose-400/20",
    cardBorder: "border-rose-400/10",
    ctaBorder: "border-rose-400/20 bg-rose-400/5",
    ctaText: "text-rose-400",
    hookLabel: "Frame 1 (Hook)",
    bodyLabel: "Frames 2-3",
  },
} as const;

type AdFormat = keyof typeof FORMAT_META;

function AdCard({
  ad,
  index,
  format,
  reportId,
  reportName,
}: {
  ad: AdCopyIdea;
  index: number;
  format: AdFormat;
  reportId: number;
  reportName: string;
}) {
  const meta = FORMAT_META[format];
  const Icon = meta.icon;
  const fullText = `${ad.headline}\n\n${ad.body}\n\n${ad.cta}`;
  return (
    <div className={`p-5 rounded-xl border ${meta.cardBorder} bg-card/30`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className={`w-4 h-4 ${meta.accent}`} />
          <span className="text-sm font-semibold text-foreground">
            {meta.label.replace(" Ads", "")} Ad {index + 1}
          </span>
          {typeof ad.painAgitationScore === "number" && (
            <ScoreMeter value={ad.painAgitationScore} label="Pain agitation" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <SaveBtn
            reportId={reportId}
            searchKeyword={reportName}
            contentType="ad_copy"
            label={`${meta.label.replace(" Ads", "")} Ad ${index + 1}: ${ad.headline.slice(0, 50)}`}
            content={fullText}
          />
          <CopyBtn text={fullText} />
        </div>
      </div>

      <div className="flex gap-5">
        <div className="flex-1 min-w-0">
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{meta.hookLabel}</p>
            <p className="text-sm font-semibold text-foreground leading-relaxed">{ad.headline}</p>
          </div>
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{meta.bodyLabel}</p>
            <div className="p-4 rounded-lg border border-border/30 bg-card/20">
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{ad.body}</p>
            </div>
          </div>
          <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${meta.ctaBorder}`}>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${meta.ctaText}`}>Call to Action</p>
              <p className="text-sm text-foreground font-medium">{ad.cta}</p>
            </div>
            <CopyBtn text={ad.cta} />
          </div>
        </div>

        {/* Awareness funnel visual */}
        <div className="hidden sm:flex flex-col items-center justify-center flex-shrink-0 px-2">
          <AwarenessFunnel level={ad.awarenessLevel} />
        </div>
      </div>
      {/* Mobile: funnel below */}
      <div className="sm:hidden mt-3 flex justify-center">
        <AwarenessFunnel level={ad.awarenessLevel} />
      </div>
    </div>
  );
}

export function AdsTab({
  ads,
  reportId,
  reportName,
}: {
  ads: AdCopyIdea[];
  reportId: number;
  reportName: string;
}) {
  const formats: AdFormat[] = ["talking_head", "b_roll", "instagram_story"];

  const allText = () =>
    formats
      .map((f) => {
        const list = ads.filter((a) => a.format === f);
        if (list.length === 0) return "";
        return `${FORMAT_META[f].label.toUpperCase()}\n\n${list
          .map((ad, i) => `Ad ${i + 1} [${ad.awarenessLevel}]\n${ad.headline}\n\n${ad.body}\n\nCTA: ${ad.cta}`)
          .join("\n\n---\n\n")}`;
      })
      .filter(Boolean)
      .join("\n\n=====\n\n");

  if (ads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No ad copy generated yet. Click Regenerate to write your ads.
        <div className="flex justify-center mt-4">
          <RegenerateSectionBtn reportId={reportId} section="adCopyIdeas" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Ads written using Hormozi's GOATed Ads method with your exact voice data. Talking Head, B-Roll, and Instagram Story formats across all 5 awareness levels.
        </p>
        <div className="flex items-center gap-2">
          <CopyAllBtn getText={allText} />
          <RegenerateSectionBtn reportId={reportId} section="adCopyIdeas" />
        </div>
      </div>

      {formats.map((format) => {
        const list = ads.filter((a) => a.format === format);
        if (list.length === 0) return null;
        const meta = FORMAT_META[format];
        return (
          <div key={format} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/40" />
              <span className={`text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full border ${meta.pill}`}>
                {meta.label}
              </span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <p className="text-xs text-muted-foreground">{meta.blurb}</p>
            {list.map((ad, i) => (
              <AdCard key={i} ad={ad} index={i} format={format} reportId={reportId} reportName={reportName} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
