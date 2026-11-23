/* Study Hub — text parsing: marker block, JSON, generic study guides, heuristics, PDF text extraction. */
'use strict';

function normalizeText(raw) {
  let t = String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2013|\u2014/g, '-');
  // Strip a single leading/trailing code fence (```lang\n … \n```) that agents love to add
  t = t.replace(/^\s*```[^\n]*\n/, '').replace(/\n```\s*$/, '');
  return t;
}

function parseAnyText(raw, fallbackName) {
  const text = normalizeText(raw);
  if (/@@\s*STUDY_TRACKER/i.test(text) || /^@@\s*TOPIC/im.test(text)) {
    const parsed = parseMarkers(text);
    if (parsed.topics.length) return parsed;
  }
  // JSON embedded in text
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      if (obj && (Array.isArray(obj.topics) || obj.subject)) return normalizeSubject(obj);
    } catch (e) { /* fall through */ }
  }
  // ordinary, human-readable study guides (agents often ignore the marker format)
  const doc = parseDocument(text, fallbackName);
  if (doc && doc.topics.length) return doc;
  // simple heading fallback
  const h = parseHeuristic(text, fallbackName);
  if (h.topics.length) return h;
  throw new Error('No topics, questions or headings could be found in that file. Upload a study guide, or the plan your agent produced with the Study Hub prompt (.txt, .md, .json or .pdf).');
}

