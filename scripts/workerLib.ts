/**
 * Pure helpers for the local Mac worker: build a headless Claude Code prompt
 * for ONE deliverable of a pipeline stage, and parse the files it writes back.
 * The server's stage registry ships the stage spec (skills, output files,
 * instructions) inside the claim payload, so this module stays generic.
 * One prompt per deliverable lets the worker run deliverables IN PARALLEL
 * and keeps each run's attention on a single document.
 * No I/O here — worker.ts owns the filesystem and network.
 */

export interface StageOutputSpec {
  docType: string;
  filename: string;
  title: string;
  description: string;
}

export interface StageSpec {
  label: string;
  motherStep: string;
  childSkills: string[];
  outputs: StageOutputSpec[];
  extraInstructions: string;
}

export interface ClaimedJob {
  id: number;
  type: string;
  stage: StageSpec;
  client: { name: string; niche: string; funnelType: string; pricePoint: string };
  onboardingDocs: Array<{ title: string; docType: string; content: string }>;
  /** Approved artefacts from earlier stages (foundation docs, skool copy, ...). */
  approvedDocs: Array<{ title: string; docType: string; content: string }>;
  research: string;
  lessons: string[];
  feedback: string;
}

export interface PromptOptions {
  /** Read-only claude.ai skills cache holding the agency skills. */
  skillsDir: string;
  /** Git-versioned worker/learnings dir with accumulated craft lessons. */
  learningsDir: string;
  /** Git-versioned worker/frameworks dir: distilled copywriting playbooks. */
  frameworksDir?: string;
}

/** Build the prompt for ONE deliverable of a stage. */
export function buildDocPrompt(job: ClaimedJob, output: StageOutputSpec, opts: PromptOptions): string {
  const { stage } = job;
  const siblings = stage.outputs
    .filter((o) => o.docType !== output.docType)
    .map((o) => `${o.title} (${o.filename})`)
    .join(", ");

  const onboarding = job.onboardingDocs
    .map((d) => `### ${d.title} (${d.docType})\n\n${d.content}`)
    .join("\n\n---\n\n");

  const approved = job.approvedDocs.length
    ? `\n# APPROVED DOCUMENTS FROM EARLIER STAGES (consume these fully; never work from a summary)\n\n${job.approvedDocs
        .map((d) => `### ${d.title} (${d.docType})\n\n${d.content}`)
        .join("\n\n---\n\n")}\n`
    : "";

  const lessons = job.lessons.length
    ? `\n# CLIENT LESSONS (apply these — feedback from previous work with this client)\n\n${job.lessons.map((l) => `- ${l}`).join("\n")}\n`
    : "";

  const feedback = job.feedback.trim()
    ? `\n# REVISION FEEDBACK (this is a regeneration — the previous version was rejected; fix these issues)\n\n${job.feedback.trim()}\n`
    : "";

  return `You are running ${stage.motherStep} of the client-onboarding-orchestrator skill for our agency: ${stage.label}. Your job in THIS run is exactly ONE deliverable: ${output.title}.${siblings ? ` (Other runs are producing ${siblings} in parallel; do not produce their content.)` : ""}

# MANDATORY READING (do this FIRST, with the Read tool, before writing a single word)
You MUST read, in full, in this order:
1. The mother skill: ${opts.skillsDir}/client-onboarding-orchestrator/SKILL.md
2. EVERY child skill for this stage: ${stage.childSkills.join(", ")} (each lives in its own folder under ${opts.skillsDir}/ as SKILL.md; strip any parenthetical mode note to get the folder name)
3. THEN list the full skills directory (ls ${opts.skillsDir}) and read ANY OTHER skill whose name matches this deliverable. The agency has 90+ skills covering VSLs, confirmation pages, copy polish, offers, emails, and more. The child skills listed above are the MINIMUM, not the ceiling: if you write a VSL without reading every VSL-related skill in that directory, you have failed.
4. ${opts.frameworksDir ?? "the frameworks directory"}/INDEX.md FIRST, then EVERY file in that directory (distilled word-by-word from the $100M playbooks, Sell Like Crazy + the full Suby system, Scientific Advertising, the Brunson books, SPIN Selling, McLaughlin's NLP language patterns, the ad-script + Haynes skill bundles, and the frameworks of Todd Brown, Stefan Georgi, Dan Henry, and Jason Wojo; these set the QUALITY BAR). The INDEX routes your specific deliverable to the files that carry the most weight for it and lists the universal quality gates; weight your writing accordingly.
5. EVERY file in ${opts.learningsDir}/ (lessons from past client work)

This is not optional. The deliverable must VISIBLY follow the skill templates and pass the framework quality bars. If your draft would read the same without having read these files, you have failed the task. Skill files and framework files are READ-ONLY. Never modify anything under ${opts.skillsDir}.

# CLIENT
- Name: ${job.client.name}
- Niche: ${job.client.niche}
- Funnel type: ${job.client.funnelType}
- Price point: ${job.client.pricePoint || "not specified"}
${lessons}${feedback}${approved}
# ONBOARDING MATERIAL

${onboarding}

# VOICE MINING RESEARCH (this is your copy source: pains -> pain blocks, objections -> FAQ/breakouts, desires -> promises, verbatims -> phrasing)

${job.research || "(no research report attached — work from the documents above and note the gap in your lessons)"}

# YOUR TASK
Write ${output.filename} (${output.title}): ${output.description}

Stage instructions: ${stage.extraInstructions}

The STRUCTURE comes from the skills, not from this prompt: follow the mother skill's process and the child skills' templates EXACTLY, section by section.

# DOCUMENT RULES (this is a CLIENT-FACING, FINAL deliverable)
- Start the file with a single # title and go straight into the content.
- NO meta preamble: never open with "Client:", "Funnel type:", "Offer:", "Sources:", or notes about what the document contains.
- NO analysis sections, NO "candidates", NO option lists, NO commentary about your choices. You make the call and ship final copy. The ONLY exception is where the deliverable description above explicitly asks for ranked options.
- The owner hands this document to the client. Anything that reads like an internal working note is a defect.

# FORMATTING RULES (the doc renders in a web app as formatted markdown)
- Clean heading hierarchy: one # title, ## for sections, ### for subsections. Never skip levels.
- Use GitHub-flavored markdown TABLES wherever the skill's template calls for tabular content. Real | tables, not bullet lists pretending to be tables.
- Bold the key labels inside prose so sections scan fast.
- Short paragraphs (3 sentences max), bullets for lists, --- between major sections.
- NO em dashes anywhere. Use commas, colons, or periods instead.

# LIVE PROGRESS (the owner watches this while you work)
Each time you start a distinct step, APPEND one short present-tense line to ./PROGRESS.log in your working directory (create it on your first step). Examples: "reading the reference ad library (97 images)", "building ad 3 of 15: notes app, dark mode", "QA pass on ad 3: fixing title overflow", "writing video script 2 of 5", "saving batch to Drive". One line per step, newest line last, under 90 characters, no timestamps. Never skip this: it is the only visibility the owner has into a long run.

# LESSONS OUTPUT
After the deliverable, also write:
- client_lessons.md — one bullet per lesson SPECIFIC TO THIS CLIENT. Write "none" if nothing.
- craft_lessons.md — lessons that would improve the SKILLS THEMSELVES. Format strictly as sections:
## skill: <skill-folder-name>
- <lesson>
Write "none" if nothing. Be conservative.

Write ${output.filename}, client_lessons.md, and craft_lessons.md, then stop.`;
}

