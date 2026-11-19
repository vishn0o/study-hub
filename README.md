# Study Hub

A general, offline study-progress tracker that turns a **study plan from any AI agent** into
topics, questions, answers, memory hooks, and a live progress + score prediction.

**Live repo:** https://github.com/vishn0o/study-hub
**Live demo (GitHub Pages):** https://vishn0o.github.io/study-hub/
**Download as ZIP:** https://github.com/vishn0o/study-hub/archive/refs/heads/main.zip

Everything runs in your browser. No server, no account, no uploads. Fonts are self-hosted,
PDF.js is vendored locally for PDF imports; text (.txt/.md/.json) imports are parsed directly.
**Installable as a PWA** — works offline, on the go, on flaky train wifi.

---

## Quick start

1. **Open `index.html`** (double-click it).
2. In Study Hub click **Agent prompt**. The app asks for your **exam date & time**, **effective study hours** and **target marks**, and generates a tailored prompt. The app automatically picks a timing mode (CRASH / STANDARD / DEEP) based on your hours.
3. Copy the prompt (or download it as `.txt`) and paste it into any chat LLM — Gemini, Claude, ChatGPT. Attach your syllabus + PYQs + notes in the same message.
4. The LLM prints one **marker block** (or, if it can, a `study_plan.txt/md/json` — whichever it gives you, grab it).
5. Save it as a file and drop it into Study Hub via **+ Add subject → Next: upload plan**. The app parses it offline.
6. Track progress, spaced-repetition reviews, formulas, exam countdown — everything is local; nothing ever leaves your machine.

(A ready-to-fork, system-style prompt lives in `generate-study-plan-prompt.txt` — same structure, meant for versioned customisation. The in-app **Agent prompt** is the fastest path.)

You can keep up to **3 subjects**. Each has its own progress and review history.

---

## Features

- **Confidence-weighted scoring.** Each question is rated *Got it / Fuzzy / Didn't get it*
  (Fuzzy counts as half marks). The predicted score is weighted by topic marks and confidence.
- **Self-test mode.** A top-bar toggle that hides answers until you reveal them —
  perfect for active recall before looking.
- **Spaced repetition.** SM-2 scheduler: *Got it* schedules reviews 1 → 3 → 7 → 15… days out,
  *Fuzzy* brings it back sooner, *Didn't get it* resets it (10-minute relearning interval).
  The **Reviews** badge shows what's due; open the queue to drill them.
- **Formulas with blind recall.** Topics with `@@FORMULA` lines list them in the topic drawer
  as pills. Each one is hidden by default (blurred) until you tap it — and there are "Reveal all" /
  "Hide all" buttons for whole topics. Formulas render with KaTeX (bundled locally). In the
  print sheet they appear as readable math.
- **Exam countdown + daily pace.** Set the exam **date and time** in *Edit subject* and get a
  banner with the remaining time and the questions/day you need to finish everything.
- **Print revision sheet.** One click prints a clean A4 sheet with every topic, key concepts,
  formulas, and full Q&A (with your confidence tags) for the active subject.
- **Progress page.** Open **Progress** in the top bar for a line chart of your predicted score
  over time, plus current score, peak, change and distance to target.
- **Three themes.** One click on the icon in the top bar cycles **Light → Dark → AMOLED (true black) → Light**.
- **Full editor** for topics, questions, answers, steps, code, marks and ranks.
- **Backup / restore** a JSON file. **Built-in DSA sample** to start.

---

## What the agent must produce

Ideally the agent emits a line-marker data block — usually as inline plain text you save as
`.txt` or `.md`, sometimes as JSON, occasionally as a PDF (if your model supports it).
The app also accepts an ordinary, human-readable study-guide PDF: it detects unit headings,
key facts, formula sets and solved questions and turns them into a subject. The full spec
for the marker format is in the in-app prompt, but the core markers are:

```
@@STUDY_TRACKER v1
@@SUBJECT <subject name>
@@COURSE <course code, optional>
@@EXAM <total marks>
@@TARGET <target marks>
@@DESC <one-line description>
@@EXAMDATE <YYYY-MM-DD or YYYY-MM-DDTHH:MM, optional>

@@TOPIC <topic title>
@@MARKS <marks for this topic>
@@EVERY <true if topic repeats on every paper, else false>
@@RANK <study priority, 1 = first>

@@CONCEPT <key fact / rule / formula / memory hook>
@@FORMULA <one LaTeX math formula per line>

@@QUESTION <full question text>
@@QMARKS <marks>
@@SOURCE <paper / year / question number, optional>
@@ANSWER <one answer paragraph>
@@STEP <one solving step>
@@CODE
<code, trace or diagram>
@@ENDCODE
@@ENDQ

@@PLAN_BLUEPRINT
<rows separated by |>
@@ENDPLAN_BLUEPRINT
@@PLAN_RANKING
...
@@ENDPLAN_RANKING
@@PLAN_SCHEDULE
...
@@ENDPLAN_SCHEDULE
@@CHECKLIST <optional checklist item>
@@END
```

Repeat `@@CONCEPT`, `@@ANSWER`, `@@STEP`, and whole `@@QUESTION … @@ENDQ` blocks as needed.

### Formatting rules for the agent

- Plain ASCII, straight quotes only. No smart quotes, no emoji.
- Data block at the very end, monospaced, on its own page(s).
- No page numbers, headers, footers or decorations on those pages.
- One marker per line; do not hand-wrap.
- If a content line starts with `@@`, add one leading space.

If the agent prints the block inline, save it as `.txt` or `.md` — that's all the app needs. A `.json` subject file is also accepted.

### KaTeX

Inline math formulas are supported with `@@FORMULA <latex>`. They render via KaTeX (bundled locally in `vendor/katex/`).
Write plain LaTeX math — no surrounding `$$` delimiters. Example: `@@FORMULA rear = (rear + 1) \\bmod capacity`.

---

---

## Notes

- **Storage**: browser `localStorage`, key `study-hub-v1` (data) and `study-hub-prefs` (theme).
  Clearing site data deletes them — use **Export** for backups.
- **Fonts**: self-hosted woff2 files in `fonts/` (DM Sans, JetBrains Mono, latin + latin-ext, variable).
- **PDF parsing**: PDF.js bundled locally in `vendor/`. Under `file://` it falls back to
  main-thread parsing.
- **KaTeX**: KaTeX bundled locally in `vendor/katex/` for formula rendering. Zero network.
- **Regenerating the DSA sample**: run `node regenerate-sample.js` inside this folder.
