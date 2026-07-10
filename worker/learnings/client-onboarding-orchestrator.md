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