function parseMarkers(text) {
  const lines = text.split('\n').map(l => l.replace(/^@\s*@/, '@@').replace(/\s+$/, ''));
  const subj = {
    name: '', code: '', examTotal: 100, target: null, description: '',
    topics: [], plan: { blueprint: null, ranking: null, schedule: null, checklist: null },
  };
  let topic = null, question = null, mode = null;
  let codeLines = [];
  let planKey = null, planRows = [];

  const truthy = (v) => /^(true|yes|1|on)$/i.test(String(v || '').trim());

  const pushQ = () => {
    if (question && topic) {
      if (!question.question) question.question = 'Question ' + (topic.questions.length + 1);
      topic.questions.push(question);
    }
    question = null; mode = null; codeLines = [];
  };
  const pushT = () => {
    if (topic) { if (!topic.concepts) topic.concepts = []; subj.topics.push(topic); }
    topic = null; mode = null;
  };
  const appendCont = (val) => {
    if (!val) return;
    if (mode === 'concept' && topic && topic.concepts.length) topic.concepts[topic.concepts.length - 1] += ' ' + val;
    else if (mode === 'question' && question) question.question += ' ' + val;
    else if (mode === 'answer' && question && question.answer.length) question.answer[question.answer.length - 1] += ' ' + val;
    else if (mode === 'step' && question && question.steps.length) question.steps[question.steps.length - 1] += ' ' + val;
    else if (mode === 'source' && question) question.source = (question.source ? question.source + ' ' : '') + val;
    else if (mode === 'desc') subj.description = (subj.description ? subj.description + ' ' : '') + val;
    else if (mode === 'subject') subj.name = (subj.name ? subj.name + ' ' : '') + val;
  };
  const addPlanRow = (val) => {
    if (!planKey) return;
    const cells = val.split('|').map(x => x.trim());
    planRows.push(cells.length === 1 ? cells[0] : cells);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const probe = line.trim();
    if (mode === 'code') {
      if (/^@@ENDCODE\b/i.test(probe)) {
        question.code = (question.code ? question.code + '\n' : '') + codeLines.join('\n');
        codeLines = []; mode = null;
        continue;
      }
      if (!/^@@(ENDQ|ENDTOPIC|END)\b/i.test(probe)) {
        codeLines.push(line);
        continue;
      }
      question.code = (question.code ? question.code + '\n' : '') + codeLines.join('\n');
      codeLines = []; mode = null;
    }
    const m = probe.match(/^@@([A-Za-z_]+)\s?(.*)$/);
    if (!m) {
      if (mode === 'plan') addPlanRow(probe);
      else appendCont(probe);
      continue;
    }
    const key = m[1].toUpperCase();
    const val = m[2].trim();

    switch (key) {
      case 'STUDY_TRACKER': mode = null; break;
      case 'SUBJECT': subj.name = val; mode = 'subject'; break;
      case 'COURSE': subj.code = val; mode = null; break;
      case 'EXAM': subj.examTotal = num(val, 100); mode = null; break;
      case 'TARGET': subj.target = num(val, null); mode = null; break;
      case 'DESC': subj.description = val; mode = 'desc'; break;
      case 'EXAMDATE': subj.examDate = val; mode = null; break;
      case 'TOPIC':
        pushQ(); pushT();
        topic = { title: val, marks: 1, marksLabel: '', everyPaper: false, rank: subj.topics.length + 1, concepts: [], formulas: [], questions: [] };
        mode = null; break;
      case 'MARKS': if (topic) {
        // raw string kept for the label, leading number used for scoring; "every paper" inside marks string also flags it
        topic.marksLabel = String(val || '').trim();
        const everyFromStr = /every\s*paper/i.test(topic.marksLabel);
        topic.everyPaper = topic.everyPaper || everyFromStr;
        topic.marksLabel = everyFromStr
          ? topic.marksLabel.replace(/\s*\(?\s*every\s*paper\s*\)?\s*/gi, ' ').replace(/\s+/g, ' ').trim()
          : topic.marksLabel;
        topic.marks = leadingMarks(val);
        mode = null;
      } break;
      case 'EVERY': if (topic) { topic.everyPaper = truthy(val); } mode = null; break;
      case 'RANK': if (topic) { topic.rank = num(val, topic.rank); mode = null; } break;
      case 'CONCEPT': if (topic) { topic.concepts.push(val); mode = 'concept'; } break;
      case 'FORMULA': if (topic) { topic.formulas.push(val); mode = null; } break;
      case 'QUESTION':
        pushQ();
        question = { question: val, marks: 1, source: '', answer: [], steps: [], code: '' };
        mode = 'question'; break;
      case 'QMARKS': if (question) { question.marks = num(val, 1); mode = null; } break;
      case 'SOURCE': if (question) { question.source = val; mode = 'source'; } break;
      case 'ANSWER': if (question) { question.answer.push(val); mode = 'answer'; } break;
      case 'STEP': if (question) { question.steps.push(val); mode = 'step'; } break;
      case 'CODE': if (question) { mode = 'code'; codeLines = []; } break;
      case 'ENDCODE': if (question) { question.code = (question.code ? question.code + '\n' : '') + codeLines.join('\n'); codeLines = []; mode = null; } break;
      case 'ENDQ': pushQ(); break;
      case 'ENDTOPIC': pushQ(); pushT(); break;
      case 'PLAN_BLUEPRINT': planKey = 'blueprint'; planRows = []; mode = 'plan'; break;
      case 'ENDPLAN_BLUEPRINT': subj.plan.blueprint = planRows; planKey = null; mode = null; break;
      case 'PLAN_RANKING': planKey = 'ranking'; planRows = []; mode = 'plan'; break;
      case 'ENDPLAN_RANKING': subj.plan.ranking = planRows; planKey = null; mode = null; break;
      case 'PLAN_SCHEDULE': planKey = 'schedule'; planRows = []; mode = 'plan'; break;
      case 'ENDPLAN_SCHEDULE': subj.plan.schedule = planRows; planKey = null; mode = null; break;
      case 'CHECKLIST':
        if (!subj.plan.checklist) subj.plan.checklist = [];
        subj.plan.checklist.push(val); mode = null; break;
      case 'END': pushQ(); pushT(); i = lines.length; break;
      default: mode = null;
    }
  }
  pushQ(); pushT();
  if (!subj.topics.length) throw new Error('The data block had no @@TOPIC sections.');
  if (!subj.target) subj.target = Math.round(subj.examTotal * 0.6);
  subj.topics.forEach((t, i) => { if (!t.rank) t.rank = i + 1; });
  const out = normalizeSubject(subj);
  out.examDate = normExamDate(subj.examDate);
  return out;
}

/* ---------------- generic document importer ----------------
   Agents often ignore the marker format and return an ordinary,
   human-readable study guide PDF instead. This reads the structure
   such documents really have: unit/part headings, "at a glance"
   boxes, key-fact lists, formula sets and solved questions. */
