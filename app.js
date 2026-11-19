/* ============================================================
   Study Hub — app logic
   - Subjects imported from a PDF (marker format) or JSON
   - Fully offline: localStorage only
   - Optional full editor
   - Confidence weighting, self-test mode, spaced repetition,
     exam countdown/pace, print revision sheet, dark mode
   ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'study-hub-v1';
  const PREFS_KEY = 'study-hub-prefs';
  const MAX_SUBJECTS = 3;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* Lazy-load heavy vendor libs only when needed */
  const lazy = { pdf: null, katex: null, katexCss: false };
  function loadScriptOnce(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + url));
      document.head.append(s);
    });
  }
  function ensureCss(id, href) {
    if (document.getElementById(id)) return;
    const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = href; document.head.append(l);
  }
  function ensurePdfJs() {
    if (!lazy.pdf) {
      lazy.pdf = loadScriptOnce('vendor/pdf.min.js').then(() => {
        if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      }).catch(err => { lazy.pdf = null; throw err; });
    }
    return lazy.pdf;
  }
  function ensureKaTeX() {
    if (!lazy.katexCss) { ensureCss('katex-css', 'vendor/katex/katex.min.css'); lazy.katexCss = true; }
    if (!lazy.katex) {
      lazy.katex = loadScriptOnce('vendor/katex/katex.min.js').catch(err => { lazy.katex = null; throw err; });
    }
    return lazy.katex;
  }

  /* ---------------- helpers ---------------- */
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let uidN = 0;
  const uid = (p) => p + '_' + Date.now().toString(36) + (++uidN).toString(36) + Math.random().toString(36).slice(2, 6);

  const num = (v, d) => {
    const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : d;
  };

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

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
    } catch (e) { return { theme: 'light', selfTest: false }; }
  }
  let prefs = loadPrefs();
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
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
    } catch (e) { console.warn('Could not read saved data', e); }
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
    if (p.questions && typeof p.questions === 'object') {
      Object.keys(p.questions).forEach(k => {
        if (p.questions[k] && !confidence[k]) {
          const v = String(p.questions[k]).toLowerCase();
          confidence[k] = (v === 'know' || v === 'fuzzy' || v === 'dontknow') ? v : 'know';
        }
      });
    }
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
    const meta = raw.subject && typeof raw.subject === 'object' ? raw.subject : {};
    const examTotal = num(raw.examTotal != null ? raw.examTotal : (meta.examTotal != null ? meta.examTotal : (raw.totalMarks != null ? raw.totalMarks : raw.total)), 100);
    let target = num(raw.target != null ? raw.target : (meta.target != null ? meta.target : raw.targetMarks), Math.round(examTotal * 0.6));
    target = Math.max(0, Math.min(target, examTotal));
    const planRaw = raw.plan || {};
    const plan = {
      blueprint: planRaw.blueprint || raw.blueprint || null,
      ranking: planRaw.ranking || raw.ranking || null,
      schedule: planRaw.schedule || raw.schedule || null,
      checklist: planRaw.checklist || raw.checklist || null,
    };
    Object.keys(plan).forEach(k => { if (plan[k] && (!Array.isArray(plan[k]) || !plan[k].length)) plan[k] = null; });
    // Older imports stored over-wide plan tables; keep them readable on load.
    const tidyPlan = (rows, kind) => {
      if (!Array.isArray(rows) || !Array.isArray(rows[0]) || rows[0].length <= 4) return rows;
      const head = rows[0].map(String).join(' ');
      const headers = kind === 'blueprint' && /^Priority\b/i.test(head) ? ['Priority', 'Topic', 'Unit', 'Avg. marks']
        : kind === 'ranking' ? (/Marks\s+Why/i.test(head) ? ['Rank', 'Topic', 'Marks', 'Why it matters'] : ['Rank', 'Topic', 'Unit', 'Avg. marks'])
        : null;
      if (!headers) return rows;
      return [headers, ...rows.slice(1).map(r => {
        const a = Array.isArray(r) ? r : [r];
        return kind === 'blueprint' ? [a[0], a[1], a[2], a[6] != null ? a[6] : (a[a.length - 2] || '')] : a.slice(0, 4);
      })];
    };
    plan.blueprint = tidyPlan(plan.blueprint, 'blueprint');
    plan.ranking = tidyPlan(plan.ranking, 'ranking');
    const topics = (Array.isArray(raw.topics) ? raw.topics : []).map(normTopic);
    const examDate = normExamDate(raw.examDate);
    return {
      id: raw.id || uid('sub'),
      name: String(raw.name || meta.name || 'Untitled subject'),
      code: String(raw.code || meta.code || ''),
      examTotal, target, examDate,
      description: String(raw.description || meta.description || ''),
      topics, plan,
      progress: migrateProgress(raw.progress),
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  }

  /* ---------------- scoring / review ---------------- */
  const CONF_VALUE = { know: 1, fuzzy: 0.5, dontknow: 0 };
  const CONF_LABEL = { know: 'Got it', fuzzy: 'Fuzzy', dontknow: "Didn't get it" };

  function topicStats(s, t) {
    const total = t.questions.length;
    const attempted = t.questions.reduce((n, q) => n + (s.progress.confidence[q.id] ? 1 : 0), 0);
    const full = !!s.progress.topics[t.id] || (total > 0 && attempted === total);
    let frac;
    if (full) frac = 1;
    else if (!total) frac = 0;
    else frac = t.questions.reduce((n, q) => n + (CONF_VALUE[s.progress.confidence[q.id]] || 0), 0) / total;
    return { total, qDone: attempted, full, frac, effDone: full ? total : attempted };
  }

  function subjectStats(s) {
    const per = s.topics.map(t => topicStats(s, t));
    const qTotal = per.reduce((n, x) => n + x.total, 0);
    const qDone = per.reduce((n, x) => n + x.effDone, 0);
    const topicsDone = per.filter(x => x.full).length;
    const weights = s.topics.map(t => Math.max(0, num(t.marks, 0)));
    const wSum = weights.reduce((a, b) => a + b, 0);
    let earned = 0;
    if (wSum > 0) s.topics.forEach((t, i) => { earned += weights[i] * per[i].frac; });
    else s.topics.forEach((t, i) => { earned += per[i].frac; });
    const denom = wSum > 0 ? wSum : (s.topics.length || 1);
    const score = Math.min(s.examTotal, Math.round(earned / denom * s.examTotal));
    return {
      per, qTotal, qDone, topicsDone,
      progressPct: qTotal ? qDone / qTotal * 100 : 0,
      score,
    };
  }

  function reviewEntry(s, qid) {
    return (s.progress.review && s.progress.review[qid]) || { ease: 2.5, reps: 0, interval: 1, due: 0 };
  }
  function countDue(s) {
    const now = Date.now();
    let n = 0;
    s.topics.forEach(t => t.questions.forEach(q => {
      if (!s.progress.confidence[q.id]) return;
      const r = reviewEntry(s, q.id);
      if ((Number(r.due) || 0) <= now) n++;
    }));
    return n;
  }
  function scheduleReview(s, qid, rating) {
    const r = Object.assign({}, reviewEntry(s, qid));
    const now = Date.now();
    if (rating === 'know') {
      r.reps += 1;
      r.interval = r.reps === 1 ? 1 : r.reps === 2 ? 3 : Math.max(1, Math.round(r.interval * r.ease));
      r.ease = Math.min(3, r.ease + 0.1);
      r.due = now + r.interval * 86400000;
    } else if (rating === 'fuzzy') {
      r.interval = Math.max(1, Math.round(r.interval * 1.2));
      r.ease = Math.max(1.3, r.ease - 0.05);
      r.due = now + r.interval * 86400000;
    } else {
      r.reps = 0;
      r.ease = Math.max(1.3, r.ease - 0.25);
      r.due = now + 10 * 60 * 1000; // 10 min
    }
    if (!s.progress.review) s.progress.review = {};
    s.progress.review[qid] = r;
  }
  function removeReview(s, qid) {
    if (s.progress.review) delete s.progress.review[qid];
  }

  /* ---------------- render: shell ---------------- */
  const viewState = { query: '', filter: 'all', sort: 'roi', mode: 'tracker' };
  let drawerTopicId = null;
  let currentFocusQ = null;

  function populateSelect() {
    const sel = $('#subjectSelect');
    if (!state.subjects.length) {
      sel.innerHTML = '<option>No subjects yet</option>';
      return;
    }
    sel.innerHTML = state.subjects.map(s =>
      `<option value="${esc(s.id)}" ${s.id === state.activeId ? 'selected' : ''}>${esc(s.name)}</option>`
    ).join('');
  }

  function refreshBadges() {
    const s = active();
    const due = s ? countDue(s) : 0;
    const badge = $('#reviewBadge');
    if (badge) { badge.textContent = String(due); badge.classList.toggle('is-zero', due === 0); }
  }

  let countdownTimer = null;
  function stopCountdown() { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }
  function startCountdown(s) {
    stopCountdown();
    const target = s.examDate ? parseExamDate(s.examDate) : null;
    if (!target) return;
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const h = $('#cdH'), m = $('#cdM'), sec = $('#cdS');
      if (!h || !m || !sec) { stopCountdown(); return; }
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { h.textContent = '00'; m.textContent = '00'; sec.textContent = '00'; stopCountdown(); return; }
      h.textContent = pad(Math.floor(diff / 3600000));
      m.textContent = pad(Math.floor((diff % 3600000) / 60000));
      sec.textContent = pad(Math.floor((diff % 60000) / 1000));
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function marksPills(t) {
    if (t.everyPaper) {
      return `<div class="marks-group">
        <span class="every-badge"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>Every paper</span>
        <span class="marks-badge">${esc(String(t.marks))}</span>
      </div>`;
    }
    return `<span class="marks-badge">${esc(t.marksLabel || String(t.marks))}</span>`;
  }

  function ring(percent) {
    const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
    const r = 44, C = 2 * Math.PI * r;
    const off = C * (1 - pct / 100);
    return `<svg viewBox="0 0 104 104" width="104" height="104" role="img" aria-label="${pct}% complete">
      <circle cx="52" cy="52" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="9"/>
      <circle cx="52" cy="52" r="${r}" fill="none" stroke="var(--teal)" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 52 52)"
        style="transition:stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)"/>
      <text x="52" y="49" text-anchor="middle" font-size="23" font-weight="800" fill="var(--heading)">${pct}%</text>
      <text x="52" y="64" text-anchor="middle" font-size="9" font-weight="700" fill="var(--muted)" letter-spacing="1">DONE</text>
    </svg>`;
  }

  function tableFromRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return '';
    const hasHeader = Array.isArray(rows[0]);
    const head = hasHeader ? rows[0] : null;
    const body = hasHeader ? rows.slice(1) : rows;
    return `<div class="table-wrap"><table class="plan-table">
      ${head ? `<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>` : ''}
      <tbody>${body.map(r => `<tr>${(Array.isArray(r) ? r : [r]).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function visibleTopics(s) {
    let list = s.topics.filter(t => {
      const st = topicStats(s, t);
      if (viewState.filter === 'todo' && st.frac > 0) return false;
      if (viewState.filter === 'progress' && !(st.frac > 0 && st.frac < 1)) return false;
      if (viewState.filter === 'done' && st.frac !== 1) return false;
      if (viewState.query) {
        const hay = [t.title, ...t.concepts, ...t.questions.flatMap(q => [q.question, ...(q.blocks || []).map(b => b.text)])].join(' ').toLowerCase();
        if (!hay.includes(viewState.query)) return false;
      }
      return true;
    }).slice();
    if (viewState.sort === 'roi') list.sort((a, b) => a.rank - b.rank || a.seq - b.seq);
    else if (viewState.sort === 'number') list.sort((a, b) => a.seq - b.seq);
    else if (viewState.sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title));
    else if (viewState.sort === 'progress') list.sort((a, b) => topicStats(s, b).frac - topicStats(s, a).frac || a.rank - b.rank);
    return list;
  }

  function examStrip(s, st) {
    const days = s.examDate ? daysUntil(s.examDate) : null;
    if (!s.examDate) {
      return `<section class="summary-strip summary-strip-empty" role="region" aria-label="Exam summary">
        <div class="summary-empty">
          <strong>Set your exam date &amp; time</strong>
          <p class="summary-sub">Get a live countdown, your predicted score, and the daily question pace you need — all in one glance.</p>
          <button class="btn btn-teal" id="setExamDate" type="button">Set exam date →</button>
        </div>
      </section>`;
    }
    const remaining = Math.max(0, st.qTotal - st.qDone);
    if (days === null) return '';
    if (days < 0) {
      return `<section class="summary-strip summary-strip-archived" role="region" aria-label="Exam summary">
        <div class="summary-cell" style="border-left: 0">
          <span class="summary-label">Done</span>
          <div class="summary-peer"><strong>✓</strong></div>
          <span class="summary-sub">${esc(fmtDate(s.examDate))} has passed — archive quest complete.</span>
        </div>
      </section>`;
    }
    const perDay = remaining === 0 ? 0 : Math.ceil(remaining / Math.max(1, days));
    const pace = remaining === 0 ? 'All questions mastered' : (days === 0 ? 'Exam is today' : `≈${perDay} question${perDay === 1 ? '' : 's'} a day to finish`);
    return `<section class="summary-strip${days <= 7 ? ' danger' : ''}" role="region" aria-label="Exam summary">
      <div class="summary-cell">
        <span class="summary-label">Exam in</span>
        <div class="cd-boxes" role="timer" aria-label="Time remaining until the exam">
          <div class="cd-box"><strong id="cdH">00</strong><span>Hours</span></div>
          <div class="cd-box"><strong id="cdM">00</strong><span>Min</span></div>
          <div class="cd-box"><strong id="cdS">00</strong><span>Sec</span></div>
        </div>
        <span class="summary-sub">${esc(fmtDate(s.examDate))} · ${esc(pace)}</span>
      </div>
      <div class="summary-cell">
        <span class="summary-label">Questions left</span>
        <div class="summary-peer"><strong>${remaining}</strong><span class="summary-den">/ ${st.qTotal}</span></div>
        <span class="summary-sub">${remaining === 0 ? 'Every question mastered ✓' : 'Need to rate ' + remaining + ' more for full credit'}</span>
      </div>
    </section>`;
  }

  function renderSubject() {
    stopCountdown();
    const v = $('#view');
    const s = active();
    if (!s) {
      v.innerHTML = `<section class="welcome">
        <img class="mark" src="icon.svg" alt="Study Hub" aria-hidden="true" width="72" height="72">
        <h2>Track any subject, one file at a time</h2>
        <p><strong>This is a study progress tracker, not a place to study from.</strong> Learn from your own notes, slides and PYQs — Study Hub turns them into topics and questions, then tracks how confident you are and predicts your score.</p>
        <p>Copy the built-in prompt ("Agent prompt"), open Gemini / Claude / ChatGPT, paste it, attach your syllabus + PYQs + notes, and save whatever it prints out as a <code>.txt</code> file. Drop that file here and your tracker is ready. Files never leave this browser.</p>
        <div class="welcome-actions">
          <button class="btn btn-primary" id="welcomeAdd" type="button">Get the agent prompt →</button>
          <button class="btn btn-outline" id="welcomeSample" type="button">Load the quick tour sample</button>
        </div>
      </section>`;
      const wa = $('#welcomeAdd'); if (wa) wa.addEventListener('click', openWizard);
      const ws = $('#welcomeSample'); if (ws) ws.addEventListener('click', addSample);
      refreshBadges();
      return;
    }

    if (viewState.mode === 'progress') { renderProgressPage(v, s); return; }

    const st = subjectStats(s);
    const remaining = Math.max(0, s.target - st.score);
    const plan = s.plan || {};
    const hasPlan = ['blueprint', 'ranking', 'schedule', 'checklist'].some(k => plan[k] && (Array.isArray(plan[k]) ? plan[k].length : true));
    const due = countDue(s);

    v.innerHTML = `
      <section class="subject-head">
        <div>
          <p class="eyebrow">${s.code ? esc(s.code) + ' · ' : ''}Study tracker</p>
          <h2>${esc(s.name)}</h2>
          ${s.description ? `<div class="sub">${esc(s.description)}</div>` : ''}
          <div class="chip-row">
            <span class="chip">${s.topics.length} topics</span>
            <span class="chip">${st.qTotal} questions</span>
            <span class="chip">Exam total: ${s.examTotal}</span>
            <span class="chip">Target: ${s.target}</span>
            ${s.examDate ? `<span class="chip chip-accent">Exam ${esc(fmtDate(s.examDate))}</span>` : ''}
          </div>
        </div>
        <div class="head-actions">
          <button class="btn btn-outline" id="editSubjectBtn" type="button">✎ Edit subject</button>
          <button class="btn btn-outline" id="addTopicBtn" type="button">+ Add topic</button>
          <button class="btn btn-outline" id="printSheetBtn" type="button">⎙ Print sheet</button>
        </div>
      </section>

      ${examStrip(s, st)}

      <section class="dashboard">
        <div class="dash-grid">
          <div class="card ring-card">
            <div class="ring-wrap">${ring(st.progressPct)}</div>
            <div class="ring-label"><strong>Overall progress</strong><span class="muted">${st.qDone} of ${st.qTotal} questions rated</span></div>
          </div>
          <div class="card">
            <div class="score-top"><span class="card-label">Predicted score</span><span class="pill ${st.score >= s.target ? 'pill-green' : (st.score >= s.target / 2 ? 'pill-teal' : 'pill-orange')}">${st.score >= s.target ? 'Goal reached' : (st.score >= s.target / 2 ? 'On track' : 'Keep going')}</span></div>
            <div class="score-main"><span class="score-num">${st.score}</span><span class="score-den">/ ${s.examTotal}</span></div>
            <div class="meter"><div class="meter-fill meter-score" style="width:${s.examTotal ? (st.score / s.examTotal * 100) : 0}%"></div></div>
            <p class="muted small">Weighted by each topic's marks and your confidence (Got it = full, Fuzzy = half).</p>
          </div>
          <div class="card">
            <div class="score-top"><span class="card-label">Target of ${s.target}</span><span class="pill ${remaining === 0 ? 'pill-green' : 'pill-orange'}">${remaining === 0 ? 'Secured' : 'In progress'}</span></div>
            <div class="goal-big" style="color:${remaining === 0 ? 'var(--green)' : 'var(--orange)'}">${remaining === 0 ? `${s.target}-mark target LOCKED ✓` : `${remaining} mark${remaining === 1 ? '' : 's'} to go`}</div>
            <div class="meter"><div class="meter-fill meter-goal" style="width:${Math.min(100, st.score / Math.max(1, s.target) * 100)}%"></div></div>
            <p class="muted small">${remaining === 0 ? 'Your predicted score clears the target.' : 'Master the top-ranked topics first for the fastest gain.'}</p>
          </div>
          <div class="card">
            <span class="card-label">Topics completed</span>
            <div class="stat-num">${st.topicsDone} <span>/ ${s.topics.length}</span></div>
            <div class="meter"><div class="meter-fill meter-topics" style="width:${s.topics.length ? (st.topicsDone / s.topics.length * 100) : 0}%"></div></div>
            <p class="muted small">Mark a topic complete, or rate all its questions.</p>
          </div>
        </div>
      </section>

      <section class="topics-section">
        <div class="section-head">
          <div><p class="eyebrow">${s.topics.length} topics · ${st.qTotal} questions${due ? ` · <strong style="color:var(--red)">${due} due for review</strong>` : ''}</p><h2>Topics</h2></div>
          <div class="controls">
            <div class="search-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 21l-4.3-4.3M11 19a8 8 0 110-16 8 8 0 010 16z"/></svg>
              <input type="search" id="searchInput" placeholder="Search topics or questions…" value="${esc(viewState.query)}" autocomplete="off" />
            </div>
            <div class="filter-tabs" id="filterTabs">
              <button class="tab ${viewState.filter === 'all' ? 'active' : ''}" data-filter="all" type="button">All</button>
              <button class="tab ${viewState.filter === 'todo' ? 'active' : ''}" data-filter="todo" type="button">Not started</button>
              <button class="tab ${viewState.filter === 'progress' ? 'active' : ''}" data-filter="progress" type="button">In progress</button>
              <button class="tab ${viewState.filter === 'done' ? 'active' : ''}" data-filter="done" type="button">Completed</button>
            </div>
            <label class="sort-wrap">Sort
              <select id="sortSelect">
                <option value="roi" ${viewState.sort === 'roi' ? 'selected' : ''}>By rank</option>
                <option value="number" ${viewState.sort === 'number' ? 'selected' : ''}>By order</option>
                <option value="progress" ${viewState.sort === 'progress' ? 'selected' : ''}>By progress</option>
                <option value="title" ${viewState.sort === 'title' ? 'selected' : ''}>By name</option>
              </select>
            </label>
          </div>
        </div>
        <div class="topic-grid" id="topicGrid"></div>
        <div class="empty-state" id="emptyState" hidden><div class="empty-icon">✓</div><h3>No topics here</h3><p class="muted">Try a different filter or search term.</p></div>
      </section>

      <section class="actions-section">
        <div class="section-head"><div><p class="eyebrow">Quick actions</p><h2>Study arsenal</h2></div></div>
        <div class="action-grid">
          <button class="action-card ${prefs.selfTest ? 'is-on' : ''}" id="selfTestBtn" type="button" aria-pressed="${prefs.selfTest ? 'true' : 'false'}" data-accent="orange">
            <span class="a-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-5 0-9.27-3-12-7a12.5 12.5 0 0 1 2.24-3.2M6.2 6.2l11.6 11.6M9.9 4.24A10.6 10.6 0 0 1 12 4c5 0 9.27 3 12 7a12.6 12.6 0 0 1-2.7 3.57M14.12 14.12A3 3 0 1 1 9.88 9.88"/></svg></span>
            <span class="a-body"><span class="a-title">Self-test <span class="on-chip">${prefs.selfTest ? 'On' : 'Off'}</span></span><span class="a-sub">Hides answers until you reveal them — pure active recall.</span></span>
          </button>
          <button class="action-card" id="reviewBtn" type="button" data-accent="green">
            <span class="a-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.58-6.36L23 10"/></svg></span>
            <span class="a-body"><span class="a-title">Reviews <span class="badge-mini ${due === 0 ? 'is-zero' : ''}" id="reviewBadge">${due}</span></span><span class="a-sub">Spaced repetition — drill what's due, scheduled by SM-2.</span></span>
          </button>
          <button class="action-card" id="printBtn" type="button" data-accent="teal">
            <span class="a-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="8"/></svg></span>
            <span class="a-body"><span class="a-title">Print sheet</span><span class="a-sub">One-click A4 revision sheet — topics, concepts, full Q&amp;A with your ratings.</span></span>
          </button>
        </div>
      </section>

      ${hasPlan ? `<section class="plan-section">
        <div class="section-head"><div><p class="eyebrow">Your study plan</p><h2>Plan reference</h2></div></div>
        <div class="plan-grid">
          ${plan.blueprint ? `<details class="panel" open><summary><span>Mark blueprint</span><span class="chev">⌄</span></summary><div class="panel-body">${tableFromRows(plan.blueprint)}</div></details>` : ''}
          ${plan.ranking ? `<details class="panel"><summary><span>Ranking by ROI</span><span class="chev">⌄</span></summary><div class="panel-body">${tableFromRows(plan.ranking)}</div></details>` : ''}
          ${plan.schedule ? `<details class="panel"><summary><span>Schedule</span><span class="chev">⌄</span></summary><div class="panel-body">${tableFromRows(plan.schedule)}</div></details>` : ''}
          ${plan.checklist ? `<details class="panel"><summary><span>Checklist</span><span class="chev">⌄</span></summary><div class="panel-body"><ul class="checklist">${plan.checklist.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div></details>` : ''}
        </div>
      </section>` : ''}
    `;

    bindSubjectEvents(s);
    renderTopicGrid();
    refreshBadges();
  }

  function renderTopicGrid() {
    const s = active();
    const grid = $('#topicGrid');
    if (!s || !grid) return;
    const list = visibleTopics(s);
    const empty = $('#emptyState');
    if (empty) empty.hidden = list.length > 0;
    grid.innerHTML = list.map(t => {
      const st = topicStats(s, t);
      const status = st.frac === 1 ? 'done' : st.frac > 0 ? 'progress' : '';
      const label = st.frac === 1 ? 'Completed' : st.frac > 0 ? 'In progress' : 'Not started';
      const explicit = !!s.progress.topics[t.id];
      return `<article class="topic-card ${st.full ? 'is-done' : ''}" data-topic="${esc(t.id)}" tabindex="0" role="button" aria-label="Open ${esc(t.title)}">
        <div class="topic-card-top">
          <div class="rank-badge ${t.rank <= 3 ? 'top' : ''}" title="Study rank">#${esc(t.rank)}</div>
          ${marksPills(t)}
        </div>
        <div>
          <h3>${esc(t.title)}</h3>
          <div class="topic-sub"><span class="status-dot ${status}"></span>${label} · ${t.questions.length} questions</div>
        </div>
        <div>
          <div class="topic-progress-row"><span>Questions rated</span><strong>${st.effDone}/${st.total}</strong></div>
          <div class="meter"><div class="meter-fill" style="width:${st.frac * 100}%;background:${st.full ? 'var(--green)' : 'linear-gradient(90deg,var(--teal),#2bb9a8)'}"></div></div>
        </div>
        <div class="topic-card-actions">
          <button class="btn ${explicit ? 'btn-done' : 'btn-outline'} js-toggle-topic" data-topic="${esc(t.id)}" type="button">${explicit ? '✓ Completed' : 'Mark complete'}</button>
          <button class="btn btn-outline js-open-topic" data-topic="${esc(t.id)}" type="button">View questions →</button>
        </div>
      </article>`;
    }).join('');
  }

  function bindSubjectEvents(s) {
    const si = $('#searchInput');
    if (si) si.addEventListener('input', e => { viewState.query = e.target.value.trim().toLowerCase(); renderTopicGrid(); });
    const ft = $('#filterTabs');
    if (ft) ft.addEventListener('click', e => {
      const b = e.target.closest('.tab'); if (!b) return;
      viewState.filter = b.dataset.filter;
      $$('.tab', ft).forEach(x => x.classList.toggle('active', x === b));
      renderTopicGrid();
    });
    const ss = $('#sortSelect');
    if (ss) ss.addEventListener('change', e => { viewState.sort = e.target.value; renderTopicGrid(); });
    const es = $('#editSubjectBtn'); if (es) es.addEventListener('click', () => openSubjectEditor());
    const at = $('#addTopicBtn'); if (at) at.addEventListener('click', () => openTopicEditor(null));
    const pr = $('#printSheetBtn'); if (pr) pr.addEventListener('click', () => printRevisionSheet());
    const sd = $('#setExamDate'); if (sd) sd.addEventListener('click', () => openSubjectEditor());
    const wa = $('#welcomeAdd'); if (wa) wa.addEventListener('click', openWizard);
    const ws = $('#welcomeSample'); if (ws) ws.addEventListener('click', addSample);
    const rb = $('#reviewBtn'); if (rb) rb.addEventListener('click', openReviewQueue);
    const stBtn = $('#selfTestBtn'); if (stBtn) stBtn.addEventListener('click', () => {
      prefs.selfTest = !prefs.selfTest;
      savePrefs(); applyPrefs();
      toast(prefs.selfTest ? 'Self-test on — answers hidden until you reveal them' : 'Self-test off');
      refresh();
    });
    const pb = $('#printBtn'); if (pb) pb.addEventListener('click', printRevisionSheet);
    startCountdown(s);
    applyPrefs();
  }

  /* ---------------- progress page ---------------- */
  function recordScoreChange(s) {
    const hist = s.progress.history || (s.progress.history = []);
    const score = subjectStats(s).score;
    if (!hist.length) hist.push({ ts: Date.now(), score });
    else if (hist[hist.length - 1].score !== score) hist.push({ ts: Date.now(), score });
  }

  const fmtTick = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  function renderProgressPage(v, s) {
    const st = subjectStats(s);
    const hist = (s.progress.history || []).slice();
    const first = hist.length ? hist[0].score : st.score;
    const peak = hist.length ? Math.max(...hist.map(h => h.score)) : st.score;
    const delta = st.score - first;
    const remaining = Math.max(0, s.target - st.score);

    v.innerHTML = `
      <section class="subject-head">
        <div>
          <p class="eyebrow">${s.code ? esc(s.code) + ' · ' : ''}Progress</p>
          <h2>How your score moved</h2>
          <div class="sub">Every rating you add is recorded — the line turns into your study journey.</div>
          <div class="chip-row">
            <span class="chip">${s.examTotal} exam total</span>
            <span class="chip">Target ${s.target}</span>
            <span class="chip chip-accent">Peak ${peak}</span>
          </div>
        </div>
        <div class="head-actions">
          <button class="btn btn-outline" id="backToTracker" type="button">← Back to tracker</button>
          <button class="btn btn-outline" id="progressPrintBtn" type="button">⎙ Print sheet</button>
        </div>
      </section>

      <section class="progress-page">
        <div class="progress-grid">
          <div class="card progress-hero">
            <div class="score-top"><span class="card-label">Predicted score</span><span class="pill ${st.score >= s.target ? 'pill-green' : (st.score >= s.target / 2 ? 'pill-teal' : 'pill-orange')}">${st.score >= s.target ? 'Goal reached' : 'In progress'}</span></div>
            <div class="progress-big"><span class="score-num">${st.score}</span><span class="score-den">/ ${s.examTotal}</span></div>
            ${hist.length
              ? `<svg id="scoreChart" class="score-chart" viewBox="0 0 660 220" preserveAspectRatio="none" role="img" aria-label="Line chart of predicted score over time"></svg>
                 <p class="muted small chart-foot">Last ${hist.length} score update${hist.length === 1 ? '' : 's'} · target ${s.target} marks${s.examDate ? ' · exam ' + esc(fmtDate(s.examDate)) : ''}</p>`
              : `<div class="chart-empty"><strong>Your chart will fill in as you study</strong><span>Rate a question (Got it / Fuzzy / Didn't get it) and your prediction history starts recording.</span></div>`}
          </div>
          <div class="progress-rail">
            <div class="card stat-card"><span class="card-label">Change</span><div class="stat-num" style="color:${delta >= 0 ? 'var(--green-strong)' : 'var(--red)'}">${delta >= 0 ? '+' : ''}${delta}</div><p class="muted small">since your first rating</p></div>
            <div class="card stat-card"><span class="card-label">Peak</span><div class="stat-num">${peak}</div><p class="muted small">highest prediction so far</p></div>
            <div class="card stat-card"><span class="card-label">To target</span><div class="stat-num">${remaining}</div><p class="muted small">${remaining === 0 ? 'target reached ✓' : 'marks to your goal'}</p></div>
            <div class="card stat-card"><span class="card-label">Questions rated</span><div class="stat-num">${st.qDone}</div><p class="muted small">of ${st.qTotal} total</p></div>
          </div>
        </div>
      </section>`;

    const back = $('#backToTracker');
    if (back) back.addEventListener('click', () => { viewState.mode = 'tracker'; refresh(); });
    const pr = $('#progressPrintBtn');
    if (pr) pr.addEventListener('click', printRevisionSheet);
    const svg = $('#scoreChart');
    if (svg && hist.length) drawScoreChart(s, svg, hist);
  }

  function drawScoreChart(s, svg, hist) {
    const maxY = Math.max(s.examTotal, Math.max(...hist.map(h => h.score)), 5);
    const W = 660, H = 220, PL = 38, PR = 12, PT = 16, PB = 32;
    const t0 = hist[0].ts, t1 = hist[hist.length - 1].ts;
    const span = Math.max(1, t1 - t0);
    const X = (i) => PL + ((hist[i].ts - t0) / span) * (W - PL - PR);
    const Y = (v) => PT + (1 - v / maxY) * (H - PT - PB);
    const baseY = Y(0);
    const linePts = hist.map((h, i) => `${X(i).toFixed(1)},${Y(h.score).toFixed(1)}`).join(' ');
    const areaPts = linePts + ` ${X(hist.length - 1).toFixed(1)},${baseY.toFixed(1)} ${X(0).toFixed(1)},${baseY.toFixed(1)}`;

    // gridlines & y labels: 0, 25%, 50%, 75%, 100%
    const grid = [0, 0.25, 0.5, 0.75, 1].map(f => {
      const val = Math.round(maxY * f);
      const y = Y(val).toFixed(1);
      return `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="rgba(128,128,128,0.22)" stroke-width="1" stroke-dasharray="2 5"/>
              <text x="${PL - 8}" y="${(+y + 4).toFixed(1)}" text-anchor="end" style="fill:var(--muted);font-size:11px;font-family:'DM Sans',sans-serif">${val}</text>`;
    }).join('');

    // target line
    const targetY = Y(Math.min(s.target, maxY)).toFixed(1);
    const targetLabel = `<line x1="${PL}" y1="${targetY}" x2="${W - PR}" y2="${targetY}" stroke="var(--orange)" stroke-width="1.6" stroke-dasharray="5 4"/>
      <text x="${W - PR - 2}" y="${(+targetY - 4).toFixed(1)}" text-anchor="end" style="fill:var(--amber);font-size:11px;font-weight:700;font-family:'DM Sans',sans-serif">Target ${s.target}</text>`;

    const dots = hist.map((h, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(h.score).toFixed(1)}" r="${i === hist.length - 1 ? 4.6 : 3}" style="fill:var(--teal);stroke:var(--card);stroke-width:1.6"><title>${fmtTick(h.ts)} — ${h.score}</title></circle>`).join('');

    const xLabels = hist.length > 1
      ? `<text x="${X(0).toFixed(1)}" y="${H - 9}" text-anchor="start" style="fill:var(--muted);font-size:11px;font-family:'DM Sans',sans-serif">${fmtTick(hist[0].ts)}</text>
         ${(hist.length > 2 && hist.length % 2 === 0 || hist.length >= 5) ? `<text x="${X(Math.floor(hist.length / 2)).toFixed(1)}" y="${H - 9}" text-anchor="middle" style="fill:var(--muted);font-size:11px;font-family:'DM Sans',sans-serif">${fmtTick(hist[Math.floor(hist.length / 2)].ts)}</text>` : ''}
         <text x="${X(hist.length - 1).toFixed(1)}" y="${H - 9}" text-anchor="end" style="fill:var(--muted);font-size:11px;font-family:'DM Sans',sans-serif">${fmtTick(hist[hist.length - 1].ts)}</text>`
      : `<text x="${W / 2}" y="${H - 9}" text-anchor="middle" style="fill:var(--muted);font-size:11px;font-family:'DM Sans',sans-serif">${fmtTick(hist[0].ts)}</text>`;

    svg.innerHTML = `
      ${grid}
      <polygon points="${areaPts}" style="fill:var(--teal);opacity:0.16"/>
      <polyline points="${linePts}" fill="none" style="stroke:var(--teal);stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round"/>
      ${targetLabel}
      ${dots}
      ${xLabels}`;
  }

  /* ---------------- drawer ---------------- */
  function openDrawer(tid, focusQ) {
    const s = active(); if (!s) return;
    const t = s.topics.find(x => x.id === tid); if (!t) return;
    drawerTopicId = tid;
    currentFocusQ = focusQ || null;
    $('#drawerOverlay').hidden = false;
    $('#drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    renderDrawer();
    $('#drawerClose').focus();
  }
  function closeDrawer() {
    $('#drawerOverlay').hidden = true;
    $('#drawer').hidden = true;
    document.body.style.overflow = '';
    drawerTopicId = null;
    currentFocusQ = null;
  }

  function renderBlocks(blocks) {
    return (blocks || []).map(b => {
      if (b.type === 'code') return `<pre class="blk-code">${esc(b.text)}</pre>`;
      if (b.type === 'h') return `<div class="blk-h">${esc(b.text)}</div>`;
      if (b.type === 'b') return `<div class="blk-b">${esc(b.text)}</div>`;
      return `<p class="blk-p">${esc(b.text)}</p>`;
    }).join('');
  }

  function questionHTML(q, s) {
    const conf = s.progress.confidence[q.id] || '';
    let html = '';
    if (q.blocks && q.blocks.length) html += renderBlocks(q.blocks);
    else {
      (q.answer || []).forEach(a => { if (a) html += `<p class="blk-p">${esc(a)}</p>`; });
      if (q.steps && q.steps.length) html += `<div class="blk-h">Steps to remember</div><ol class="steps">${q.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
      if (q.code) html += `<pre class="blk-code">${esc(q.code)}</pre>`;
    }
    return html || '<p class="muted small">No answer yet — use Edit to add one.</p>';
  }

  function rateRowHTML(s, q) {
    const conf = s.progress.confidence[q.id] || '';
    const now = Date.now();
    const dueChip = conf && (Number(reviewEntry(s, q.id).due) || 0) <= now && s.progress.confidence[q.id] !== undefined
      ? '<span class="due-chip">Due again</span>' : '';
    return `<div class="rate-row" data-qid="${esc(q.id)}">
      <button class="rate-btn is-know ${conf === 'know' ? 'active' : ''}" data-rate="know" data-qid="${esc(q.id)}" type="button" aria-pressed="${conf === 'know' ? 'true' : 'false'}">✓ Got it</button>
      <button class="rate-btn is-fuzzy ${conf === 'fuzzy' ? 'active' : ''}" data-rate="fuzzy" data-qid="${esc(q.id)}" type="button" aria-pressed="${conf === 'fuzzy' ? 'true' : 'false'}">~ Fuzzy</button>
      <button class="rate-btn is-dontknow ${conf === 'dontknow' ? 'active' : ''}" data-rate="dontknow" data-qid="${esc(q.id)}" type="button" aria-pressed="${conf === 'dontknow' ? 'true' : 'false'}">✕ Didn't get it</button>
      ${dueChip}
    </div>`;
  }

  function renderDrawer() {
    const s = active(); if (!s) return;
    const t = s.topics.find(x => x.id === drawerTopicId); if (!t) { closeDrawer(); return; }
    const st = topicStats(s, t);
    $('#drawerPart').textContent = 'Topic';
    $('#drawerTitle').textContent = t.title;
    $('#drawerMeta').innerHTML = `<span>Rank #${esc(t.rank)}</span>${t.everyPaper ? '<span class="pill pill-every">Every paper</span><span>' + esc(String(t.marks)) + ' marks</span>' : '<span>' + esc(t.marksLabel || String(t.marks)) + '</span>'}<span>${t.questions.length} questions</span>`;
    const meterWrap = $('#drawerMeterWrap');
    if (meterWrap) meterWrap.setAttribute('aria-valuenow', String(Math.round(st.frac * 100)));
    $('#drawerMeter').style.width = (st.frac * 100) + '%';
    $('#drawerMeter').style.background = st.full ? 'var(--green)' : 'linear-gradient(90deg,var(--teal),#2bb9a8)';
    $('#drawerProgressText').textContent = `${st.effDone} of ${st.total} questions rated · ${Math.round(st.frac * 100)}%`;
    const toggle = $('#drawerToggle');
    toggle.textContent = s.progress.topics[t.id] ? 'Mark topic as not complete' : 'Mark topic complete';
    toggle.className = 'btn btn-block ' + (s.progress.topics[t.id] ? 'btn-done' : 'btn-primary');

    const selfTestBanner = prefs.selfTest
      ? `<div class="self-test-banner"><strong>Self-test</strong> answer first, reveal, then rate your confidence <button class="btn btn-outline" id="exitSelfTest" type="button">Exit self-test</button></div>`
      : '';

    $('#drawerBody').innerHTML = `
      ${selfTestBanner}
      <div class="drawer-section">
        <h3>Key concepts &amp; steps to remember</h3>
        <ul class="concept-list">${t.concepts.length ? t.concepts.map(c => `<li>${esc(c)}</li>`).join('') : '<li>No concept notes for this topic yet.</li>'}</ul>
      </div>
      <div class="drawer-section formula-section">
        <div class="formula-head">
          <h3>Key formulas (${(t.formulas || []).length})</h3>
          ${(t.formulas || []).length ? `<div class="formula-actions"><button class="btn btn-soft btn-sm" id="revealFormulas" type="button">Reveal all</button><button class="btn btn-outline btn-sm" id="hideFormulas" type="button">Hide all</button></div>` : ''}
        </div>
        ${(t.formulas || []).length
          ? `<p class="muted small">Blind recall — read each one and tap to reveal how you write it.</p>
            <div class="formula-list">${t.formulas.map((f, i) => `
              <button class="formula-item formula-hidden" data-fi="${i}" type="button" aria-pressed="false" aria-label="Tap to reveal formula ${i + 1}" title="Tap to reveal">
                <span class="formula-veil">Formula ${i + 1} — tap to reveal</span>
                <span class="formula-math" data-tex="${esc(f)}"></span>
              </button>`).join('')}</div>`
          : `<p class="muted small">No formulas listed for this topic yet.</p>`}
      </div>
      <div class="drawer-section">
        <h3>Questions, answers &amp; worked steps (${t.questions.length})</h3>
        <div class="bulk-row">
          <button class="btn btn-soft" id="markAllQ" type="button">✓ Mark all as Got it</button>
          <button class="btn btn-outline" id="clearAllQ" type="button">Clear all</button>
          <button class="btn btn-outline" id="addQ" type="button">+ Add question</button>
        </div>
        ${t.questions.length ? t.questions.map((q, i) => {
          const conf = s.progress.confidence[q.id] || '';
          const mark = conf === 'know' ? '✓' : conf === 'fuzzy' ? '~' : conf === 'dontknow' ? '✕' : '';
          const label = conf === 'know' ? 'GOT IT' : conf === 'fuzzy' ? 'FUZZY' : conf === 'dontknow' ? 'MISS' : 'Q' + (i + 1);
          const open = currentFocusQ === q.id || (!currentFocusQ && i === 0 && false);
          return `<div class="q-item ${conf ? 'conf-' + conf : ''} ${open ? 'open' : ''}" data-qid="${esc(q.id)}">
            <div class="q-head">
              <button type="button" class="q-check js-qcheck" data-qid="${esc(q.id)}" title="${conf ? CONF_LABEL[conf] : 'Rate this question'}" aria-label="${conf ? CONF_LABEL[conf] : 'Rate this question'}" aria-pressed="${conf ? 'true' : 'false'}">${mark}</button>
              <div class="q-qtext">${esc(q.question)}
                <div class="q-toggle-hint">${prefs.selfTest ? 'Tap to reveal answer &amp; rate' : 'Tap to show answer &amp; steps'} ▾</div>
                ${q.source ? `<div class="muted small">${esc(q.source)}</div>` : ''}
              </div>
              <div class="q-head-right">
                <span class="pill-mini">${esc(label)}</span>
                <button class="q-edit-btn js-edit-q" data-qid="${esc(q.id)}" type="button" title="Edit question">✎</button>
              </div>
            </div>
            <div class="q-body">${questionHTML(q, s)}${rateRowHTML(s, q)}</div>
          </div>`;
        }).join('') : '<p class="muted small">No questions yet. Add one, or upload a plan file (.txt/.md/.json/.pdf).</p>'}
      </div>`;

    const exitSelf = $('#exitSelfTest');
    if (exitSelf) exitSelf.addEventListener('click', () => { prefs.selfTest = false; savePrefs(); applyPrefs(); refresh(); });

    $('#markAllQ').addEventListener('click', () => {
      t.questions.forEach(q => { s.progress.confidence[q.id] = 'know'; scheduleReview(s, q.id, 'know'); });
      save(); refresh(); toast('All questions marked Got it');
    });
    $('#clearAllQ').addEventListener('click', () => {
      t.questions.forEach(q => { delete s.progress.confidence[q.id]; removeReview(s, q.id); });
      delete s.progress.topics[t.id];
      save(); refresh(); toast('Cleared this topic');
    });
    $('#addQ').addEventListener('click', () => openQuestionEditor(t.id, null));

    $('#drawerBody').querySelectorAll('.js-qcheck').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      const qid = el.dataset.qid;
      const cur = s.progress.confidence[qid];
      const next = !cur ? 'know' : (cur === 'know' ? 'fuzzy' : cur === 'fuzzy' ? 'dontknow' : null);
      if (!next) delete s.progress.confidence[qid]; else s.progress.confidence[qid] = next;
      if (next) scheduleReview(s, qid, next); else removeReview(s, qid);
      save(); refresh();
    }));
    $('#drawerBody').querySelectorAll('.js-edit-q').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation(); openQuestionEditor(t.id, el.dataset.qid);
    }));
    $('#drawerBody').querySelectorAll('.q-head').forEach(el => el.addEventListener('click', () => {
      const item = el.closest('.q-item');
      item.classList.toggle('open');
      const hint = el.querySelector('.q-toggle-hint');
      if (hint) hint.textContent = item.classList.contains('open')
        ? (prefs.selfTest ? 'Tap to hide answer' : 'Tap to hide answer & steps') + ' ▴'
        : (prefs.selfTest ? 'Tap to reveal answer & rate' : 'Tap to show answer & steps') + ' ▾';
    }));
    $('#drawerBody').querySelectorAll('.rate-btn').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      const qid = el.dataset.qid, rating = el.dataset.rate;
      const cur = s.progress.confidence[qid];
      if (cur === rating) { delete s.progress.confidence[qid]; removeReview(s, qid); }
      else { s.progress.confidence[qid] = rating; scheduleReview(s, qid, rating); }
      save(); refresh();
    }));

    // formulas: render once with KaTeX (load it lazily if this topic uses formulas), toggle veils on click
    const formulaNodes = $$('#drawerBody .formula-math');
    if (formulaNodes.length) {
      ensureKaTeX().then(() => {
        formulaNodes.forEach(el => {
          const tex = el.getAttribute('data-tex') || '';
          try { window.katex.render(tex, el, { throwOnError: false, displayMode: false, output: 'html' }); }
          catch (e) { el.textContent = tex; }
        });
      }).catch(() => formulaNodes.forEach(el => { el.textContent = el.getAttribute('data-tex') || ''; }));
    }
    $$('#drawerBody .formula-item').forEach(btn => btn.addEventListener('click', () => {
      const hiddenNow = btn.classList.toggle('formula-hidden');
      btn.setAttribute('aria-pressed', String(!hiddenNow));
    }));
    const setAll = (hidden) => $$('#drawerBody .formula-item').forEach(b => {
      b.classList.toggle('formula-hidden', hidden);
      b.setAttribute('aria-pressed', String(!hidden));
    });
    const revealAll = $('#revealFormulas'); if (revealAll) revealAll.addEventListener('click', () => setAll(false));
    const hideAll = $('#hideFormulas'); if (hideAll) hideAll.addEventListener('click', () => setAll(true));

    // focus requested question (review jump)
    if (currentFocusQ) {
      const target = $('#drawerBody .q-item[data-qid="' + CSS.escape(currentFocusQ) + '"]');
      if (target) {
        target.classList.add('open');
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      }
      currentFocusQ = null;
    }
  }

  /* ---------------- modal helpers ---------------- */
  function openModal(html, opts) {
    opts = opts || {};
    $('#modalContent').innerHTML = html;
    $('#modal').classList.toggle('wide', !!opts.wide);
    $('#modalOverlay').hidden = false;
    // Point aria-labelledby at the heading we just rendered so screen readers can read it
    const modal = $('#modal');
    const heading = modal.querySelector('h2, h3');
    if (heading && !heading.id) heading.id = 'modalTitle';
    const first = $('#modalContent input, #modalContent textarea, #modalContent select');
    if (first && opts.focus !== false) setTimeout(() => first.focus(), 30);
  }
  function closeModal() {
    $('#modalOverlay').hidden = true;
    $('#modalContent').innerHTML = '';
    $('#modal').classList.remove('wide');
  }

  /* ---------------- refresh ---------------- */
  function refresh() {
    ensureIds();
    const s = active();
    if (s) recordScoreChange(s);
    populateSelect();
    renderSubject();
    if (drawerTopicId) {
      if (!s || !s.topics.some(t => t.id === drawerTopicId)) closeDrawer();
      else renderDrawer();
    }
    refreshBadges();
  }

  /* ---------------- subject editor ---------------- */
  function openSubjectEditor() {
    const s = active(); if (!s) return;
    openModal(`
      <h2>Edit subject</h2>
      <p class="muted small">These values drive the score prediction and the exam countdown.</p>
      <form id="subjectForm" novalidate>
        <div class="form-grid">
          <div class="field full"><label for="sf-name">Subject name</label><input id="sf-name" name="name" required value="${esc(s.name)}" autocomplete="off"></div>
          <div class="field"><label for="sf-code">Course code</label><input id="sf-code" name="code" value="${esc(s.code)}" autocomplete="off"></div>
          <div class="field full"><label for="sf-examDate">Exam date &amp; time</label><input id="sf-examDate" name="examDate" type="datetime-local" value="${esc(s.examDate || '')}"></div>
          <div class="field"><label for="sf-examTotal">Exam total marks</label><input id="sf-examTotal" name="examTotal" type="number" min="1" step="1" value="${esc(s.examTotal)}"></div>
          <div class="field"><label for="sf-target">Target marks</label><input id="sf-target" name="target" type="number" min="0" step="1" value="${esc(s.target)}"></div>
          <div class="field full"><label for="sf-desc">Description</label><textarea id="sf-desc" name="description" rows="2" autocomplete="off">${esc(s.description)}</textarea></div>
        </div>
        <p class="form-error" role="alert" tabindex="-1"></p>
        <div class="modal-actions">
          <button class="btn btn-danger" id="deleteSubject" type="button">Delete subject</button>
          <button class="btn btn-outline" type="button" data-close>Cancel</button>
          <button class="btn btn-primary" type="submit">Save</button>
        </div>
      </form>`);
    $('#subjectForm').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const errBox = f.querySelector('.form-error');
      const showErr = (msg) => { errBox.textContent = msg; errBox.classList.add('is-show'); errBox.focus(); };
      const name = f.name.value.trim();
      const examTotal = num(f.examTotal.value, 0);
      if (!name) return showErr('Enter a subject name.');
      if (!Number.isFinite(examTotal) || examTotal < 1) return showErr('Exam total must be at least 1.');
      const target = Math.max(0, num(f.target.value, 0));
      if (target > examTotal) return showErr('Target cannot exceed the exam total.');
      s.name = name;
      s.code = f.code.value.trim();
      s.examDate = normExamDate(f.examDate.value);
      s.examTotal = examTotal;
      s.target = target;
      s.description = f.description.value.trim();
      save(); closeModal(); refresh(); toast('Subject updated');
    });
    $('#deleteSubject').addEventListener('click', () => {
      if (!confirm(`Delete "${s.name}" and all its progress? This cannot be undone.`)) return;
      state.subjects = state.subjects.filter(x => x.id !== s.id);
      state.activeId = state.subjects[0] ? state.subjects[0].id : null;
      save(); closeModal(); closeDrawer(); refresh(); toast('Subject deleted');
    });
  }

  /* ---------------- topic editor ---------------- */
  function openTopicEditor(tid) {
    const s = active(); if (!s) return;
    const t = tid ? s.topics.find(x => x.id === tid) : null;
    openModal(`
      <h2>${t ? 'Edit topic' : 'New topic'}</h2>
      <form id="topicForm" novalidate>
        <div class="form-grid">
          <div class="field full"><label for="tf-title">Topic title</label><input id="tf-title" name="title" required value="${t ? esc(t.title) : ''}" autocomplete="off"></div>
          <div class="field"><label for="tf-marks">Marks</label><input id="tf-marks" name="marks" type="number" min="0" step="1" value="${t ? esc(t.marks) : 1}"></div>
          <div class="field"><label for="tf-rank">Study rank</label><input id="tf-rank" name="rank" type="number" min="0" step="1" value="${t ? esc(t.rank) : s.topics.length + 1}"></div>
          <div class="field full"><label for="tf-concepts">Key concepts &amp; steps to remember</label>
            <textarea id="tf-concepts" name="concepts" rows="8" placeholder="One concept per line" autocomplete="off">${t ? esc(t.concepts.join('\n')) : ''}</textarea>
            <span class="hint">One per line. These appear when you open the topic.</span>
          </div>
        </div>
        <p class="form-error" role="alert" tabindex="-1"></p>
        <div class="modal-actions">
          ${t ? '<button class="btn btn-danger" id="deleteTopic" type="button">Delete topic</button>' : ''}
          <button class="btn btn-outline" type="button" data-close>Cancel</button>
          <button class="btn btn-primary" type="submit">${t ? 'Save' : 'Add topic'}</button>
        </div>
      </form>`);
    $('#topicForm').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const errBox = f.querySelector('.form-error');
      const showErr = (msg) => { errBox.textContent = msg; errBox.classList.add('is-show'); errBox.focus(); };
      const title = f.title.value.trim();
      if (!title) return showErr('Enter a topic title.');
      const concepts = f.concepts.value.split('\n').map(x => x.trim()).filter(Boolean);
      if (t) {
        t.title = title;
        t.marks = Math.max(0, num(f.marks.value, 1));
        t.rank = Math.max(0, num(f.rank.value, t.rank));
        t.concepts = concepts;
      } else {
        s.topics.push({
          id: uid('t'),
          seq: s.topics.length + 1,
          title,
          marks: Math.max(0, num(f.marks.value, 1)),
          rank: Math.max(0, num(f.rank.value, s.topics.length + 1)),
          concepts, questions: [],
        });
      }
      save(); closeModal(); refresh(); toast(t ? 'Topic updated' : 'Topic added');
    });
    if (t) $('#deleteTopic').addEventListener('click', () => {
      if (!confirm(`Delete topic "${t.title}" and its ${t.questions.length} questions?`)) return;
      t.questions.forEach(q => { delete s.progress.confidence[q.id]; removeReview(s, q.id); });
      delete s.progress.topics[t.id];
      s.topics = s.topics.filter(x => x.id !== t.id);
      save(); closeModal(); closeDrawer(); refresh(); toast('Topic deleted');
    });
  }

  /* ---------------- question editor ---------------- */
  function flattenQuestion(q) {
    if (q.blocks && q.blocks.length) {
      const ans = [], code = [];
      q.blocks.forEach(b => { if (b.type === 'code') code.push(b.text); else ans.push(b.text); });
      return { answer: ans.join('\n'), steps: '', code: code.join('\n\n') };
    }
    return { answer: (q.answer || []).join('\n'), steps: (q.steps || []).join('\n'), code: q.code || '' };
  }

  function openQuestionEditor(tid, qid) {
    const s = active(); if (!s) return;
    const t = s.topics.find(x => x.id === tid); if (!t) return;
    const q = qid ? t.questions.find(x => x.id === qid) : null;
    const flat = q ? flattenQuestion(q) : { answer: '', steps: '', code: '' };
    openModal(`
      <h2>${q ? 'Edit question' : 'New question'}</h2>
      <form id="qForm" novalidate>
        <div class="form-grid">
          <div class="field full"><label for="qf-question">Question</label><textarea id="qf-question" name="question" rows="3" required autocomplete="off">${q ? esc(q.question) : ''}</textarea></div>
          <div class="field"><label for="qf-marks">Marks</label><input id="qf-marks" name="marks" type="number" min="0" step="1" value="${q ? esc(q.marks) : 1}"></div>
          <div class="field"><label for="qf-source">Source / paper</label><input id="qf-source" name="source" value="${q ? esc(q.source) : ''}" placeholder="e.g. 2024 Q2" autocomplete="off"></div>
          <div class="field full"><label for="qf-answer">Answer</label><textarea id="qf-answer" name="answer" rows="5" placeholder="One paragraph per line" autocomplete="off">${esc(flat.answer)}</textarea></div>
          <div class="field full"><label for="qf-steps">Steps to remember</label><textarea id="qf-steps" name="steps" rows="4" placeholder="One step per line" autocomplete="off">${esc(flat.steps)}</textarea></div>
          <div class="field full"><label for="qf-code">Code / trace / diagram (optional)</label><textarea id="qf-code" name="code" rows="4" style="font-family:'JetBrains Mono',monospace;font-size:12px" autocomplete="off">${esc(flat.code)}</textarea></div>
        </div>
        <p class="form-error" role="alert" tabindex="-1"></p>
        <div class="modal-actions">
          ${q ? '<button class="btn btn-danger" id="deleteQ" type="button">Delete question</button>' : ''}
          <button class="btn btn-outline" type="button" data-close>Cancel</button>
          <button class="btn btn-primary" type="submit">${q ? 'Save' : 'Add question'}</button>
        </div>
      </form>`, { wide: true });
    $('#qForm').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const errBox = f.querySelector('.form-error');
      const showErr = (msg) => { errBox.textContent = msg; errBox.classList.add('is-show'); errBox.focus(); };
      const question = f.question.value.trim();
      if (!question) return showErr('Write the question text first.');
      const marks = Math.max(0, num(f.marks.value, 1));
      const data = {
        question,
        marks,
        source: f.source.value.trim(),
        answer: f.answer.value.split('\n').map(x => x.trim()).filter(Boolean),
        steps: f.steps.value.split('\n').map(x => x.trim()).filter(Boolean),
        code: f.code.value.trim(),
        blocks: null,
      };
      if (q) Object.assign(q, data);
      else t.questions.push(Object.assign({ id: uid('q') }, data));
      save(); closeModal(); refresh(); toast(q ? 'Question updated' : 'Question added');
    });
    if (q) $('#deleteQ').addEventListener('click', () => {
      if (!confirm('Delete this question?')) return;
      delete s.progress.confidence[q.id]; removeReview(s, q.id);
      t.questions = t.questions.filter(x => x.id !== q.id);
      save(); closeModal(); refresh(); toast('Question deleted');
    });
  }
  /* ---------------- parsing ---------------- */
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
      } else return rows;
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

  /* ---------------- import wizard ---------------- */
  const wz = { step: 1, parsed: null, fileName: '', error: '', busy: false, answers: null };

  function openWizard() {
    wz.step = 1; wz.parsed = null; wz.fileName = ''; wz.error = ''; wz.busy = false; wz.answers = null;
    renderWizard();
  }

  function renderStepper(step) {
    return `<div class="wizard-steps">
      <div class="wstep ${step === 1 ? 'active' : (step > 1 ? 'done' : '')}"><i>1</i> Exam window</div>
      <div class="wstep ${step === 2 ? 'active' : (step > 2 ? 'done' : '')}"><i>2</i> Copy prompt</div>
      <div class="wstep ${step === 3 ? 'active' : (step > 3 ? 'done' : '')}"><i>3</i> Upload PDF</div>
      <div class="wstep ${step === 4 ? 'active' : ''}"><i>4</i> Review &amp; import</div>
    </div>`;
  }

  function renderWizard() {
    const step = wz.step;
    const stepsHtml = renderStepper(step);

    if (step === 1) {
      const full = state.subjects.length >= MAX_SUBJECTS;
      // sensible default: exam 14 days from today at 09:00
      const pad = (n) => String(n).padStart(2, '0');
      const d = new Date(); d.setDate(d.getDate() + 14);
      const defaultDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      openModal(`<h2>First, your exam window</h2>
        <p class="muted small">Tell us when your exam is and how many effective hours you actually have. The prompt will be tailored to your situation — no boilerplate. Already have a plan file from your agent? Skip and upload it now.</p>
        ${full ? `<div class="banner banner-warn">You already have ${MAX_SUBJECTS} subjects (the maximum). You can still prepare the prompt, but you'll need to delete one under <strong>Manage</strong> before importing.</div>` : ''}
        ${stepsHtml}
        <div class="quick-picks" id="quickPicks" aria-label="Quick date presets">
          <button type="button" class="qp-chip" data-days="1">Tomorrow</button>
          <button type="button" class="qp-chip" data-days="7">+1 week</button>
          <button type="button" class="qp-chip" data-days="14">+2 weeks</button>
          <button type="button" class="qp-chip" data-days="30">+1 month</button>
          <button type="button" class="qp-chip" data-days="60">+2 months</button>
          <button type="button" class="qp-chip" data-days="90">+3 months</button>
        </div>
        <form id="preflightForm" novalidate>
          <div class="form-grid">
            <div class="field"><label for="pf-date">Exam date</label><input id="pf-date" name="examDate" type="date" value="${defaultDate}" autocomplete="off"></div>
            <div class="field"><label for="pf-time">Exam time</label><input id="pf-time" name="examTime" type="time" value="09:00" autocomplete="off"></div>
            <div class="field"><label for="pf-hours">Effective hours</label><input id="pf-hours" name="hours" type="number" min="1" max="300" step="1" inputmode="numeric" autocomplete="off"></div>
            <div class="field"><label for="pf-target">Target marks</label><input id="pf-target" name="target" type="number" min="1" max="500" step="1" inputmode="numeric" value="30" autocomplete="off"></div>
          </div>
          <p class="mode-hint" id="modeHint" aria-live="polite"></p>
          <p class="form-error" id="preflightError" role="alert" tabindex="-1"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-outline" data-close>Cancel</button>
            <button type="submit" class="btn btn-primary">Generate my prompt →</button>
          </div>
        </form>
        <button class="skip-preflight" id="skipPreflight" type="button">Already have a plan file from your agent? Skip the prompt and upload directly →</button>`, { wide: true });
      // quick-pick chips set the date field
      document.querySelectorAll('#quickPicks .qp-chip').forEach(btn => btn.addEventListener('click', () => {
        const days = Number(btn.dataset.days) || 0;
        const t = new Date(); t.setDate(t.getDate() + days);
        const pad2 = (n) => String(n).padStart(2, '0');
        const v = `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
        const dateEl = document.querySelector('#pf-date');
        dateEl.value = v; dateEl.focus();
        const timeEl = document.querySelector('#pf-time'); if (timeEl && !timeEl.value) timeEl.value = '09:00';
      }));
      // skip button: jump straight to upload step with no prompt
      $('#skipPreflight').addEventListener('click', () => { wz.answers = null; wz.step = 3; renderWizard(); });
      const hoursEl = document.querySelector('#pf-hours');
      const hintEl = document.querySelector('#modeHint');
      const updateHint = () => {
        const h = Number(hoursEl.value) || 0;
        const mode = modeFor(h);
        hintEl.innerHTML = `Mode: <strong>${esc(mode.label)}</strong> — ${esc(mode.blurb)}`;
      };
      hoursEl.addEventListener('input', updateHint); updateHint();
      $('#preflightForm').addEventListener('submit', e => {
        e.preventDefault();
        const form = e.target;
        const err = document.querySelector('#preflightError');
        const showErr = m => { err.textContent = m; err.classList.add('is-show'); err.focus(); };
        const date = form.examDate.value;
        const time = form.examTime.value || '09:00';
        const hours = Math.round(Number(form.hours.value));
        const target = Math.round(Number(form.target.value));
        if (!date) return showErr('Pick the exam date (use a quick link if easier).');
        if (!Number.isFinite(hours) || hours < 1 || hours > 300) return showErr('Enter the effective hours you can realistically study (1 – 300).');
        if (!Number.isFinite(target) || target < 1 || target > 500) return showErr('Enter target marks between 1 and 500.');
        wz.answers = { examDate: `${date}T${time}`, effectiveHours: hours, target };
        wz.step = 2;
        renderWizard();
      });
      return;
    }

    if (step === 2) {
      const answers = wz.answers;
      if (!answers) { wz.step = 1; renderWizard(); return; }
      const full = state.subjects.length >= MAX_SUBJECTS;
      const promptText = buildAgentPrompt(answers);
      const dateLabel = (() => {
        try { const d = new Date(answers.examDate + ':00'); return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
        catch (e) { return answers.examDate; }
      })();
      const modeLabel = modeFor(answers.effectiveHours).label;
      openModal(`<h2>Your tailored prompt is ready</h2>
        <p class="muted small">Paste it into Gemini, Claude, ChatGPT or any chat agent — with your syllabus, PYQs and notes in the same message. The agent will print out a marker block; copy it as-is or tell it to emit a file. All parsing is local.</p>
        <div class="preflight-strip" aria-label="Your parameters">
          <div><span class="ps-label">Exam</span><strong>${esc(dateLabel)}</strong></div>
          <div><span class="ps-label">Hours</span><strong>${esc(answers.effectiveHours)}</strong></div>
          <div><span class="ps-label">Target</span><strong>${esc(answers.target)}</strong></div>
          <div><span class="ps-label">Mode</span><strong>${esc(modeLabel)}</strong></div>
        </div>
        ${full ? `<div class="banner banner-warn">You already have ${MAX_SUBJECTS} subjects (the maximum). Delete one under <strong>Manage</strong> to import the PDF once it's generated.</div>` : ''}
        ${stepsHtml}
        <h3>What to attach with the prompt</h3>
        <ul class="attach-list">${ATTACHMENTS.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
        <h3>Your prompt</h3>
        <pre class="prompt-box" id="promptBox">${esc(promptText)}</pre>
        <div class="copy-row">
          <button class="btn btn-primary" id="copyPrompt" type="button">Copy prompt</button>
          <button class="btn btn-outline" id="downloadPrompt" type="button">Download (.txt)</button>
          <button class="btn btn-outline" id="editPreflight" type="button">Edit parameters</button>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" type="button" data-close>Cancel</button>
          <button class="btn btn-primary" id="toUpload" type="button" ${full ? 'disabled' : ''}>Next: upload plan →</button>
        </div>`, { wide: true });
      $('#copyPrompt').addEventListener('click', () => copyText(promptText).then(() => toast('Prompt copied to clipboard')));
      $('#downloadPrompt').addEventListener('click', () => download('study-hub-agent-prompt.txt', promptText + '\n\nATTACH THESE:\n' + ATTACHMENTS.map(a => '- ' + a).join('\n')));
      $('#editPreflight').addEventListener('click', () => { wz.step = 1; renderWizard(); });
      $('#toUpload').addEventListener('click', () => { wz.step = 3; renderWizard(); });
      return;
    }

    if (step === 3) {
      openModal(`<h2>Upload your study plan</h2>
        <p class="muted small">Drop a study-guide <code>.pdf</code> or the <code>.txt</code>, <code>.md</code> or <code>.json</code> your agent printed out. Ordinary PDFs work too — the app reads their headings, facts and solved questions. Everything is parsed offline.</p>
        <div class="banner banner-info" style="margin-top:10px"><strong>Copy-paste route (ChatGPT / Gemini free tier):</strong> if it printed the marker block inline in the chat, select everything from <code>@@STUDY_TRACKER</code> to <code>@@END</code>, paste into Notepad, save as <code>myplan.txt</code>, upload here.</div>
        ${stepsHtml}
        <div class="dropzone" id="dropzone" role="button" tabindex="0" aria-label="Upload a PDF, JSON, Markdown or text file">
          <div class="dz-icon">📄</div>
          <strong>Click to choose a file, or drag it here</strong>
          <span>PDF, JSON, Markdown or text · parsed locally</span>
        </div>
        ${wz.busy ? '<div class="banner banner-info">Reading and parsing the file…</div>' : ''}
        ${wz.error ? `<div class="banner banner-error">${esc(wz.error)}</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-outline" id="wzBack" type="button">← Back to prompt</button>
        </div>`, { wide: true });
      const dz = $('#dropzone');
      const openPicker = () => $('#pdfInput').click();
      dz.addEventListener('click', openPicker);
      dz.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
      });
      ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', e => {
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleImportFile(f);
      });
      $('#wzBack').addEventListener('click', () => { wz.step = 2; renderWizard(); });
      return;
    }

    // step 4 preview
    const p = wz.parsed;
    if (!p) { wz.step = 3; renderWizard(); return; }
    const qCount = p.topics.reduce((n, t) => n + t.questions.length, 0);
    const cCount = p.topics.reduce((n, t) => n + t.concepts.length, 0);
    const full = state.subjects.length >= MAX_SUBJECTS;
    openModal(`<h2>Review &amp; import</h2>
      ${stepsHtml}
      ${wz.fileName ? `<div class="file-info"><strong>${esc(wz.fileName)}</strong><span class="muted">parsed locally</span></div>` : ''}
      <div class="preview-stat">
        <div><b>${p.topics.length}</b><span>Topics</span></div>
        <div><b>${qCount}</b><span>Questions</span></div>
        <div><b>${cCount}</b><span>Concepts</span></div>
        <div><b>${p.examTotal}</b><span>Exam marks</span></div>
      </div>
      <div class="banner ${p.topics.length ? 'banner-ok' : 'banner-warn'}">
        <strong>${esc(p.name)}</strong>${p.code ? ' · ' + esc(p.code) : ''}<br>
        ${p.topics.length ? 'Looks good. Import it and start tracking. You can edit everything afterwards.' : 'No topics were found. Check the file and try again.'}
      </div>
      ${full ? `<div class="banner banner-warn">You already have ${MAX_SUBJECTS} subjects (the maximum). Delete one under <strong>Manage</strong> first.</div>` : ''}
      <div class="modal-actions">
        <button class="btn btn-outline" id="wzBack2" type="button">← Upload another</button>
        <button class="btn btn-primary" id="doImport" type="button" ${(!p.topics.length || full) ? 'disabled' : ''}>Import subject</button>
      </div>`, { wide: true, focus: false });
    $('#wzBack2').addEventListener('click', () => { wz.step = 3; wz.error = ''; renderWizard(); });
    const di = $('#doImport');
    if (di) di.addEventListener('click', doImport);
  }

  async function handleImportFile(file) {
    wz.busy = true; wz.error = ''; wz.fileName = file.name;
    renderWizard();
    try {
      const name = file.name.replace(/\.[^.]+$/, '');
      let parsed;
      if (/\.pdf$/i.test(file.name)) {
        const text = await pdfToText(file);
        parsed = parseAnyText(text, name);
      } else if (/\.json$/i.test(file.name)) {
        const text = await file.text();
        let obj;
        try { obj = JSON.parse(text); } catch (e) { throw new Error('That JSON file is not valid.'); }
        parsed = normalizeSubject(Array.isArray(obj) ? { topics: obj, name } : obj);
        if (!parsed.topics.length) throw new Error('No topics found in the JSON file.');
      } else {
        const text = await file.text();
        parsed = parseAnyText(text, name);
      }
      if (!parsed.name || parsed.name === 'Untitled subject') parsed.name = name;
      wz.parsed = parsed; wz.busy = false; wz.step = 4;
      renderWizard();
    } catch (e) {
      console.error(e);
      wz.busy = false; wz.error = e && e.message ? e.message : 'Could not read that file.';
      renderWizard();
    }
  }

  function doImport() {
    const p = wz.parsed;
    if (!p) return;
    if (state.subjects.length >= MAX_SUBJECTS) { toast('Maximum of ' + MAX_SUBJECTS + ' subjects reached'); return; }
    p.id = uid('sub'); p.createdAt = new Date().toISOString();
    p.progress = { topics: {}, confidence: {}, review: {}, history: [] };
    state.subjects.push(p);
    state.activeId = p.id;
    save(); closeModal();
    viewState.query = ''; viewState.filter = 'all';
    refresh(); toast('Subject imported');
  }

  /* ---------------- manage subjects ---------------- */
  function openSubjectsModal() {
    const rows = state.subjects.map(s => {
      const st = subjectStats(s);
      return `<div class="subject-item ${s.id === state.activeId ? 'active' : ''}">
        <div class="si-main">
          <strong>${esc(s.name)}${s.id === state.activeId ? ' · active' : ''}</strong>
          <span>${s.topics.length} topics · ${st.qTotal} questions · predicted ${st.score}/${s.examTotal}</span>
        </div>
        <div class="si-actions">
          <button class="btn btn-outline btn-sm" data-open="${esc(s.id)}" type="button">Open</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(s.id)}" type="button">Delete</button>
        </div>
      </div>`;
    }).join('') || '<p class="muted small">No subjects yet.</p>';
    openModal(`<h2>Manage subjects</h2>
      <p class="muted small">You can keep up to ${MAX_SUBJECTS} subjects. Each has its own progress and review history.</p>
      <div class="subject-list">${rows}</div>
      <div class="modal-actions">
        <button class="btn btn-outline" type="button" data-close>Close</button>
        <button class="btn btn-primary" id="manageAdd" type="button" ${state.subjects.length >= MAX_SUBJECTS ? 'disabled' : ''}>+ Add subject</button>
      </div>`);
    $$('#modalContent [data-open]').forEach(b => b.addEventListener('click', () => {
      state.activeId = b.dataset.open; save(); closeModal(); closeDrawer(); refresh();
    }));
    $$('#modalContent [data-del]').forEach(b => b.addEventListener('click', () => {
      const s = state.subjects.find(x => x.id === b.dataset.del); if (!s) return;
      if (!confirm(`Delete "${s.name}" and all its progress?`)) return;
      state.subjects = state.subjects.filter(x => x.id !== s.id);
      if (state.activeId === s.id) state.activeId = state.subjects[0] ? state.subjects[0].id : null;
      save(); closeDrawer(); refresh(); openSubjectsModal(); toast('Subject deleted');
    }));
    const add = $('#manageAdd'); if (add) add.addEventListener('click', () => { closeModal(); openWizard(); });
  }
  /* ---------------- help & backup ---------------- */
  function openHelp() {
    openModal(`<h2>How Study Hub works</h2>
      <p class="muted small">Study Hub is a <strong>study progress tracker, not a place to study from</strong>. Do your learning from your notes, slides and previous-year papers; use this app to track topics, rate questions and watch your predicted score.</p>
      <ul>
        <li><strong>Bring your own plan.</strong> Click “Agent prompt” → fill in your exam date/time, effective hours and target marks → paste the tailored prompt into any LLM (Gemini, Claude, ChatGPT, Llama) → attach your syllabus + PYQs + notes to the same message → save whatever it prints out as <code>.txt</code> → this app parses it offline.</li>
        <li><strong>Everything is local.</strong> File parsing and storage happen in this browser. No server, no uploads.</li>
        <li><strong>Rate, don’t just tick.</strong> Every question gets “Got it / Fuzzy / Didn't get it”. Your predicted score is weighted by marks <em>and</em> confidence.</li>
        <li><strong>Spaced repetition.</strong> “Got it” schedules the question 1 → 3 → 7 → 15… days out; “Fuzzy” gets it back sooner; “Didn't get it” is due in 10 minutes. Tap <em>Reviews</em> to drill what’s due.</li>
        <li><strong>Formulas, hidden until you reveal.</strong> Topics with formulas show “Key formulas” in the drawer — tap to flip them as you study (blind recall). Reveal all / hide all available.</li>
        <li><strong>Progress page.</strong> Open <em>Progress</em> in the top bar for a chart of how your predicted score has moved over time.</li>
        <li><strong>Self-test.</strong> A toggle that hides the answer panel until you reveal it — active recall before you see it.</li>
        <li><strong>Exam countdown.</strong> Set the exam date in Edit subject to get a daily pace for finishing everything.</li>
        <li><strong>Print sheet.</strong> Generates a printable revision sheet (concepts + formulas + all Q&amp;A) for the active subject.</li>
        <li><strong>Up to ${MAX_SUBJECTS} subjects.</strong> Manage them from the top bar.</li>
        <li><strong>Backups.</strong> Use <em>Export</em> to save a JSON file and <em>Restore</em> to load it on another machine.</li>
      </ul>
      <div class="modal-actions"><button class="btn btn-primary" type="button" data-close>Got it</button></div>`);
  }

  function exportBackup() {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`study-hub-backup-${stamp}.json`, JSON.stringify(state, null, 2), 'application/json');
    toast('Backup downloaded');
  }

  async function importBackup(file) {
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      if (obj && Array.isArray(obj.subjects)) {
        if (!confirm('Replace all current subjects with this backup?')) return;
        state = { subjects: obj.subjects.map(normalizeSubject), activeId: obj.activeId || null };
      } else if (obj && (Array.isArray(obj.topics) || obj.subject)) {
        if (state.subjects.length >= MAX_SUBJECTS) { toast('Maximum subjects reached'); return; }
        const s = normalizeSubject(obj);
        s.id = uid('sub');
        state.subjects.push(s);
        state.activeId = s.id;
      } else {
        throw new Error('Unrecognised backup file');
      }
      ensureIds(); save(); refresh(); toast('Backup imported');
    } catch (e) {
      console.error(e);
      toast('Could not import that backup');
    }
  }

  /* ---------------- sample ---------------- */
  function addSample() {
    if (state.subjects.length >= MAX_SUBJECTS) { toast('Maximum subjects reached'); return; }
    const s = normalizeSubject(JSON.parse(JSON.stringify(SAMPLE_SUBJECT)));
    s.id = uid('sub');
    s.progress = { topics: {}, confidence: {}, review: {}, history: [] };
    state.subjects.push(s); state.activeId = s.id;
    save(); refresh();
  }

  /* ---------------- print revision sheet ---------------- */
  async function printRevisionSheet() {
    const s = active(); if (!s) return;
    try {
      $('#printSheet').innerHTML = buildPrintSheet(s);
      await ensureKaTeX();
      $('#printSheet').innerHTML = buildPrintSheet(s);
      window.print();
    } catch (e) { toast('Could not open the print dialog'); }
  }

  function buildPrintSheet(s) {
    const st = subjectStats(s);
    return `
      <h1>${esc(s.name)}</h1>
      <p class="print-sub">${s.code ? esc(s.code) + ' · ' : ''}${esc(s.description || 'Revision sheet')} · Exam total ${s.examTotal} · Target ${s.target}${s.examDate ? ' · Exam ' + esc(fmtDate(s.examDate)) : ''} · Printed ${new Date().toLocaleDateString()}</p>
      ${s.topics.map(t => {
        const qs = t.questions.map((q, i) => {
          const conf = s.progress.confidence[q.id];
          const confTag = conf ? CONF_LABEL[conf] : 'Not rated';
          const ans = printQuestionBody(q);
          return `<div class="qa print-q">
            <div class="pq-meta">Q${i + 1} · ${esc(q.marks)} marks${q.source ? ' · ' + esc(q.source) : ''} · ${esc(confTag)}</div>
            <div class="pq-q">${esc(q.question)}</div>
            ${ans}
          </div>`;
        }).join('');
        const formulaHtml = (t.formulas && t.formulas.length)
          ? `<div class="print-formulas">${t.formulas.map(f => {
              try {
                const h = window.katex ? window.katex.renderToString(f, { throwOnError: false, displayMode: false }) : esc(f);
                return `<div class="print-formula">${h}</div>`;
              } catch (e) { return `<div class="print-formula">${esc(f)}</div>`; }
            }).join('')}</div>`
          : '';
        return `<section class="print-topic">
          <h2>${esc(t.title)} <span style="color:#555;font-weight:600;font-size:12px">· ${t.everyPaper ? esc(t.marks) + ' marks · EVERY PAPER' : esc(t.marksLabel || String(t.marks))} · Rank #${esc(t.rank)}</span></h2>
          ${t.concepts.length ? `<ul style="margin:0 0 8px;padding-left:20px">${t.concepts.map(c => `<li style="font-size:13px;margin-bottom:3px">${esc(c)}</li>`).join('')}</ul>` : ''}
          ${formulaHtml}
          ${qs}
        </section>`;
      }).join('')}
      <div class="print-foot">Study Hub · ${esc(s.name)} · ${st.topicsDone}/${s.topics.length} topics complete · ${st.score}/${s.examTotal} predicted. Generated from this browser.</div>`;
  }

  function printQuestionBody(q) {
    let html = '';
    if (q.blocks && q.blocks.length) html += renderBlocks(q.blocks);
    else {
      (q.answer || []).forEach(a => { if (a) html += `<p class="blk-p">${esc(a)}</p>`; });
      if (q.steps && q.steps.length) html += `<ol class="steps" style="margin-top:2px">${q.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
      if (q.code) html += `<pre class="blk-code">${esc(q.code)}</pre>`;
    }
    return html;
  }

  /* ---------------- review queue ---------------- */
  function openReviewQueue() {
    const s = active(); if (!s) return;
    const now = Date.now();
    const items = s.topics.flatMap(t => t.questions
      .filter(q => s.progress.confidence[q.id])
      .map(q => ({
        qid: q.id,
        topicId: t.id,
        topicTitle: t.title,
        question: q.question,
        conf: s.progress.confidence[q.id],
        due: Number((s.progress.review[q.id] || {}).due) || 0,
      })));
    items.sort((a, b) => a.due - b.due);
    const dueNow = items.filter(i => i.due <= now);
    const upcoming = items.filter(i => i.due > now);
    const all = [...dueNow, ...upcoming];

    const body = !items.length
      ? `<div class="review-empty"><h3>Nothing to review yet</h3><p class="muted">Rate some questions “Got it”, “Fuzzy” or “Didn't get it” and they’ll come back here on a schedule.</p></div>`
      : `<div class="review-list">${all.map(i => `
            <button class="review-item" data-topic="${esc(i.topicId)}" data-qid="${esc(i.qid)}" type="button">
              <span class="ri-main"><span class="ri-topic">${esc(i.topicTitle)} · ${CONF_LABEL[i.conf]}</span><span class="ri-q">${esc(i.question)}</span></span>
              <span class="ri-due ${i.due <= now ? 'due-now' : ''}">${i.due <= now ? 'Due now' : (i.due - now < 3600000 ? 'Soon' : (i.due - now < 86400000 ? 'Later today' : fmtDue(i.due) + 'd'))}</span>
            </button>`).join('')}</div>`;

    openModal(`<h2>Spaced-repetition review</h2>
      <p class="muted small">“Got it” pushes a question further out (1 → 3 → 7 → 15… days). “Fuzzy” brings it back sooner. “Didn't get it” resets it. Tap one to jump to it.</p>
      ${items.length ? `<p class="muted small"><strong>${dueNow.length}</strong> due now · <strong>${upcoming.length}</strong> upcoming · ${items.length} rated in total</p>` : ''}
      ${body}`, { wide: true });

    $$('#modalContent .review-item').forEach(row => row.addEventListener('click', () => {
      const topicId = row.dataset.topic, qid = row.dataset.qid;
      closeModal();
      openDrawer(topicId, qid); // opens and renders with the question focused
    }));
  }

  /* ---------------- global events ---------------- */
  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) { closeModal(); return; }
    const toggle = e.target.closest('.js-toggle-topic');
    if (toggle) {
      e.stopPropagation();
      const s = active(); if (!s) return;
      const id = toggle.dataset.topic;
      if (s.progress.topics[id]) delete s.progress.topics[id]; else s.progress.topics[id] = true;
      save(); refresh(); toast(s.progress.topics[id] ? 'Topic marked complete' : 'Topic reopened');
      return;
    }
    const open = e.target.closest('.js-open-topic');
    if (open) { e.stopPropagation(); openDrawer(open.dataset.topic); return; }
    const card = e.target.closest('.topic-card');
    if (card) { openDrawer(card.dataset.topic); }
  });

  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('topic-card')) {
      e.preventDefault(); openDrawer(e.target.dataset.topic);
    }
    if (e.key === 'Escape') {
      if (!$('#modalOverlay').hidden) closeModal();
      else if (!$('#drawer').hidden) closeDrawer();
    }
  });

  /* topbar */
  $('#subjectSelect').addEventListener('change', e => {
    state.activeId = e.target.value; save(); closeDrawer();
    viewState.mode = 'tracker';
    refresh();
  });
  $('#addSubjectBtn').addEventListener('click', openWizard);
  $('#guideBtn').addEventListener('click', openWizard);
  $('#progressBtn').addEventListener('click', () => {
    viewState.mode = viewState.mode === 'progress' ? 'tracker' : 'progress';
    if (viewState.mode !== 'progress') closeDrawer();
    refresh();
  });
  $('#subjectsBtn').addEventListener('click', openSubjectsModal);
  $('#exportBtn').addEventListener('click', exportBackup);
  $('#helpBtn').addEventListener('click', openHelp);
  $('#importBackupBtn').addEventListener('click', () => $('#backupInput').click());
  $('#themeBtn').addEventListener('click', cycleTheme);
  $('#backupInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) importBackup(f);
    e.target.value = '';
  });
  $('#pdfInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleImportFile(f);
    e.target.value = '';
  });
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', e => { if (e.target === $('#modalOverlay')) closeModal(); });
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#drawerOverlay').addEventListener('click', closeDrawer);
  $('#drawerEdit').addEventListener('click', () => { if (drawerTopicId) openTopicEditor(drawerTopicId); });
  $('#drawerToggle').addEventListener('click', () => {
    const s = active(); if (!s || !drawerTopicId) return;
    if (s.progress.topics[drawerTopicId]) delete s.progress.topics[drawerTopicId];
    else s.progress.topics[drawerTopicId] = true;
    save(); refresh(); toast(s.progress.topics[drawerTopicId] ? 'Topic marked complete' : 'Topic reopened');
  });

  // keep multiple tabs in sync instead of overwriting newer data
  window.addEventListener('storage', e => {
    if (e.key !== LS_KEY || !e.newValue) return;
    try {
      const s = JSON.parse(e.newValue);
      if (s && Array.isArray(s.subjects)) {
        state = { subjects: s.subjects.map(normalizeSubject), activeId: s.activeId || null };
        refresh();
      }
    } catch (err) { /* ignore */ }
  });

  /* ---------------- init ---------------- */
  applyPrefs();
  ensureIds();
  if (!state.subjects.length && !localStorage.getItem('study-hub-seeded')) {
    const s = normalizeSubject(JSON.parse(JSON.stringify(SAMPLE_SUBJECT)));
    s.id = uid('sub');
    s.progress = { topics: {}, confidence: {}, review: {}, history: [] };
    state.subjects.push(s);
    state.activeId = s.id;
    localStorage.setItem('study-hub-seeded', '1');
    save();
  }
  ensureIds();
  save();
  populateSelect();
  renderSubject();
  refreshBadges();
})();
