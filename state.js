/* Study Hub — state, prefs and subject normalization (current format). */
'use strict';

const LS_KEY = 'study-hub-v1';
const PREFS_KEY = 'study-hub-prefs';

/* ---------------- date helpers ---------------- */
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parseExamDate = (dateStr) => {
  if (typeof dateStr !== 'string') return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0, 0, 0);
  return isNaN(d) ? null : d;
};
const normExamDate = (str) => {
  const d = parseExamDate(str);
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
function daysUntil(dateStr) {
  try {
    const target = parseExamDate(dateStr);
    if (!target) return null;
    return Math.round((startOfDay(target).getTime() - startOfDay(new Date()).getTime()) / 86400000);
  } catch (e) { return null; }
}
const fmtDate = (dateStr) => {
  try {
    const d = parseExamDate(dateStr);
    if (!d) return dateStr;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}/.test(dateStr)) {
      return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return dateStr; }
};
/* Days from now to a timestamp — used by the review queue ("Nd") */
const fmtDue = (ts) => Math.max(0, Math.round((new Date(Number(ts) || 0).getTime() - Date.now()) / 86400000));

/* ---------------- prefs (theme, self-test) ---------------- */
const THEME_ORDER = ['light', 'dark', 'amoled'];
const THEME_ICONS = {
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.3"/><path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  amoled: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="9.05"/></svg>',
};
const THEME_LABEL = { light: 'Light', dark: 'Dark', amoled: 'AMOLED' };
function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    let theme = p.theme;
    if (!theme) theme = p.dark ? 'dark' : 'light'; // migrate legacy boolean
    if (!THEME_ORDER.includes(theme)) theme = 'light';
    return { theme, selfTest: !!p.selfTest };
  } catch (e) {
    toast('Cannot read preferences — browser storage is unavailable.');
    return { theme: 'light', selfTest: false };
  }
}
let prefs = loadPrefs();
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
  catch (e) { toast('Cannot save preferences — browser storage is unavailable or full.'); }
}
function applyPrefs() {
  document.documentElement.dataset.theme = prefs.theme;
  const tb = $('#themeBtn');
  if (tb) {
    $('#themeIcon').innerHTML = THEME_ICONS[prefs.theme];
    tb.title = 'Theme: ' + THEME_LABEL[prefs.theme] + ' — click to change';
    tb.setAttribute('aria-label', tb.title);
    tb.setAttribute('aria-pressed', String(prefs.theme !== 'light'));
  }
  const st = $('#selfTestBtn');
  if (st) { st.classList.toggle('is-on', prefs.selfTest); st.setAttribute('aria-pressed', String(prefs.selfTest)); }
}
function cycleTheme() {
  const i = THEME_ORDER.indexOf(prefs.theme);
  prefs.theme = THEME_ORDER[(i + 1) % THEME_ORDER.length];
  savePrefs(); applyPrefs();
  toast('Theme: ' + THEME_LABEL[prefs.theme]);
}

/* ---------------- state ---------------- */
function blankState() { return { subjects: [], activeId: null }; }

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.subjects)) {
        const subs = [];
        s.subjects.forEach((x, i) => {
          try { subs.push(normalizeSubject(x)); }
          catch (e) { console.warn('Skipped unreadable subject #' + i, e); }
        });
        return { subjects: subs, activeId: s.activeId || null };
      }
    }
  } catch (e) {
    console.warn('Could not read saved data', e);
    toast('Cannot read saved progress — browser storage is unavailable.');
  }
  return blankState();
}

let state = loadState();

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — browser storage may be full'); }
}

const active = () => state.subjects.find(s => s.id === state.activeId) || state.subjects[0] || null;

function migrateProgress(p) {
  p = p && typeof p === 'object' ? p : {};
  const confidence = (p.confidence && typeof p.confidence === 'object') ? Object.assign({}, p.confidence) : {};
  const review = (p.review && typeof p.review === 'object') ? Object.assign({}, p.review) : {};
  Object.keys(confidence).forEach(k => {
    if (!['know', 'fuzzy', 'dontknow'].includes(confidence[k])) delete confidence[k];
  });
  const history = Array.isArray(p.history) ? p.history
    .filter(x => x && typeof x === 'object')
    .map(x => ({ ts: Number(x.ts) || Date.now(), score: Number(x.score) || 0 }))
    .slice(-365)
    : [];
  return { topics: (p.topics && typeof p.topics === 'object') ? p.topics : {}, confidence, review, history };
}