function parseDocument(raw, fallbackName) {
  const text = normalizeText(raw);
  const rawLines = text.split('\n').map(l => l.replace(/\s+$/, ''));

  // Running headers/footers ("... Study Guide 12") repeat on every page; drop them.
  const keyOf = (l) => l.trim().replace(/[\s|\-–]+(?:\d{1,4})\s*$/, '').toLowerCase();
  const hasPageNo = (l) => /[\s|\-–]\d{1,4}\s*$/.test(l.trim());
  const freq = new Map();
  for (const l of rawLines) {
    if (!hasPageNo(l)) continue;
    const k = keyOf(l);
    if (k) freq.set(k, (freq.get(k) || 0) + 1);
  }
  const lines = rawLines.filter(l => {
    const k = keyOf(l);
    // Only long, repeated lines that end in a page number are running
    // headers/footers. Recurring section titles ("Key facts...") stay.
    return !hasPageNo(l) || !k || k.length < 20 || (freq.get(k) || 0) < 3;
  });
  const joined = lines.join('\n');
  const grab = (re) => { const m = joined.match(re); return m ? m[1].trim() : ''; };

  const appendText = (obj, key, line) => {
    const t = String(line).trim().replace(/^[-*•]\s*/, '');
    if (t) obj[key] = (obj[key] ? obj[key] + ' ' : '') + t;
  };
  const appendParagraph = (arr, line) => {
    const t = String(line).trim().replace(/^[-*•]\s*/, '');
    if (!t) return;
    const prev = arr[arr.length - 1];
    if (prev && !/[.!?:;)\]}"']$/.test(prev) && !/^[-*•]\s/.test(String(line))) {
      arr[arr.length - 1] = prev + ' ' + t;
    } else arr.push(t);
  };
  const isSectionLine = (l) => /^(?:AT\s+A\s+GLANCE|KEY\s+FACTS?|KEY\s+CONCEPTS?|FORMULA\s*SET|FORMULAS?|CIRCUIT\s+PICTURES?|SOLVED\s+QUESTIONS?|DIAGRAM|WORKED\s+STEPS?|MODEL\s+ANSWER|ANSWERS?|HOW\s+TO|EXAM\s+SNAPSHOT|BOOK\s+MAP|HIGH-YIELD|THE\s+\d+\s*-\s*HOUR\s+PLAN|CONVENTIONS)\b/i.test(l.trim());
  const guessTitle = () => {
    const first = lines.slice(0, 8).find(l => l.trim());
    if (first && /^#\s+\S/.test(first.trim())) {
      return first.trim().replace(/^#\s+/, '').replace(/\s*#+\s*$/, '').trim();
    }
    let title = '';
    for (const rawLine of lines.slice(0, 8)) {
      const t = rawLine.trim().replace(/^#{1,6}\s+/, '');
      if (!t) continue;
      if (/^(?:chapter|unit|topic|part|section|module)\s+(?:\d+|[ivxlcdm]+)\b/i.test(t)) { title = ''; break; }
      if (!title) {
        if (t.length > 90 || /:/.test(t)) { title = t.replace(/[ \t]+[:\-].*$/, ''); break; }
        title = t;
      } else {
        if (t.length > 90 || /:/.test(t) || /\b(guide|handbook|notes|slides|syllabus|paper|plan)\b/i.test(t)) break;
        title += ' ' + t;
      }
    }
    return title.trim().replace(/\s+(?:END[- ]SEMESTER|EXAM\s+STRATEGY|STRATEGY|STUDY\s+PLAN|SOLVED\s+PYQ\s+BANK|COMPLETE\s+STUDY\s+GUIDE)\b.*$/i, '').trim();
  };

  // ----- subject metadata -----
  const meta = { name: '', code: '', examTotal: 0, target: 0, examDate: '' };
  meta.examDate = grab(/(?:^|\n|\|\s*)Exam\s*[:\-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+)/i)
               || grab(/Exam\s*date\s*\/\s*time\s+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+)/i);
  meta.examDate = normExamDate(meta.examDate);
  const totalStr = grab(/(?:^|\n|\|\s*)Total\s*[:\-]\s*(\d+)\s*marks?/i) || grab(/Total\s*marks\s+(\d+)/i);
  meta.examTotal = totalStr ? num(totalStr, 0) : 0;
  const targetStr = grab(/(?:^|\n|\|\s*)Target\s*[:\-]\s*([0-9]+)/i) || grab(/Your\s*target\s+(\d+)/i);
  meta.target = targetStr ? num(targetStr, 0) : 0;
  // "Target: 30+ / 50 Marks" gives both numbers at once.
  const tm = joined.match(/Target\s*[:\-]\s*(\d+)\s*\+\s*\/\s*(\d+)\s*Marks?/i);
  if (tm) { meta.target = num(tm[1], meta.target); meta.examTotal = num(tm[2], meta.examTotal); }
  meta.name = grab(/(?:^|\n)Subject\s+([^\n|]+)/i);
  meta.code = grab(/(?:^|\n)Course\s*code\s+([^\n|]+)/i);
  if (!meta.code) {
    const metaLine = lines.find(l => /(?:^|\|)\s*Exam\s*:/i.test(l));
    if (metaLine) {
      const part = metaLine.split('|').map(s => s.trim()).find(s => /^[A-Za-z]{2,}\s*\d/.test(s));
      if (part) meta.code = part;
    }
  }
  if (!meta.code) {
    const cm = joined.match(/\(([A-Z]{2,}\s*\d{4}(?:\s*\/\s*[A-Z]{2,}\s*\d{4})*)\)/);
    if (cm) meta.code = cm[1].replace(/\s*\/\s*/g, ' / ');
  }
  if (!meta.name) meta.name = guessTitle();

  // ----- locate unit headings (PART/UNIT/CHAPTER or markdown) -----
  const partRe = /^PART\s+(?:\d+|[IVXLCDM]+)\s*[:.\-]?\s*(.*)$/i;
  const unitRe = /^(?:UNIT|CHAPTER|MODULE|SECTION|TOPIC)\s+(?:\d+|[IVXLCDM]+)\s*[:.\-]?\s*(.*)$/i;
  const mdRe = /^#{1,4}\s+(.+)$/;
  const candidates = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    const m = t.match(partRe) || t.match(unitRe) || t.match(mdRe);
    if (!m) return;
    // A "Topic 1: ..." heading is a real section; "Topic 1 ... 12.3 M 8.5 hrs"
    // is a weightage row, and "Unit VII - Topic:" inside a summary table isn't one.
    const labeled = !!t.match(partRe);
    const sep = (t.match(/^(?:UNIT|CHAPTER|MODULE|SECTION|TOPIC|PART)\s+(?:\d+|[IVXLCDM]+)\s*([:.\-]?)\s*/i) || [])[1] || '';
    const pri = (labeled || sep === ':' || sep === '.') ? 3 : 1;
    const title = (m[1] || '').trim();
    if (title.length > 140) return;
    if (/\b\d+(?:\.\d+)?\s*M\b/i.test(title) || /\bhrs\b/i.test(title) || /checkpoint|mandatory|prerequisite/i.test(title)) return;
    candidates.push({ i, pri });
  });
  if (!candidates.length) return null;
  const bestPri = Math.max(...candidates.map(c => c.pri));
  const heads = candidates.filter(c => c.pri === bestPri).map(c => c.i);
  if (!heads.length) return null;
  const headingRe = (l) => partRe.test(l.trim()) || unitRe.test(l.trim()) || mdRe.test(l.trim());
  // A real question header has marks, punctuation or a decent amount of
  // text after the number — a bare "Q1" in a circuit diagram is not one.
  const isQ = (l) => {
    const m = l.trim().match(/^(?:Practice\s+)?Q(?:uestion)?\s*\.?\s*\d+\b(.*)$/i);
    if (!m) return false;
    const rest = m[1].trim();
    if (/[\[(]\s*\d+\s*marks?\s*[\])]/i.test(rest)) return true;
    if (/^\[[^\]]*\b\d+(?:\.\d+)?\s*marks?\b[^\]]*\]/i.test(rest)) return true;
    if (/^[A-Za-z"'\d]/.test(rest) && rest.length >= 12) return true;
    return /^[:.\-]\s*[A-Za-z]/.test(rest);
  };

  const topics = [];
  for (let h = 0; h < heads.length; h++) {
    const start = heads[h];
    const end = h + 1 < heads.length ? heads[h + 1] : lines.length;
    const inline = lines[start].trim().match(partRe) || lines[start].trim().match(unitRe) || lines[start].trim().match(mdRe);
    let title = inline && inline[1] ? inline[1].trim() : '';
    let cursor = start + 1;
    if (!title) {
      while (cursor < end && !lines[cursor].trim()) cursor++;
      if (cursor < end && !isSectionLine(lines[cursor])) {
        title = lines[cursor].trim();
        cursor++;
      }
    }
    if (!title) continue;
    // Wrapped headings like "Topic 3: ... (Unit II" / "— 9.3 Marks)".
    while (cursor < end && title.split('(').length > title.split(')').length
           && /^[—\-–]\s*[\d.]+\s*Marks?\b/i.test(lines[cursor].trim())) {
      title += ' ' + lines[cursor].trim();
      cursor++;
    }
    const tm = title.match(/\(\s*(?:Unit\s+[IVXLCDM\d]+\s*[—\-–]\s*)?([\d.]+)\s*Marks?\b/i);
    let headingMarks = 0;
    if (tm) {
      headingMarks = num(tm[1], 0);
      title = title.replace(/\([^)]*\)/g, '').trim();
    }
    title = title.replace(/\([^)]*$/, '').trim();

    const topic = {
      title, marks: headingMarks || 1, marksLabel: headingMarks ? String(headingMarks) : '',
      everyPaper: /guaranteed|every\s*paper/i.test(lines[start]),
      rank: h + 1, concepts: [], formulas: [], questions: []
    };
    let mode = null, question = null, inSolved = false;
    const flushQ = () => {
      if (question) {
        if (!question.question.trim()) question.question = 'Question ' + (topic.questions.length + 1);
        topic.questions.push(question);
        question = null;
      }
    };

    for (let i = cursor; i < end; i++) {
      const t = lines[i].trim();
      if (!t) continue;

      // Diagram/figure blocks are full of bare labels ("Q1", "VDD") that
      // look like questions or formulas — ignore them until real content.
      if (mode === 'ignore') {
        if (isQ(t) || headingRe(t) || /^(?:MODEL\s+ANSWER|WORKED\s+STEPS?|AT\s+A\s+GLANCE|KEY\s+FACTS?|FORMULA\s*SET|SOLVED\s+QUESTIONS?)\b/i.test(t)) mode = null;
        else continue;
      }

      if (isQ(t)) {
        flushQ();
        const rest = t.replace(/^(?:Practice\s+)?Q(?:uestion)?\s*\.?\s*\d+\s*/i, '');
        let qtext = rest;
        let source = '';
        const bracket = rest.match(/^\[([^\]]+)\]/);
        let bracketMarks = null;
        if (bracket) {
          qtext = rest.slice(bracket[0].length);
          bracketMarks = bracket[1].match(/\b(\d+)\s*marks?\b/i);
          if (!/^\s*\d+(?:\.\d+)?\s*marks?\s*$/i.test(bracket[1])) {
            source = bracket[1].replace(/^PYQ:\s*/i, '').replace(/[\-—–]\s*\d+(?:\.\d+)?\s*marks?\s*$/i, '').trim();
          }
        }
        const mm = qtext.match(/\b(\d+)\s*marks?\b/i) || bracketMarks;
        if (mm) qtext = qtext.replace(mm[0], ' ');
        if (!source) {
          const sm = qtext.match(/\b(?:[A-Z]{2,}\s*\d{4}\s*Q[\w\/\s-]*|(?:19|20)\d{2}\s*Q[\w\/\s-]*|SYNTHESIZED)\b/i);
          if (sm) { source = sm[0].trim(); qtext = qtext.replace(sm[0], ' '); }
        }
        qtext = qtext.replace(/^[\[\]:\-—–\s]+|[\[\]:\-—–\s]+$/g, '').replace(/\s+/g, ' ').trim();
        question = { question: qtext, marks: mm ? num(mm[1], 1) : 1, source, answer: [], steps: [], code: '' };
        mode = 'question';
        continue;
      }
      const am = t.match(/^(?:(?:MODEL\s+ANSWER|ANSWERS?|SOLUTION|STEP[- ]BY[- ]STEP\s+ANSWER))\b[:.]?\s*(.*)$/i);
      if (am) {
        if (question) { mode = 'answer'; if (am[1].trim()) appendParagraph(question.answer, am[1]); }
        continue;
      }
      if (/^(WORKED\s+STEPS?|WORKED\s+SOLUTION|WORKING)\b[:.]?\s*$/i.test(t)) { if (question) mode = 'steps'; continue; }
      if (/^AT\s+A\s+GLANCE\b/i.test(t)) { mode = 'glance'; continue; }
      if (/^(?:\d+(?:\.\d+)?\s*)?(?:KEY\s+FACTS?|KEY\s+CONCEPTS?|CORE\s+THEORY|KEY\s+EQUATIONS?|THEORY\s*&\s*KEY\s+EQUATIONS?)\b/i.test(t)) { mode = 'concept'; continue; }
      if (/^(?:\d+(?:\.\d+)?\s*)?PRACTICE\s+QUESTIONS?\b/i.test(t)) { inSolved = true; mode = null; continue; }
      if (/^(FORMULA\s*SET|FORMULAS?|FORMULAE)\b/i.test(t)) { mode = 'formula'; continue; }
      if (/^SOLVED\s+QUESTIONS?\b/i.test(t)) { inSolved = true; mode = null; continue; }
      if (/^(?:CIRCUIT\s+PICTURES?|FIGURES?|DIAGRAMS?|TABLES?|DIAGRAM\s*\/\s*TRACE)\b/i.test(t)) { mode = 'ignore'; continue; }
      if (headingRe(t)) break;

      if (inSolved && !mode && /^\d+[.)]\s+\S/.test(t)
          && (/[?？]|\b(?:what|why|how|find|determine|calculate|explain|design|prove|compute|draw|derive)\b/i.test(t) || /\b\d+\s*marks?\b/i.test(t))) {
        flushQ();
        const rest = t.replace(/^\d+[.)]\s+/, '');
        const mm = rest.match(/[\[(]\s*(\d+)\s*marks?\s*[\])]/i) || rest.match(/\b(\d+)\s*marks?\b/i);
        question = {
          question: mm ? rest.replace(mm[0], ' ').replace(/\s+/g, ' ').trim() : rest,
          marks: mm ? num(mm[1], 1) : 1, source: '', answer: [], steps: [], code: ''
        };
        mode = 'question';
        continue;
      }

      if (mode === 'glance') {
        const w = t.match(/Exam\s*weight\s*[:\-]\s*(\d+)\s*marks?/i);
        if (w) { topic.marks = num(w[1], 1); topic.marksLabel = String(w[1]); }
        const r = t.match(/ROI\s*rank\s*[:\-]\s*(\d+)/i);
        if (r) topic.rank = num(r[1], topic.rank);
        if (/Appears\s*on\s*every\s*paper\s*[:\-]\s*(YES|TRUE|1)/i.test(t)) topic.everyPaper = true;
        const tg = t.match(/Target\s*[:\-]\s*(\d+)/i);
        if (tg && !meta.target) meta.target = num(tg[1], 0);
      } else if (mode === 'concept') {
        const cm = t.match(/^\d+(?:\.\d+)?[.)]\s+(.*)$/) || t.match(/^[-*•]\s+(.*)$/);
        if (cm) topic.concepts.push(cm[1].trim());
        else appendParagraph(topic.concepts, t);
      } else if (mode === 'formula') {
        topic.formulas.push(t.replace(/^\s*[-*•]\s*/, ''));
      } else if (mode === 'question' && question) {
        appendText(question, 'question', t);
      } else if (mode === 'answer' && question) {
        if (/^\d+[.)]\s+/.test(t)) {
          mode = 'steps';
          question.steps.push(t.replace(/^\d+[.)]\s+/, ''));
        } else appendParagraph(question.answer, t);
      } else if (mode === 'steps' && question) {
        if (/^\d+[.)]\s+/.test(t)) question.steps.push(t.replace(/^\d+[.)]\s+/, ''));
        else if (question.steps.length) question.steps[question.steps.length - 1] += ' ' + t;
        else question.steps.push(t);
      }
    }
    flushQ();
    if (topic.marks === 1) {
      const row = joined.match(new RegExp('Topic\\s*' + (h + 1) + '\\b[^\\n]*?([\\d.]+)\\s*M\\*?\\s+[\\d.]+\\s*hrs', 'i'));
      if (row) { topic.marks = num(row[1], 1); topic.marksLabel = row[1]; }
      else {
        const qm = topic.questions.reduce((a, q) => a + q.marks, 0);
        if (qm > 1) topic.marks = qm;
      }
    }
    topics.push(topic);
  }

  if (!topics.length) return null;

  // Study-plan reference tables. Most guides print a mark blueprint, an ROI
  // ranking and a hour-by-hour schedule even when they omit the @@PLAN markers.
  const isStop = (l) => isSectionLine(l) || /^(?:FINAL\s+LESSON|PRIORITY\s+TOPIC|RANK\s+TOPIC|UNIT\s+UNIT|HOURS\s+BLOCK|THE\s+\d+\s*-?\s*HOUR\s+PLAN|\*|COUNTDOWN EXECUTION PLAN)/i.test(l.trim());
  const leadNum = (s) => { const m = s.match(/^(\d+)/); return m ? +m[1] : null; };
  const tableAfter = (headerRe, sequential) => {
    const hi = lines.findIndex(l => headerRe.test(l.trim()));
    if (hi < 0) return null;
    const rows = [lines[hi].trim()];
    for (let i = hi + 1; i < lines.length && rows.length < 15; i++) {
      const t = lines[i].trim();
      if (!t || isStop(t)) break;
      const n = leadNum(t), prev = leadNum(rows[rows.length - 1]);
      const newRow = sequential
        ? (n !== null && (prev === null || n === prev + 1))
        : /^(?:\d+[\s\-.)]|[IVXLCDM]+\s|Topic\s*\d)/i.test(t);
      if (newRow) rows.push(t);
      else if (rows.length > 1) rows[rows.length - 1] += ' ' + t;
    }
    return rows.length > 2 ? rows : null;
  };
  const bulletsAfter = (headerRe) => {
    const hi = lines.findIndex(l => headerRe.test(l.trim()));
    if (hi < 0) return null;
    const rows = [];
    for (let i = hi + 1; i < lines.length && rows.length < 12; i++) {
      const t = lines[i].trim();
      if (!t || isStop(t)) break;
      if (/^(?:[•\-*]|\d+[.)])\s+/.test(t)) rows.push(t.replace(/^[•\-*]\s+/, ''));
      else if (rows.length && !/^(?:Topic\s*\d+\s*:|Practice\s*Q|Step-by-Step|FINAL\s+LESSON|PRIORITY\s+TOPIC|RANK\s+TOPIC|\d+(?:\.\d+)?\s+[A-Z])/i.test(t)) {
        rows[rows.length - 1] += ' ' + t;
      } else break;
    }
    return rows.length ? rows : null;
  };
  const linesAfter = (headerRe) => {
    const hi = lines.findIndex(l => headerRe.test(l.trim()));
    if (hi < 0) return null;
    const rows = [];
    for (let i = hi + 1; i < lines.length && rows.length < 12; i++) {
      const t = lines[i].trim();
      if (!t || isStop(t)) break;
      rows.push(t);
    }
    return rows.length ? rows : null;
  };
  // PDF rows arrive as single lines; rebuild the columns for the rendered table.
  const shapeTable = (rows) => {
    if (!rows) return null;
    const head = rows[0];
    let headers, parse;
    if (/^Unit\s+Unit topic\b/i.test(head)) {
      headers = ['Unit', 'Topic', 'Weight'];
      parse = (s) => { const m = s.match(/^([IVXLCDM]+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*marks?$/i); return m ? [m[1], m[2], m[3]] : null; };
    } else if (/^Priority\s+Topic\b/i.test(head)) {
      headers = ['Priority', 'Topic', 'Unit', 'Avg. marks'];
      parse = (s) => {
        const m = s.match(/^Topic\s*(\d+)\s+(.+?)\s+(Unit\s+[IVXLCDM]+)\s+((?:\d+(?:\.\d+)?\s*M\*?\s*)+)([\d.]+\s*hrs)$/i);
        if (!m) return null;
        const marks = m[4].match(/\d+(?:\.\d+)?\s*M\*?/gi) || [];
        return ['Topic ' + m[1], m[2], m[3], marks.length ? marks[marks.length - 1].replace(/\s*M\*?$/i, '') : ''];
      };
    } else if (/^Rank\s+Topic\s+Marks\b/i.test(head)) {
      headers = ['Rank', 'Topic', 'Marks', 'Why it matters'];
      parse = (s) => { const m = s.match(/^(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(.+)$/); return m ? [m[1], m[2], m[3], m[4]] : null; };
    } else if (/^Rank\s+Topic\s+Title\b/i.test(head)) {
      headers = ['Rank', 'Topic', 'Unit', 'Avg. marks'];
      parse = (s) => {
        const m = s.match(/^(\d+)\s+(.+?)\s+(Unit\s+[IVXLCDM]+)\s+((?:\d+(?:\.\d+)?\s*M\s*)+)(.+)$/i);
        if (!m) return null;
        const nums = m[4].match(/\d+(?:\.\d+)?/g) || [];
        return [m[1], m[2], m[3], nums[0] || ''];
      };
    } else if (/^Hours\s+Block\b/i.test(head)) {
      headers = ['Hours', 'Block / Activity', 'Marks target'];
      parse = (s) => { const m = s.match(/^(\(?[^\s(]+\)?|[\d\-–]+)\s+(.+?)\s+(\S+)$/); return m ? [m[1], m[2], m[3]] : null; };
    } else return null;
    const out = [headers];
    rows.slice(1).forEach(r => {
      const cells = parse(r) || [r];
      while (cells.length < headers.length) cells.push('');
      out.push(cells.slice(0, headers.length));
    });
    return out;
  };
  const scheduleRows = tableAfter(/^Hours\s+Block\b/i);
  const countdown = () => {
    const b = bulletsAfter(/Countdown Execution Plan/i);
    if (!b) return null;
    return [['Hours', 'Block / Activity'], ...b.map(s => {
      const i = s.indexOf(':');
      return i > 0 ? [s.slice(0, i), s.slice(i + 1).trim()] : [s, ''];
    })];
  };
  const plan = {
    blueprint: shapeTable(tableAfter(/^(?:Unit\s+Unit topic|Priority\s+Topic)\b/i)),
    ranking: shapeTable(tableAfter(/^Rank\s+Topic\b/i, true)),
    schedule: scheduleRows ? shapeTable(scheduleRows) : countdown(),
    checklist: linesAfter(/^(?:FINAL\s+)?CHECKLIST\b|HOW TO STUDY EACH UNIT|HOW TO SCORE PARTIAL MARKS/i)
              || bulletsAfter(/Countdown Execution Plan/i),
  };

  return normalizeSubject({
    name: meta.name || fallbackName || 'Imported subject',
    code: meta.code || '',
    examTotal: meta.examTotal || 100,
    target: meta.target || Math.round((meta.examTotal || 100) * 0.6),
    examDate: meta.examDate || '',
    topics,
    plan,
  });
}

function parseHeuristic(text, fallbackName) {
  const lines = text.split('\n');
  const subj = { name: fallbackName || 'Imported subject', examTotal: 100, target: 60, topics: [] };
  let topic = null, question = null;
  const isTopic = (l) => /^(?:#{1,3}\s+|(?:unit|topic|chapter|module)\s*\d*[.:)\-]\s*)/i.test(l);
  const isQ = (l) => /^(?:q(?:uestion)?\s*\.?\s*\d*[.:)\-]?\s+|q\d+[.:)]\s*)/i.test(l.trim());
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    if (isTopic(l) && !isQ(l)) {
      if (question && topic) { topic.questions.push(question); question = null; }
      if (topic) subj.topics.push(topic);
      topic = { title: l.replace(/^#{1,3}\s+/, '').replace(/^(?:unit|topic|chapter|module)\s*\d*[.:)\-]\s*/i, ''), marks: 1, rank: subj.topics.length + 1, concepts: [], questions: [] };
    } else if (topic && isQ(l)) {
      if (question) topic.questions.push(question);
      question = { question: l.replace(/^q(?:uestion)?\s*\.?\s*\d*[.:)\-]?\s*/i, '').trim(), marks: 1, source: '', answer: [], steps: [], code: '' };
    } else if (question) {
      question.answer.push(l.replace(/^[-*•]\s*/, ''));
    } else if (topic) {
      topic.concepts.push(l.replace(/^[-*•]\s*/, ''));
    }
  }
  if (question && topic) topic.questions.push(question);
  if (topic) subj.topics.push(topic);
  return normalizeSubject(subj);
}

/* ---------------- PDF extraction ---------------- */
async function pdfToText(file) {
  const buf = await file.arrayBuffer();
  await ensurePdfJs();
  if (!window.pdfjsLib) throw new Error('PDF library did not load.');
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const allRows = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    allRows.push(...reconstructRows(tc));
  }
  return rowsToText(allRows);
}