export interface DocOutput {
  content: string;
  clientLessons: string[];
  craftLessonsRaw: string;
}

/** Parse one deliverable run's job dir (name -> content). */
export function parseDocOutput(
  files: Record<string, string | undefined>,
  output: StageOutputSpec
): DocOutput {
  const content = files[output.filename]?.trim();
  if (!content || content.length < 50) {
    throw new Error(`Missing or too-short output file: ${output.filename}`);
  }

  const clientLessons = (files["client_lessons.md"] ?? "")
    .split("\n")
    .map((l) => l.replace(/^[-*]\s*/, "").trim())
    .filter((l) => l.length > 5 && !/^none\.?$/i.test(l));

  return { content, clientLessons, craftLessonsRaw: files["craft_lessons.md"] ?? "" };
}

export interface CraftLesson {
  skill: string;
  lessons: string;
}

/** Parse craft_lessons.md's "## skill: <name>" sections into per-skill chunks. */
export function parseCraftLessons(raw: string): CraftLesson[] {
  const trimmed = raw.trim();
  if (!trimmed || /^(none\.?|no new craft lessons\.?)$/i.test(trimmed)) return [];

  const out: CraftLesson[] = [];
  const sections = trimmed.split(/^##\s*skill:\s*/im).slice(1);
  for (const section of sections) {
    const newline = section.indexOf("\n");
    const rawName = (newline === -1 ? section : section.slice(0, newline)).trim();
    const body = (newline === -1 ? "" : section.slice(newline + 1)).trim();
    const skill = rawName
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (skill && body) out.push({ skill, lessons: body });
  }
  return out;
}
