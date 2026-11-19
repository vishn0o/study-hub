/* Builds the agent prompt in the browser AFTER the user tells it when the exam is.
   The prompt below is a template — call buildAgentPrompt(answers) to instantiate it.
   Keep the DATA BLOCK section in sync with the parser in app.js. */

const AGENT_PROMPT_TEMPLATE = `Convert my study material into a structured plain-text file that my study-app can consume. Your whole job is exactly that, nothing else. Do not summarise, do not produce a separate PDF, do not ask me any questions, do not respond with anything except the marker block below.

YOUR TASK — ONE OUTPUT ONLY
Emit ONE code-block (or ONE attached file) containing the STUDY_TRACKER block described below, ending after @@END. No prose before or after it.

If you cannot emit a file, the entire response you give me is the contents of that file. I will copy-paste it into a .txt and upload it to my app.

MY EXAM CONTEXT — READ THIS BEFORE YOU WRITE
- Exam date and time: {{EXAM_DATETIME}}
- Effective study hours (not calendar): {{EFFECTIVE_HOURS}}
- Mode: {{MODE}}
- Target: {{TARGET}}
- Subjects: you will infer them from the attachments I give you.
- If I do not give you the subject name / course code / exam total, INFER FROM THE ATTACHMENTS. Do not ask me to clarify — look at the file's content and figure it out.
- If you cannot find total marks anywhere, leave @@EXAM as the summed total of the topics you give.

=== TIMING MODES (you read this; you don't ask me which applies) ===
- CRASH (<10 effective hours): prune to PYQ-heavy, high-yield topics only. Off-paper material SKIPPED — label them "SKIP". 45–90 minute blocks. Sleep. 2 mock solves at the end.
- STANDARD (10–36 effective hours): every PYQ topic; trim at the margins. Full skeleton per topic: key facts → worked example → 5 practice questions → model answers → traps. Locked mock at the end.
- DEEP (36+ effective hours): full syllabus, PYQ-first then outward edges. Same skeleton plus mocks + spaced sessions.

QUALITY IS CONSTANT ACROSS MODES
- 5 practice questions per topic, worked to the last step, with model answers and mark estimates for each.
- Do NOT shrink depth to fit time — cut topics, never quality.
- Every claim must be traceable to my attached material or a typical textbook; never invent facts.

WHAT I AM ATTACHING
1. My syllabus or unit list.
2. My previous-year question papers (PYQs) — with marks if available.
3. My study notes, slides or textbook extracts.
4. (Optional) Marking scheme / blueprint.
5. (Optional) Which topics recur every paper.

YOUR OUTPUT — FORMAT OF THE MARKER BLOCK
Plain ASCII, one marker per line, two @ signs at column 0 then ONE space. Straight quotes (" ') only. No smart quotes, no curly apostrophes, no emoji, no BOM.

@@STUDY_TRACKER v1
@@SUBJECT <subject name; infer from files>
@@COURSE <course code, optional>
@@EXAM <total marks, whole number>
@@TARGET {{TARGET}}
@@DESC <one-line description>
@@EXAMDATE {{EXAM_DATETIME}}
@@TOPIC <topic title — highest-yield first>
@@MARKS <marks this topic is worth, whole number>
@@EVERY <true if this topic appears on every paper / is high ROI, otherwise false>
@@RANK <ROI rank — 1 = most important>
@@CONCEPT <one key fact, rule, formula or memory hook>
@@CONCEPT <next key fact… repeat>
@@FORMULA <LaTeX math — only if the topic requires one, otherwise omit>
@@QUESTION <full question text — tag with year and paper if it's a PYQ, else 'SYNTHESIZED'>
@@QMARKS <marks the question is worth, whole number>
@@SOURCE <e.g. 2024 Q2, or 'SYNTHESIZED'>
@@ANSWER <one paragraph of the model answer>
@@STEP <one solving step>
@@STEP <next solving step>
@@CODE
<code / trace / diagram lines>
@@ENDCODE          ← only if the answer needs code, a trace or a diagram
@@ENDQ

## AFTER ALL TOPICS:
@@PLAN_RANKING
Rank | Topic | Marks | ROI
@@ENDPLAN_RANKING
@@PLAN_SCHEDULE
Hours | Block | Marks target
@@ENDPLAN_SCHEDULE
@@CHECKLIST <final locked phase>
@@END

GROUND RULES
- ASCII only. Straight quotes. No smart quotes, curly apostrophes, emoji, BOM, or trailing content after @@END.
- One marker per line. No hand-wrapping.
- If a line of prose WOULD start with @@, add ONE leading space.
- Do not translate, rename or reorder markers — the importer is exact (it parses on marker names).
- Marks and ranks are whole numbers.
- Repeat @@CONCEPT, @@ANSWER, @@STEP as many times as needed.
- Each topic ends with @@ENDTOPIC.
- The whole block ends with @@END. NOTHING after it.

HOW TO USE @@EVERY
- 2–4 per subject, realistic. The rankings I provide (or your own read of the PYQs) decide. True = appears every paper. Skip = omit.

HOW TO USE @@FORMULA
- Emit one @@FORMULA <latex> line per real formula. Example: @@FORMULA T(n) = 2T(n/2) + n . h of n = \\log_2 n . \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a} . \\alpha = \\frac{n}{m}
- Keep each formula on ONE line. No $$ delimiters. No display math. If there is no formula, omit the line.
- Do NOT put whole solution paragraphs here — only the formulas themselves.

WORKED EXAMPLE (stick to this pattern — do not improvise new structures)
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
@@ANSWER 2NF removes attributes dependent on only part of a composite key.
@@STEP Identify the primary key of the relation.
@@STEP Check each non-key attribute for partial and transitive dependencies.
@@CODE
STUDENT(id, name, course, course_name)
  -> 3NF: STUDENT(id, name) + COURSE(course, course_name)
@@ENDCODE
@@ENDQ
@@ENDTOPIC

QUALITY CHECK BEFORE YOU FINISH
- Every worked example shows EVERY step — no "similarly", no "obvious".
- Every question is a PYQ or is clearly labelled SYNTHESIZED.
- The schedule matches my effective hours honestly — nothing I couldn't actually do in that time.
- Nothing appears after @@END.

Your entire response = the STUDY_TRACKER block above, starting with @@STUDY_TRACKER v1 and ending with @@END. No prose. No prepending questions. No postscript. Stop at @@END.
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