function reconstructRows(tc) {
  const items = (tc.items || []).filter(it => it && typeof it.str === 'string' && it.str.length);
  const rows = [];
  let cur = null;
  for (const it of items) {
    const x = it.transform ? it.transform[4] : 0;
    const y = it.transform ? it.transform[5] : 0;
    const size = Math.abs(it.height || (it.transform ? it.transform[3] : 10)) || 10;
    const tol = Math.max(3, size * 0.4);
    if (!cur || Math.abs(cur.y - y) > tol) {
      cur = { y, size, items: [] };
      rows.push(cur);
    }
    cur.items.push({ x, str: it.str, w: it.width || 0, size });
  }
  return rows.map(row => {
    row.items.sort((a, b) => a.x - b.x);
    let text = '';
    for (let i = 0; i < row.items.length; i++) {
      const it = row.items[i];
      if (i > 0) {
        const prev = row.items[i - 1];
        const gap = it.x - (prev.x + prev.w);
        if (gap > it.size * 0.25) text += ' ';
      }
      text += it.str;
    }
    return { text, x: row.items[0] ? row.items[0].x : 0, size: row.size };
  });
}

function rowsToText(rows) {
  let inCode = false, minX = Infinity;
  for (const r of rows) {
    const t = r.text.trim();
    if (/^@@CODE\b/.test(t)) { inCode = true; }
    else if (/^@@ENDCODE\b/.test(t)) { inCode = false; }
    else if (inCode) minX = Math.min(minX, r.x);
  }
  inCode = false;
  const out = [];
  for (const r of rows) {
    const t = r.text.trim();
    if (/^@@CODE\b/.test(t)) { inCode = true; out.push('@@CODE'); continue; }
    if (/^@@ENDCODE\b/.test(t)) { inCode = false; out.push('@@ENDCODE'); continue; }
    if (inCode && minX < Infinity) {
      const indent = Math.max(0, Math.round((r.x - minX) / Math.max(4, r.size * 0.6)));
      out.push(' '.repeat(indent) + t);
    } else out.push(r.text);
  }
  return out.join('\n');
}
