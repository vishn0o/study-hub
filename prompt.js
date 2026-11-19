/* The prompt users copy into Gemini / ChatGPT / any agent.
   Keep this in sync with the parser in app.js (marker names). */
const AGENT_PROMPT = `You are converting my study material into a "Study Hub" import file.

WHAT I WILL ATTACH
1. My syllabus or unit list.
2. My previous-year question papers (PYQs).
3. My study notes, slides or textbook extracts.

YOUR TASK
1. Split the syllabus into 5-15 topics (one per unit or chapter).
2. For each topic, write the key concepts, rules, formulas and memory hooks.
3. For each topic, include every relevant PYQ you were given, each with a complete answer and short solving steps taken from the notes.
4. Use the marks printed on the paper. If marks are missing, estimate them conservatively.
5. Produce ONE PDF. Put a short human-readable study guide first if you like, then the machine-readable DATA BLOCK at the very end.

FORMAT RULES (critical)
- Use plain ASCII only: straight quotes ( ' and " ), hyphens, no smart quotes, no curly apostrophes, no emoji.
- Put the DATA BLOCK at the very end, on its own page or pages, in a monospaced font.
- Add NO page numbers, headers, footers, watermarks or decorations on those pages.
- Do not hand-wrap marker lines; let the PDF wrap naturally.
- Every marker line starts at the beginning of a line with two @ signs and a space after the marker name.
- If a normal content line would start with two @ signs, add one leading space to it.
- Do not translate, rename or reorder the markers.
- Marks and ranks must be whole numbers.
- The DATA BLOCK is plain text inside your PDF, not a separate file. If you cannot emit a PDF, output the same text as a .txt / .md file and the user can upload that.

DATA BLOCK FORMAT
@@STUDY_TRACKER v1
@@SUBJECT <subject name>
@@COURSE <course code, optional>
@@EXAM <total marks in the paper, whole number>
@@TARGET <marks you want to reach, whole number>
@@DESC <one-line description>
@@EXAMDATE <exam date and time, e.g. 2026-05-02 or 2026-05-02T09:00, optional>
@@TOPIC <topic title>
@@MARKS <marks this topic is worth — number only>
@@EVERY <true if this topic appears on EVERY paper / is high ROI, otherwise false>
@@RANK <optional study priority: 1 = study first>
@@CONCEPT <one key fact, rule, formula or memory hook>
@@FORMULA <one formula in LaTeX math, e.g. T(n) = 2T(n/2) + n>
@@QUESTION <full question text, including paper and year if known>
@@QMARKS <marks for this question>
@@SOURCE <paper / year / question number, optional>
@@ANSWER <one paragraph of the model answer>
@@STEP <one short solving step or thing to remember>
@@CODE
<code, trace or diagram lines go here>
@@ENDCODE
@@ENDQ
@@ENDTOPIC
@@PLAN_BLUEPRINT
<Mark blueprint table rows, cells separated by |>
@@ENDPLAN_BLUEPRINT
@@PLAN_RANKING
<Rank | Topic | Marks | ROI rows>
@@ENDPLAN_RANKING
@@PLAN_SCHEDULE
<Hours | Block | Marks target rows>
@@ENDPLAN_SCHEDULE
@@CHECKLIST <optional final checklist item>
@@END

HOW TO USE @@EVERY
- Use the study guide / rankings provided (or your own judgment) for what appears on every paper.
- Mark high-priority topics that recur on every paper with @@EVERY true. Everything else gets @@EVERY false (or just omit it).
- Only the subjects that actually recur in the papers you attach should be marked true. 2-4 per subject is realistic, not all of them.

HOW TO USE @@FORMULA
- Emit one @@FORMULA <latex> line per formula the topic requires (recurrence relations, hash functions, tree height, complexity results, trigonometric/physics formulas, anything you'd write on a formula sheet).
- Use LaTeX math syntax: T(n) = 2T(n/2) + n ; x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} ; h = \log_2 n.
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
- The whole file ends with @@END.
- Only include the optional PLAN_* and CHECKLIST blocks if the material supports them.

TINY EXAMPLE
@@STUDY_TRACKER v1
@@SUBJECT Database Management Systems
@@COURSE CS-201
@@EXAM 50
@@TARGET 30
@@EXAMDATE 2026-05-02T09:00
@@DESC Normalization and ER modelling.
@@TOPIC Normalization
@@MARKS 6
@@RANK 1
@@EVERY true
@@CONCEPT 1NF requires atomic values only.
@@CONCEPT 2NF removes partial dependencies on a composite key.
@@CONCEPT 3NF removes transitive dependencies.
@@FORMULA X \to Y  and  Y \to Z  \Rightarrow  X \to Z
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
- Output exactly the same text as a .txt or .md file instead. I can upload that too.

QUALITY CHECK BEFORE YOU FINISH
- The DATA BLOCK parses as clean text, starts with @@STUDY_TRACKER and ends with @@END.
- Every topic has concepts and questions.
- The marks add up sensibly and match the paper.
- Nothing appears after @@END.
`;

const ATTACHMENTS = [
  'Syllabus / unit list (defines the topics)',
  'Previous-year question papers (the questions)',
  'Study notes / slides / textbook extracts (the answers and steps)',
  'Marking scheme or blueprint, if you have one',
  'Which topics appear on every paper, if you know — drives the @@EVERY flag',
];
