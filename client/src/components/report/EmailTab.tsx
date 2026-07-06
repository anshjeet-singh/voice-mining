import { useState } from "react";
import { ChevronDown, ChevronUp, FlaskConical, Snowflake } from "lucide-react";
import type { EmailMessage, EmailSequence } from "@shared/reportContent";
import { CopyAllBtn, CopyBtn, RegenerateSectionBtn, SaveBtn, ScoreMeter } from "./reportShared";

function emailFullText(e: EmailMessage): string {
  return `SUBJECT: ${e.subject}\nPREVIEW: ${e.previewText}\n\n${e.body}${e.signOff ? `\n\n${e.signOff}` : ""}`;
}

/** Render simple <strong>/<em>/<u> inline HTML from AI-formatted email bodies. */
function renderHtmlLine(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let key = 0;
  const tagRe = /<(strong|em|u)>([\s\S]*?)<\/\1>/g;
  let lastIndex = 0;
  let match;
  while ((match = tagRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    const tag = match[1];
    const inner = match[2];
    if (tag === "strong") parts.push(<strong key={key++}>{inner}</strong>);
    else if (tag === "em") parts.push(<em key={key++}>{inner}</em>);
    else parts.push(<u key={key++}>{inner}</u>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  return parts.length > 0 ? parts : [text];
}

export function EmailTab({
  emailSeq,
  reportId,
  reportName,
}: {
  emailSeq: EmailSequence;
  reportId: number;
  reportName: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const emails = emailSeq?.emails ?? [];

  if (emails.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No email sequence generated yet. Click Regenerate to write it.
        <div className="flex justify-center mt-4">
          <RegenerateSectionBtn reportId={reportId} section="emailSequence" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-foreground">{emailSeq.sequenceName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {emails.length} emails using Hormozi lead nurture framework with your exact voice data. Uses {"{{ subscriber.first_name }}"} for ConvertKit personalisation. Each email includes a split test subject line and an open rate score.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CopyAllBtn getText={() => emails.map(emailFullText).join("\n\n---\n\n")} />
          <RegenerateSectionBtn reportId={reportId} section="emailSequence" />
        </div>
      </div>

      {emails.map((email, i) => {
        const isOpen = expanded === i;
        const isReEngagement = email.emailType === "re_engagement";
        return (
          <div key={i} className="rounded-xl border border-border/40 bg-card/30 overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : i)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-card/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
                  <span className="text-xs font-bold text-primary">{email.dayNumber}</span>
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{email.subject}</p>
                    {isReEngagement && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 flex items-center gap-1">
                        <Snowflake className="w-3 h-3" />
                        Re-engagement
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{email.previewText}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {typeof email.openRatePrediction === "number" && (
                  <div className="hidden md:block">
                    <ScoreMeter value={email.openRatePrediction} label="Open rate" color="text-emerald-400" />
                  </div>
                )}
                <span className="text-xs text-muted-foreground hidden sm:block">Day {email.dayNumber}</span>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="px-5 pb-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-border/30 bg-card/20">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Subject Line</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-foreground font-medium">{email.subject}</p>
                      <CopyBtn text={email.subject} />
                    </div>
                    {typeof email.openRatePrediction === "number" && (
                      <div className="mt-2">
                        <ScoreMeter value={email.openRatePrediction} label="Open rate" color="text-emerald-400" />
                      </div>
                    )}
                  </div>
                  <div className="p-3 rounded-lg border border-border/30 bg-card/20">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Preview Text</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-foreground">{email.previewText}</p>
                      <CopyBtn text={email.previewText} />
                    </div>
                  </div>
                </div>

                {email.splitTestSubject && (
                  <div className="p-3 rounded-lg border border-amber-400/20 bg-amber-400/5">
                    <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <FlaskConical className="w-3 h-3" />
                      Split Test Variant
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-foreground">{email.splitTestSubject}</p>
                      <CopyBtn text={email.splitTestSubject} />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Body</p>
                    <div className="flex items-center gap-1">
                      <SaveBtn reportId={reportId} searchKeyword={reportName} contentType="email" label={`Day ${email.dayNumber}: ${email.subject.slice(0, 60)}`} content={emailFullText(email)} />
                      <CopyBtn text={`${email.body}${email.signOff ? `\n\n${email.signOff}` : ""}`} />
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-border/30 bg-card/20">
                    <div className="text-sm text-foreground/90 leading-relaxed">
                      {(() => {
                        // Strip any trailing sign-off that leaked into the body
                        const signOffPatterns = [/\n*talk soon[,.]?.*$/i, /\n*i talk soon[,.]?.*$/i];
                        let cleanBody = email.body;
                        for (const pat of signOffPatterns) cleanBody = cleanBody.replace(pat, "");
                        return cleanBody.split("\n").map((line, li) => {
                          if (line === "") return <div key={li} className="mt-3" />;
                          return <p key={li}>{renderHtmlLine(line)}</p>;
                        });
                      })()}
                    </div>
                    {email.signOff && (
                      <div className="text-sm text-foreground/70 mt-3 pt-3 border-t border-border/30">
                        {email.signOff.split("\n").map((line, li) => (
                          <p key={li} className={li === 0 ? "" : "mt-0.5"}>{line}</p>
                        ))}
                      </div>
                    )}
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
