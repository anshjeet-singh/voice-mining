# Learnings: client-onboarding-orchestrator

Accumulated craft lessons applied on every run.

<!-- 2026-07-07 · job 1 · client: Trent Kus -->
- Add an explicit content-safety pass to the voice rules: raw client onboarding material (voice memos, call transcripts) frequently contains profanity, offensive remarks, or admissions of non-compliant practices. Deliverables must extract the client's energy and phrasing while filtering that content out, defaulting to the client's professional/on-call register rather than their raw private register. The current rules say "write in the client's voice" but never say to sanitize it, which risks leaking unpublishable content into assets.

<!-- 2026-07-09 · job 30001 · client: Trent Kus -->
- The Step 1 format rule tells the writer to open the exemplar client's `Foundations/` folder in Google Drive and match its structure. In local, headless, or no-Drive-connector runs that folder is unreachable, which can stall the step or lead to guessing. State explicitly that the embedded Appendix templates are the authoritative source of truth for shape, and the Drive exemplar is a cross-check to use only when reachable, so a run never blocks on Drive access.
- The Appendix says "no horizontal-rule dividers" but this is a Google Doc filing rule, while the same docs are frequently delivered first as rendering markdown (web app preview) where `---` between major sections aids scannability. Clarify that the no-horizontal-rule constraint applies to the Google Doc upload, not the markdown deliverable, so writers aren't caught between two conflicting formatting instructions.

<!-- 2026-07-09 · job 150001 · client: Trent Kus -->
- The Step 5 SMS spec is written by the orchestrator directly with no child skill, but it never defines placeholders for the two links SMS actually needs: the meeting/join link and the pre-call hub link. The funnel-structure framework only standardizes `[BOOKING LINK]`, `[VSL LINK]`, and `[COMMUNITY LINK]`. Add `[CALL LINK]` (the calendar event's join link, used by the reminder texts) and `[PRE-CALL HUB LINK]` to the canonical placeholder set so SMS reminders and the asset nudge aren't improvising URLs.
- The SMS rules list voice and length constraints but omit the TCPA opt-out requirement. Add a note that the first message in any SMS set should carry a short opt-out ("Reply STOP to opt out"), since it does not count as the one CTA and is a legal requirement for marketing SMS.

<!-- 2026-07-10 · job 180003 · client: Trent Kus -->
- Step 5 Branch B routes only to pre-call-email-writer for "the 14-email booking-to-call sequence," but the actual core call-funnel deliverable is the 14-DAY community-join nurture, whose arc lives in the emails-and-booking framework, not in either email child skill. The Step 5 Branch B line should name the emails-and-booking 14-angle arc as the structural source and cast the email child skills as the voice/craft layer on top, so the build doesn't default to the wrong (post-booking) sequence shape.

<!-- 2026-07-10 · job 180003 · client: Trent Kus -->
- Step 5's SMS block should standardize the two placeholders the call-branch SMS set needs but the base placeholder set (`[BOOKING LINK]`, `[VSL LINK]`, `[COMMUNITY LINK]`) does not cover: `[CALL LINK]` (the calendar event's join link, used by the reminders) and `[PRE-CALL HUB LINK]` (the asset nudge). Without this, each writer re-derives them and risks inventing URLs.
- Step 5's SMS rules should explicitly require a "Reply STOP to opt out" on the first text of every marketing SMS set. It is a legal (TCPA) requirement, it does not count as the text's one CTA, and it is easy to omit since the character budget is tight.

<!-- 2026-07-10 · job 180004 · client: Trent Kus -->
- Step 5's SMS block was fixed in prior runs, but the email side of Branch B still names only pre-call-email-writer and email-campaign-writer as the child skills, with no explicit home for the no-show-and-post-call recovery deliverable. Name the recovery track explicitly (no-show recovery + post-call follow-up) and route its structure to the pre-call-email-writer no-show section plus the post-webinar follow-up anatomy, so the deliverable is not assembled ad hoc from a prompt spec each run.

<!-- 2026-07-10 · job 180004 · client: Trent Kus -->
- Step 5's SMS companion spec (the call-branch list) is missing two texts that the deliverable is now expected to include: a "post-call follow-up" text. The list currently stops at the no-show rebook. Add the post-call follow-up to the call-branch SMS enumeration so it is not left to the writer to infer.
- The Step 5 SMS rules omit the TCPA opt-out requirement. Add: the first text in every SMS set carries "Reply STOP to opt out," and that opt-out line does not count against the one-CTA rule. It is easy to drop under a tight character budget, so it should be stated explicitly.
- Step 5 names only the generic email placeholders. The SMS set needs its own standardized placeholder trio, [PRE-CALL HUB LINK] (asset nudge), [CALL LINK] (the calendar join link the reminders point at), and [BOOKING LINK] (reschedule), distinct from the email placeholders. Name these in the skill so writers do not re-derive them and risk inventing URLs.

<!-- 2026-07-10 · job 180005 · client: Trent Kus -->
- The Step 5 SMS companion spec lists six texts and stops at the no-show rebook, but the mandated set is now seven (the post-call follow-up is a real, recurring deliverable). Update the SMS bullet in Step 5 to enumerate seven, and fold in the standardized SMS placeholder trio (`[PRE-CALL HUB LINK]`, `[CALL LINK]`, `[BOOKING LINK]`) and the mandatory "Reply STOP to opt out" line on text 1 (TCPA, does not count as the CTA), so each run does not re-derive them.
- The SMS section has no dual-time-anchor or short-runway compression guidance. Add it: value texts key off the booking timestamp, reminders key off call time, and a same-day booking must drop the already-past 24h/3h reminders while always keeping the instant confirmation and the 15-minute reminder. Without this, a same-day booking fires a "24h reminder" that is already in the past when loaded into GHL.
