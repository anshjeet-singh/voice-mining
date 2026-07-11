# Learnings: creative-intel-sweep

Accumulated craft lessons applied on every run.

<!-- 2026-07-11 · job 270007 · client: Trent Kus -->
- Instagram reels frequently download from the scraper as a video-only stream (no audio track), which makes the transcription step fail with a hard 400 and silently drops the reel. A 733K-view competitor reel was nearly lost this way. When a transcript comes back empty or the transcribe call 400s, fall back to a bestaudio download (yt-dlp) and retry before discarding the reel. High-view reels are exactly the ones worth this extra step.
- Some of the highest-reach competitor reels carry no spoken words at all (silent B-roll with a music bed); the entire ad lives in the caption plus a comment keyword. The Hook/Beat/CTA teardown must treat the caption as the copy unit for these, label it as caption-borne with a "silent B-roll, no voiceover" note, and flag the format itself as the primary lesson rather than reporting an empty transcript.
- Before scraping named competitor handles, verify each handle resolves and correct obvious typos from the intake doc; a single misspelled handle returns zero results and looks like the account has no ads. Flag any handle that returns nothing for a manual check rather than reporting the competitor as absent.
- A competitor's platform-native top reels can be entirely off-topic (motivational or lyric clips) even when that competitor is a real threat in the niche, because their sales content lives on a different platform. Report where the on-topic content actually is (Twitter, webinar ads) as a coverage gap instead of concluding the competitor is weak.