function ensureIds() {
  state.subjects.forEach(s => {
    if (!s.id) s.id = uid('sub');
    s.progress = migrateProgress(s.progress);
    s.examDate = normExamDate(s.examDate);
    s.topics.forEach(t => {
      if (!t.id) t.id = uid('t');
      if (t.marksLabel == null) t.marksLabel = String(t.marks);
      t.questions.forEach(q => { if (!q.id) q.id = uid('q'); });
    });
  });
  if (!state.activeId || !state.subjects.some(s => s.id === state.activeId)) {
    state.activeId = state.subjects[0] ? state.subjects[0].id : null;
  }
}

/* ---------------- normalization ---------------- */
function blockType(t) {
  const v = String(t || '').toLowerCase();
  if (v === 'b' || v === 'bullet' || v === 'list') return 'b';
  if (v === 'code' || v === 'pre' || v === 'mono') return 'code';
  if (v === 'h' || v === 'h2' || v === 'heading' || v === 'subhead') return 'h';
  return 'p';
}
function toText(b) {
  if (typeof b === 'string') return b;
  if (!b) return '';
  return String(b.v != null ? b.v : (b.text != null ? b.text : ''));
}

function normConcepts(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(c => {
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object') return String(c.text || c.v || c.value || '');
    return String(c || '');
  }).filter(Boolean);
}

function normQuestion(q, idx) {
  q = q || {};
  let blocks = null;
  const rawBlocks = q.blocks || q.content;
  if (Array.isArray(rawBlocks) && rawBlocks.length) {
    blocks = rawBlocks.map(b => ({
      type: blockType(b && (b.type || b.t)),
      text: toText(b),
    })).filter(b => b.text !== '');
  }
  const answer = Array.isArray(q.answer) ? q.answer.map(String)
    : (q.answer != null && q.answer !== '' ? [String(q.answer)] : (q.a != null ? [String(q.a)] : []));
  const steps = Array.isArray(q.steps) ? q.steps.map(String)
    : (q.steps != null && q.steps !== '' ? [String(q.steps)] : []);
  return {
    id: q.id || uid('q'),
    question: String(q.question || q.q || q.text || q.title || 'Question ' + (idx + 1)),
    marks: num(q.marks != null ? q.marks : q.qmarks, 1),
    source: String(q.source || q.paper || q.ref || ''),
    answer, steps,
    code: q.code != null ? String(q.code) : '',
    blocks,
  };
}

// leading marks number from strings like "0-2 (foundation for 5m expressions)" -> 2
function leadingMarks(str) {
  const m = String(str == null ? '' : str).match(/^\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/);
  if (!m) return 1;
  return m[2] ? Math.max(+m[1], +m[2]) : +m[1];
}

function normTopic(t, idx) {
  t = t || {};
  const rawMarks = typeof t.marks === 'number' ? String(t.marks) : String(t.marks == null ? '' : t.marks);
  return {
    id: t.id || uid('t'),
    seq: typeof t.seq === 'number' ? t.seq : idx + 1,
    title: String(t.title || t.name || t.topic || 'Topic ' + (idx + 1)),
    marks: Math.max(0, num(leadingMarks(rawMarks), 1)),
    marksLabel: String(t.marksLabel || rawMarks || leadingMarks(rawMarks)),
    everyPaper: typeof t.everyPaper === 'boolean' ? t.everyPaper : /every\s*paper/i.test(rawMarks),
    rank: num(t.rank != null ? t.rank : t.priority, idx + 1),
    concepts: normConcepts(t.concepts),
    formulas: (Array.isArray(t.formulas) ? t.formulas : (t.formula != null ? [t.formula] : [])).map(f => String(f).trim()).filter(Boolean),
    questions: (Array.isArray(t.questions) ? t.questions : []).map(normQuestion),
  };
}

function normalizeSubject(raw) {
  raw = raw || {};
  const examTotal = num(raw.examTotal != null ? raw.examTotal : (raw.totalMarks != null ? raw.totalMarks : raw.total), 100);
  let target = num(raw.target != null ? raw.target : raw.targetMarks, Math.round(examTotal * 0.6));
  target = Math.max(0, Math.min(target, examTotal));
  const planRaw = raw.plan || {};
  const plan = {
    blueprint: planRaw.blueprint || null,
    ranking: planRaw.ranking || null,
    schedule: planRaw.schedule || null,
    checklist: planRaw.checklist || null,
  };
  Object.keys(plan).forEach(k => { if (plan[k] && (!Array.isArray(plan[k]) || !plan[k].length)) plan[k] = null; });
  const topics = (Array.isArray(raw.topics) ? raw.topics : []).map(normTopic);
  const examDate = normExamDate(raw.examDate);
  return {
    id: raw.id || uid('sub'),
    name: String(raw.name || 'Untitled subject'),
    code: String(raw.code || ''),
    examTotal, target, examDate,
    description: String(raw.description || ''),
    topics, plan,
    progress: migrateProgress(raw.progress),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}
