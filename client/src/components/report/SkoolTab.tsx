import { useState } from "react";
import { ChevronDown, ChevronUp, MessageCircle, Users } from "lucide-react";
import type { SkoolPostWithDMWorkflow, DMMessage } from "@shared/reportContent";
import { CopyAllBtn, CopyBtn, POST_FORMAT_CONFIG, RegenerateSectionBtn, SaveBtn } from "./reportShared";

export function SkoolTab({
  posts,
  reportId,
  reportName,
}: {
  posts: SkoolPostWithDMWorkflow[];
  reportId: number;
  reportName: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(0);

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No Skool posts generated yet. Click Regenerate to write them.
        <div className="flex justify-center mt-4">
          <RegenerateSectionBtn reportId={reportId} section="skoolPosts" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-2xl">
          Keyword trigger posts for your Skool community. Each post drives comments with a keyword, then an automated 6-DM sequence (ending with a 7-day re-open) converts commenters into buyers. Uses #NAME# as the Skool personalisation token.
        </p>
        <div className="flex items-center gap-2">
          <CopyAllBtn getText={() => posts.map((p, i) => `POST ${i + 1} [${p.commentKeyword}]\n\n${p.postCopy}`).join("\n\n=====\n\n")} />
          <RegenerateSectionBtn reportId={reportId} section="skoolPosts" />
        </div>
      </div>

      {posts.map((post, i) => {
        const formatCfg = post.postFormat ? POST_FORMAT_CONFIG[post.postFormat] : null;
        return (
          <div key={i} className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
            {/* Post Header */}
            <button
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-card/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">
                      {(() => {
                        const s = (post.style ?? "").toLowerCase();
                        const isLink = s.includes("2") || s.includes("link") || s.includes("call");
                        const ctaType = isLink ? "Link CTA" : "Keyword CTA";
                        return `Post ${i + 1}: ${ctaType} [${post.commentKeyword}]`;
                      })()}
                    </p>
                    {formatCfg && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${formatCfg.color}`}>
                        {formatCfg.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Comment keyword: <span className="text-primary font-mono font-bold">{post.commentKeyword}</span>
                  </p>
                </div>
              </div>
              {expanded === i ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
            </button>

            {expanded === i && (
              <div className="px-5 pb-5 space-y-5">
                {/* Post Copy */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Post Copy</p>
                    <div className="flex items-center gap-1">
                      <SaveBtn reportId={reportId} searchKeyword={reportName} contentType="skool_post" label={`Skool Post ${i + 1} [${post.commentKeyword}]`} content={post.postCopy} />
                      <CopyBtn text={post.postCopy} />
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-border/30 bg-card/20">
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{post.postCopy}</p>
                  </div>
                </div>

                {/* DM Workflow */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <MessageCircle className="w-3.5 h-3.5 text-primary" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">DM Workflow (triggered after keyword comment)</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Uses <span className="font-mono text-primary">#NAME#</span> as the Skool custom value for personalisation.
                  </p>
                  <div className="space-y-3">
                    {((post.dmWorkflow ?? []) as DMMessage[]).map((dm) => (
                      <div key={dm.dmNumber} className="flex gap-3">
                        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">{dm.dmNumber}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground mb-1.5 font-medium">{dm.timing}</p>
                          <div className="group relative p-3 rounded-lg border border-border/30 bg-card/20 hover:border-primary/20 transition-colors">
                            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line pr-8">{dm.copy}</p>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <CopyBtn text={dm.copy} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
