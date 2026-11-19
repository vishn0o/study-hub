/* Builds the agent prompt in the browser AFTER the user tells it when the exam is.
   The prompt below is a template — call buildAgentPrompt(answers) to instantiate it.
   Keep the DATA BLOCK section in sync with the parser in app.js. */

const AGENT_PROMPT_TEMPLATE = `You are converting my study material into a "Study Hub" import file.

MY EXAM CONTEXT — non-negotiable, do not answer until you've internalised these
- Subject / exam: WE WILL DEFINE THIS TOGETHER (see step 2 below).
- Exam date and time: {{EXAM_DATETIME}}  ← you will use this in @@EXAMDATE, exactly as given
- Effective study hours (realistic, not calendar): {{EFFECTIVE_HOURS}} hours
- Target: {{TARGET}}  ← "guaranteed pass" target, do NOT produce a full-syllabus tour
- Timing mode (computed from my hours): {{MODE}}
- If I don't know something, ask — do not guess. Never invent a date, a mark or a question.

=== TIMING MODES (the mode is selected for you above) ===

CRASH (<10 effective hours)
- Prune to PYQ-heavy, high-yield topics only. Off-paper material goes first. SKIP off-paper topics — mark as "SKIP" with a one-line reason.
- 45–90 minute blocks. Sleep. Every block has an explicit time budget and the marks it targets.
- 2 long mock solves in the final stretch, graded.

STANDARD (10–36 effective hours)
- Cover every PYQ topic; trim only at the margins.
- Full skeleton per topic: key facts → worked example → 5 practice questions → model answers → traps.
- 1 locked mock in the final 2–3 hours, by ROI first.

DEEP (36+ effective hours)
- Cover the full syllabus; PYQ-first; then outward edges.
- Same skeleton per topic + spaced sessions with mocks scattered.
- A comprehensive locked mock at the end.

QUALITY IS CONSTANT ACROSS ALL MODES
- 5 practice questions per topic, complete step-by-step solutions, model answers, memory hooks, formulas.
- You will NOT shrink depth, skip worked examples or drop model answers because time is tight. Cut topics; never quality.

WHAT I WILL ATTACH
1. My syllabus or unit list.
2. My previous-year question papers (PYQs) with marks.
3. My study notes / slides / textbook extracts.
4. (Optional) Marking scheme / blueprint.
5. (Optional) Which topics appear on every paper — drives the @@EVERY flag.

YOUR TASK
1. Split the syllabus into 5–15 topics, in order of exam urgency (highest-ROI first).
2. For each topic: key concepts, rules, formulas, memory hooks, AND every relevant PYQ with a complete worked answer.
3. Use the marks printed on the paper. If marks are missing, estimate conservatively.
4. Size the plan to the {{EFFECTIVE_HOURS}} hours above — no safety padding. Be honest about what's skipped in CRASH.
5. Produce ONE PDF. Put a short study guide first if you like, then the machine-readable DATA BLOCK at the very end.

FORMAT RULES (critical)
- Use plain ASCII only: straight quotes ( ' and " ), hyphens, no smart quotes, no curly apostrophes, no emoji.
- Put the DATA BLOCK at the very end, on its own page(s), in a monospaced font.
- Add NO page numbers, headers, footers, watermarks or decorations on those pages.
- Do not hand-wrap marker lines; let the PDF wrap naturally.
- Every marker line starts at the beginning of a line with two @ signs and a space after the marker name.
- If a normal content line would start with two @ signs, add one leading space to it.
- Do not translate, rename or reorder the markers — the importer is exact.
- Marks and ranks must be whole numbers.
- The DATA BLOCK is plain text inside your PDF, not a separate file. If you cannot emit a PDF, output the same text as a .txt / .md file and I can upload that.
- Quality over quantity: focus on {{EFFECTIVE_HOURS}} hours of real coverage, not a comprehensive syllabus tour.

DATA BLOCK FORMAT (internal — visible to you, the assistant, and the app)
@@STUDY_TRACKER v1
@@SUBJECT <subject name>
@@COURSE <course code, optional>
@@EXAM <total marks in the paper, whole number>
@@TARGET <{{TARGET}}>
@@DESC <one-line description>
@@EXAMDATE {{EXAM_DATETIME}}
@@TOPIC <topic title>
@@MARKS <marks this topic is worth — whole number>
@@EVERY <true if this topic appears on EVERY paper / is high ROI, otherwise false>
@@RANK <study priority: 1 = study first>
@@CONCEPT <one key fact, rule, formula, memory hook>
@@FORMULA <LaTeX math — only if the topic requires a formula>
@@QUESTION <full question text, including paper and year if known>
@@QMARKS <marks for this question — whole number>
@@SOURCE <paper / year / question number, e.g. 2024 Q2, or 'SYNTHESIZED'>
@@ANSWER <one paragraph of the model answer>
@@STEP <one short solving step>
@@STEP <next solving step>
@@CODE
<code, trace or diagram lines>
@@ENDCODE          ← only if the answer needs code, a trace, or a diagram
@@ENDQ

## AFTER ALL TOPICS:
@@PLAN_RANKING
Rank | Topic | Marks | ROI
@@ENDPLAN_RANKING
@@PLAN_SCHEDULE
Hours | Block | Marks target
@@ENDPLAN_SCHEDULE
@@CHECKLIST <final locked phase things to do>
@@END

HOW TO USE @@EVERY
- 2–4 per subject is realistic. Rankings/professor guidance / PYQ frequency are inputs.
- Mark high-priority topics that recur every paper with @@EVERY true. Everything else @@EVERY false (or omitted).
- If absent from the papers entirely, say so in @@DESC.

HOW TO USE @@FORMULA
- Emit one @@FORMULA <latex> line per formula the topic requires (recurrence relations, hash functions, tree height, complexity results, trigonometric/physics formulas — anything you'd write on a formula sheet).
- Use LaTeX math syntax: T(n) = 2T(n/2) + n ; x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} ; h = \\log_2 n.
- Keep each formula on ONE line. No display math, no surrounding $$ delimiters — the app renders every formula you list.
- If the topic has no formula, omit @@FORMULA entirely. Do not include empty slots.
- Do NOT put whole solution paragraphs here — only the formulas themselves.

REPEAT RULES
- Repeat @@CONCEPT for every key idea.
- Repeat @@ANSWER for every paragraph.
- Repeat @@STEP for every solving step.
- Repeat @@QUESTION / @@ENDQ for every question.
- Every topic needs at least one @@CONCEPT and one @@QUESTION.
- Every question needs at least one @@ANSWER or @@STEP.
- A topic block always ends with @@ENDTOPIC.
- Only include the optional PLAN_* and CHECKLIST blocks if the material supports them.
- The whole file ends with @@END.

FORMAT AND ENCODING
- ASCII only, straight quotes ( ' and " ), no smart quotes, no curly apostrophes, no emoji, no BOM.
- One marker per line. No hand-wrapping.
- If a normal prose line would start with @@, add one leading space.
- Marks, ranks, totals all whole numbers.

QUALITY CHECK BEFORE YOU FINISH
- Every worked example / solution shows every step — no "similarly" or "obvious" shortcuts.
- Every question is a PYQ or clearly labelled "SYNTHESIZED". If you synthesised it to test the student, say so.
- No topic is systematically padded with filler; every line teaches.
- The schedule matches my effective hours honestly — nothing you'd not actually do.
- Nothing appears after @@END.

TINY EXAMPLE
@@STUDY_TRACKER v1
@@SUBJECT Database Management Systems
@@COURSE CS-201
@@EXAM 50
@@TARGET {{TARGET}}
@@DESC Normalization and ER modelling.
@@EXAMDATE {{EXAM_DATETIME}}
@@TOPIC Normalization
@@MARKS 6
@@RANK 1
@@EVERY true
@@CONCEPT 1NF requires atomic values only.
@@CONCEPT 2NF removes partial dependencies on a composite key.
@@CONCEPT 3NF removes transitive dependencies.
@@FORMULA X \\to Y  and  Y \\to Z  \\Rightarrow  X \\to Z
@@QUESTION Explain 1NF, 2NF and 3NF with examples.
@@QMARKS 6
@@SOURCE 2024 Q2
@@ANSWER 1NF splits repeating groups into separate rows.
@@ANSWER 2NF removes attributes that depend on only part of a composite key.
@@STEP Identify the primary key of the relation.
@@STEP Check each non-key attribute for partial and transitive dependencies.
@@CODE
STUDENT(id, name, course, course_name)
  -> 3NF: STUDENT(id, name) + COURSE(course, course_name)
@@ENDCODE
@@ENDQ
@@ENDTOPIC
@@END

IF YOU CANNOT PRODUCE A PDF
- Output exactly the same text as a .txt or .md file instead. I can upload that.
`;

const ATTACHMENTS = [
  'Syllabus / unit list (defines the topics)',
  'Previous-year question papers (the questions) — with marks if available',
  'Study notes / slides / textbook extracts (the answers and steps)',
  'Marking scheme or blueprint, if you have one',
  'Which topics appear on every paper (drives the @@EVERY flag)',
];

const TIMING_MODES = [
  { min: 0, max: 9, label: 'CRASH', blurb: '<10 effective hours — prune to PYQ / high-yield topics, skip the rest, 2 locked mocks.' },
  { min: 10, max: 36, label: 'STANDARD', blurb: '10–36 effective hours — cover every PYQ topic, full skeleton, locked mock at the end.' },
  { min: 37, max: Infinity, label: 'DEEP', blurb: '36+ effective hours — full syllabus, PYQ-first, spaced sessions, mocks throughout.' },
];

function modeFor(hours) {
  const h = Number(hours) || 0;
  for (const m of TIMING_MODES) { if (h >= m.min && h <= m.max) return m; }
  return TIMING_MODES[TIMING_MODES.length - 1];
}

function normalizeDateTimeLocal(v) {
  // datetime-local gives YYYY-MM-DDTHH:MM; keep as-is if valid, else empty
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  return m ? v : '';
}

function buildAgentPrompt(answers) {
  const examDate = normalizeDateTimeLocal(answers.examDate);
  const effectiveHours = Math.max(1, Math.min(300, Math.round(Number(answers.effectiveHours) || 10)));
  const target = Math.max(1, Math.min(200, Math.round(Number(answers.target) || 30)));
  const mode = modeFor(effectiveHours).label;

  return AGENT_PROMPT_TEMPLATE
    .replace(/{{EXAM_DATETIME}}/g, examDate)
    .replace(/{{EFFECTIVE_HOURS}}/g, String(effectiveHours))
    .replace(/{{TARGET}}/g, String(target))
    .replace(/{{MODE}}/g, mode);
}

const PROMPT_CAPTION = 'Paste this into any chat LLM (Claude, Gemini, ChatGPT…) together with your syllabus, PYQs and notes. The agent will ask you a couple of quick questions first — answer, then it returns one PDF in the correct format.';
