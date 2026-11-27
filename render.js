/* Study Hub — render shell, topic grid, progress page, drawers, modals, print sheet, review queue. */
'use strict';

/* ---------------- render: shell ---------------- */
const viewState = { query: '', filter: 'all', sort: 'roi', mode: 'tracker' };
const openQuestions = new Set();
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
    const d = $('#cdD'), h = $('#cdH'), m = $('#cdM'), sec = $('#cdS');
    if (!d && !h && !m && !sec) { stopCountdown(); return; }
    const diff = target.getTime() - Date.now();
    if (diff <= 0) { [d, h, m, sec].forEach(x => { if (x) x.textContent = '00'; }); stopCountdown(); return; }
    if (d) {
      d.textContent = String(Math.floor(diff / 86400000));
      if (h) h.textContent = pad(Math.floor((diff % 86400000) / 3600000));
    } else if (h) h.textContent = pad(Math.floor(diff / 3600000));
    if (m) m.textContent = pad(Math.floor((diff % 3600000) / 60000));
    if (sec) sec.textContent = pad(Math.floor((diff % 60000) / 1000));
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
        <p class="summary-sub">Unlock your predicted score and the daily question pace you need to finish everything.</p>
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
        <span class="summary-sub">${esc(fmtDate(s.examDate))} has passed. Your ratings are still here.</span>
      </div>
    </section>`;
  }
  const perDay = remaining === 0 ? 0 : Math.ceil(remaining / Math.max(1, days));
  const pace = remaining === 0 ? 'All questions mastered' : (days === 0 ? 'Exam is today' : `≈${perDay} question${perDay === 1 ? '' : 's'} a day to finish`);
  const examAt = parseExamDate(s.examDate);
  const msLeft = examAt ? examAt.getTime() - Date.now() : 0;
  const urgent = msLeft <= 48 * 3600000;
  const cdBoxes = urgent
    ? `<div class="cd-box"><strong id="cdH">00</strong><span>Hours</span></div><div class="cd-box"><strong id="cdM">00</strong><span>Min</span></div><div class="cd-box"><strong id="cdS">00</strong><span>Sec</span></div>`
    : `<div class="cd-box"><strong id="cdD">0</strong><span>Days</span></div><div class="cd-box"><strong id="cdH">00</strong><span>Hours</span></div>`;
  return `<section class="summary-strip${urgent ? ' danger' : ''}" role="region" aria-label="Exam summary">
    <div class="summary-cell">
      <span class="summary-label">Exam in</span>
      <div class="cd-boxes" role="timer" aria-label="Time remaining until the exam">${cdBoxes}</div>
      <span class="summary-sub">${esc(fmtDate(s.examDate))} · ${esc(pace)}</span>
      <span class="summary-calm">Pace is a plan, not a deadline.</span>
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
      <img class="mark" src="icon.svg" alt="" aria-hidden="true" width="72" height="72">
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
  const noRatings = st.qDone === 0;
  const scorePill = noRatings
    ? '<span class="pill">Not rated yet</span>'
    : `<span class="pill ${st.score >= s.target ? 'pill-green' : (st.score >= s.target / 2 ? 'pill-teal' : 'pill-orange')}">${st.score >= s.target ? 'Goal reached' : (st.score >= s.target / 2 ? 'Within reach' : 'Short of goal')}</span>`;
  const goalPill = noRatings
    ? '<span class="pill">Not started</span>'
    : `<span class="pill ${remaining === 0 ? 'pill-green' : 'pill-orange'}">${remaining === 0 ? 'Secured' : 'In progress'}</span>`;
  const goalText = noRatings
    ? `Target ${s.target} marks`
    : (remaining === 0 ? `${s.target}-mark target LOCKED ✓` : `${remaining} mark${remaining === 1 ? '' : 's'} to go`);

  v.innerHTML = `
    <section class="subject-head">
      <div>
        <p class="sub">${s.code ? esc(s.code) + ' · ' : ''}${s.topics.length} topics · ${st.qTotal} questions${due ? ` · ${due} due for review` : ''}</p>
        <h2>${esc(s.name)}</h2>
        ${s.description ? `<div class="sub">${esc(s.description)}</div>` : ''}
      </div>
      <div class="head-actions">
        <button class="btn btn-outline" id="editSubjectBtn" type="button">✎ Edit subject</button>
        <button class="btn btn-outline" id="addTopicBtn" type="button">+ Add topic</button>
        <button class="btn btn-outline" id="progressBtn" type="button" title="Open your score-over-time chart">Progress</button>
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
          <div class="score-top"><span class="card-label">Predicted score</span>${scorePill}</div>
          <div class="score-main"><span class="score-num">${st.score}</span><span class="score-den">/ ${s.examTotal}</span></div>
          <div class="meter" role="progressbar" aria-label="Predicted score" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.examTotal ? (st.score / s.examTotal * 100) : 0)}"><div class="meter-fill meter-score" style="width:${s.examTotal ? (st.score / s.examTotal * 100) : 0}%"></div></div>
          <p class="muted small">${noRatings ? 'Zero just means nothing has been rated yet. Rate a question to get a prediction.' : "Weighted by each topic's marks and your confidence (Got it = full, Fuzzy = half)."}</p>
        </div>
        <div class="card">
          <div class="score-top"><span class="card-label">Target of ${s.target}</span>${goalPill}</div>
          <div class="goal-big" style="color:${remaining === 0 ? 'var(--green)' : (noRatings ? 'var(--muted)' : 'var(--orange)')}">${goalText}</div>
          <div class="meter" role="progressbar" aria-label="Progress to target" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.min(100, st.score / Math.max(1, s.target) * 100))}"><div class="meter-fill meter-goal" style="width:${Math.min(100, st.score / Math.max(1, s.target) * 100)}%"></div></div>
          <p class="muted small">${noRatings ? 'Rate a question to see how close you are.' : (remaining === 0 ? 'Your predicted score clears the target.' : `Reach rank #1: ${(s.topics.slice().sort((a, b) => a.rank - b.rank)[0] || { title: '' }).title}`)}</p>
        </div>
        <div class="card">
          <span class="card-label">Topics completed</span>
          <div class="stat-num">${st.topicsDone} <span>/ ${s.topics.length}</span></div>
          <div class="meter" role="progressbar" aria-label="Topics completed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(s.topics.length ? (st.topicsDone / s.topics.length * 100) : 0)}"><div class="meter-fill meter-topics" style="width:${s.topics.length ? (st.topicsDone / s.topics.length * 100) : 0}%"></div></div>
          <p class="muted small">Mark a topic complete, or rate all its questions.</p>
        </div>
      </div>
    </section>

    <section class="topics-section">
      <div class="section-head">
        <div><p class="sub">${s.topics.length} topics · ${st.qTotal} questions${due ? ` · <strong style="color:var(--red)">${due} due for review</strong>` : ''}</p><h2>Topics</h2></div>
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
      <div class="empty-state" id="emptyState" hidden><div class="empty-icon">✓</div><h3>No topics here</h3><p class="muted">Rate a question to start tracking your predicted score.</p></div>
    </section>

    <section class="actions-section">
      <div class="section-head"><div><h2>Study tools</h2></div></div>
      <div class="action-grid">
        <button class="action-card ${prefs.selfTest ? 'is-on' : ''}" id="selfTestBtn" type="button" aria-pressed="${prefs.selfTest ? 'true' : 'false'}" data-accent="orange">
          <span class="a-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-5 0-9.27-3-12-7a12.5 12.5 0 0 1 2.24-3.2M6.2 6.2l11.6 11.6M9.9 4.24A10.6 10.6 0 0 1 12 4c5 0 9.27 3 12 7a12.6 12.6 0 0 1-2.7 3.57M14.12 14.12A3 3 0 1 1 9.88 9.88"/></svg></span>
          <span class="a-body"><span class="a-title">Self-test <span class="on-chip">${prefs.selfTest ? 'On' : 'Off'}</span></span><span class="a-sub">Reveal the answer, then rate how well you know it.</span></span>
        </button>
        <button class="action-card" id="reviewBtn" type="button" data-accent="green">
          <span class="a-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.58-6.36L23 10"/></svg></span>
          <span class="a-body"><span class="a-title">Reviews <span class="badge-mini ${due === 0 ? 'is-zero' : ''}" id="reviewBadge">${due}</span></span><span class="a-sub">Drills what's due, scheduled by SM-2.</span></span>
        </button>
        <button class="action-card" id="printBtn" type="button" data-accent="teal">
          <span class="a-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="8"/></svg></span>
          <span class="a-body"><span class="a-title">Print sheet</span><span class="a-sub">Printable A4 sheet — topics, concepts, every Q&amp;A with your ratings.</span></span>
        </button>
      </div>
    </section>

    ${hasPlan ? `<section class="plan-section">
      <div class="section-head"><div><h2>Plan reference</h2></div></div>
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
        <div class="meter" role="progressbar" aria-label="${esc(t.title)} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(st.frac * 100)}"><div class="meter-fill" style="width:${st.frac * 100}%;background:${st.full ? 'var(--green)' : 'linear-gradient(90deg,var(--teal),var(--teal-end))'}"></div></div>
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
  const prog = $('#progressBtn'); if (prog) prog.addEventListener('click', () => {
    viewState.mode = viewState.mode === 'progress' ? 'tracker' : 'progress';
    if (viewState.mode !== 'progress') closeDrawer();
    refresh();
  });
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
        <p class="sub">${s.code ? esc(s.code) + ' · ' : ''}Progress</p>
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

/* ---------------- dialog focus management ---------------- */
const dialogFocusStack = [];
const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
function rememberFocus() {
  const el = document.activeElement;
  dialogFocusStack.push(el && el !== document.body ? el : null);
}
function restoreFocus() {
  const el = dialogFocusStack.pop();
  if (el && document.contains(el) && !el.closest('[hidden]')) {
    try { el.focus(); } catch (e) {}
  }
}
function focusableIn(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(el => {
    if (el.closest('[hidden]') || el.getAttribute('aria-hidden') === 'true') return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  });
}
function activeDialog() {
  if (!$('#modalOverlay').hidden && !$('#modal').hidden) return $('#modal');
  if (!$('#drawerOverlay').hidden && !$('#drawer').hidden) return $('#drawer');
  return null;
}
/* Keep the page behind a dialog out of the tab order and virtual cursor. */
function syncInert() {
  const open = !$('#modalOverlay').hidden || !$('#drawerOverlay').hidden;
  ['header.topbar', '#main', 'footer.footer'].forEach(sel => {
    const el = $(sel);
    if (!el) return;
    if (open) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  });
}

/* ---------------- drawer ---------------- */
function openDrawer(tid, focusQ) {
  const s = active(); if (!s) return;
  const t = s.topics.find(x => x.id === tid); if (!t) return;
  if (drawerTopicId !== tid) openQuestions.clear();
  drawerTopicId = tid;
  currentFocusQ = focusQ || null;
  rememberFocus();
  $('#drawerOverlay').hidden = false;
  $('#drawer').hidden = false;
  syncInert();
  if (!$('#drawer').hasAttribute('tabindex')) $('#drawer').setAttribute('tabindex', '-1');
  document.body.style.overflow = 'hidden';
  renderDrawer();
  ($('#drawerClose') || focusableIn($('#drawer'))[0] || $('#drawer')).focus();
}
function closeDrawer() {
  $('#drawerOverlay').hidden = true;
  $('#drawer').hidden = true;
  syncInert();
  document.body.style.overflow = '';
  drawerTopicId = null;
  currentFocusQ = null;
  openQuestions.clear();
  restoreFocus();
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

function makeRateRow(s, q) {
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
  $('#drawerMeter').style.background = st.full ? 'var(--green)' : 'linear-gradient(90deg,var(--teal),var(--teal-end))';
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
        const isOpen = openQuestions.has(q.id);
        const hintText = (isOpen
          ? (prefs.selfTest ? 'Tap to hide answer' : 'Tap to hide answer & steps')
          : (prefs.selfTest ? 'Tap to reveal answer &amp; rate' : 'Tap to show answer &amp; steps')) + (isOpen ? ' ▴' : ' ▾');
        return `<div class="q-item ${conf ? 'conf-' + conf : ''} ${isOpen ? 'open' : ''}" data-qid="${esc(q.id)}">
          <div class="q-head">
            <button type="button" class="q-check js-qcheck" data-qid="${esc(q.id)}" title="${conf ? CONF_LABEL[conf] : 'Rate this question'}" aria-label="${conf ? CONF_LABEL[conf] : 'Rate this question'}" aria-pressed="${conf ? 'true' : 'false'}">${mark}</button>
            <button type="button" class="q-toggle js-qtoggle" data-qid="${esc(q.id)}" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="qbody-${esc(q.id)}">
              <span class="q-qtext">${esc(q.question)}</span>
              <span class="q-toggle-hint">${hintText}</span>
              ${q.source ? `<span class="muted small q-source">${esc(q.source)}</span>` : ''}
            </button>
            <div class="q-head-right">
              <span class="pill-mini">${esc(label)}</span>
              <button class="q-edit-btn js-edit-q" data-qid="${esc(q.id)}" type="button" title="Edit question">✎</button>
            </div>
          </div>
          <div class="q-body" id="qbody-${esc(q.id)}">${questionHTML(q, s)}${makeRateRow(s, q)}</div>
        </div>`;
      }).join('') : '<p class="muted small">No questions yet. Add one, or upload a plan file (.txt/.md/.json/.pdf).</p>'}
    </div>`;

  const exitSelf = $('#exitSelfTest');
  if (exitSelf) exitSelf.addEventListener('click', () => { prefs.selfTest = false; savePrefs(); applyPrefs(); refresh(); });

  $('#markAllQ').addEventListener('click', () => {
    t.questions.forEach(q => setConfidence(s, q.id, 'know'));
    toast('All questions marked Got it');
  });
  $('#clearAllQ').addEventListener('click', () => {
    const qids = new Set(t.questions.map(q => q.id));
    const rated = t.questions.filter(q => s.progress.confidence[q.id]).length;
    if (rated && !confirm(`Clear ${rated} rating${rated === 1 ? '' : 's'} and their review schedules in "${t.title}"? You can undo this for a few seconds.`)) return;
    const snapshot = {
      confidence: Object.fromEntries(Object.entries(s.progress.confidence).filter(([k]) => qids.has(k))),
      review: Object.fromEntries(Object.entries(s.progress.review).filter(([k]) => qids.has(k))),
      topicDone: !!s.progress.topics[t.id]
    };
    t.questions.forEach(q => {
      delete s.progress.confidence[q.id];
      delete s.progress.review[q.id];
    });
    delete s.progress.topics[t.id];
    save(); refresh();
    toast(`Cleared ${rated} rating${rated === 1 ? '' : 's'}`, {
      undo: () => {
        Object.keys(snapshot.confidence).forEach(k => { s.progress.confidence[k] = snapshot.confidence[k]; });
        Object.keys(snapshot.review).forEach(k => { s.progress.review[k] = snapshot.review[k]; });
        if (snapshot.topicDone) s.progress.topics[t.id] = true;
        save(); refresh(); toast('Ratings restored');
      }
    });
  });
  $('#addQ').addEventListener('click', () => openQuestionEditor(t.id, null));

  $('#drawerBody').querySelectorAll('.js-qcheck').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    const qid = el.dataset.qid;
    const cur = s.progress.confidence[qid];
    const next = !cur ? 'know' : (cur === 'know' ? 'fuzzy' : cur === 'fuzzy' ? 'dontknow' : null);
    setConfidence(s, qid, next);
  }));
  $('#drawerBody').querySelectorAll('.js-edit-q').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation(); openQuestionEditor(t.id, el.dataset.qid);
  }));
  $('#drawerBody').querySelectorAll('.js-qtoggle').forEach(el => el.addEventListener('click', () => {
    const item = el.closest('.q-item');
    const qid = el.dataset.qid;
    const open = item.classList.toggle('open');
    if (open) openQuestions.add(qid); else openQuestions.delete(qid);
    el.setAttribute('aria-expanded', String(open));
    const hint = el.querySelector('.q-toggle-hint');
    if (hint) hint.textContent = (open
      ? (prefs.selfTest ? 'Tap to hide answer' : 'Tap to hide answer & steps')
      : (prefs.selfTest ? 'Tap to reveal answer & rate' : 'Tap to show answer & steps')) + (open ? ' ▴' : ' ▾');
  }));
  $('#drawerBody').querySelectorAll('.rate-btn').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    const qid = el.dataset.qid, rating = el.dataset.rate;
    setConfidence(s, qid, s.progress.confidence[qid] === rating ? null : rating);
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
      openQuestions.add(target.dataset.qid);
      const toggle = target.querySelector('.js-qtoggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
    currentFocusQ = null;
  }
}

/* ---------------- modal helpers ---------------- */
function openModal(html, opts) {
  opts = opts || {};
  if ($('#modalOverlay').hidden) rememberFocus();
  $('#modalContent').innerHTML = html;
  $('#modal').classList.toggle('wide', !!opts.wide);
  $('#modalOverlay').hidden = false;
  $('#modal').hidden = false;
  syncInert();
  if (!$('#modal').hasAttribute('tabindex')) $('#modal').setAttribute('tabindex', '-1');
  // Point aria-labelledby at the heading we just rendered so screen readers can read it
  const modal = $('#modal');
  const heading = modal.querySelector('h2, h3');
  if (heading && !heading.id) heading.id = 'modalTitle';
  const first = opts.focus === false ? null : $('#modalContent input, #modalContent textarea, #modalContent select');
  (first || $('#modalClose') || focusableIn(modal)[0] || modal).focus();
}
function closeModal() {
  $('#modalOverlay').hidden = true;
  $('#modal').hidden = true;
  syncInert();
  $('#modalContent').innerHTML = '';
  $('#modal').classList.remove('wide');
  restoreFocus();
}

/* ---------------- refresh ---------------- */
/* Full re-renders would otherwise drop focus to <body> on every rating.
   Capture a stable identity before rendering and restore it afterwards. */
function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || !el.isConnected) return null;
  if (el.id) return { id: el.id };
  const qid = el.getAttribute('data-qid');
  if (qid) return { qid, rate: el.getAttribute('data-rate') || '' };
  const topic = el.getAttribute('data-topic');
  if (topic) return { topic };
  return null;
}
function restoreFocus(sig) {
  if (!sig) return;
  let el = null;
  if (sig.id) el = document.getElementById(sig.id);
  else {
    const root = (drawerTopicId && !$('#drawer').hidden) ? $('#drawer') : document;
    if (sig.qid) {
      const found = $$('[data-qid="' + CSS.escape(sig.qid) + '"]', root);
      el = found.find(x => (x.getAttribute('data-rate') || '') === sig.rate) || found[0];
    } else if (sig.topic) el = $('[data-topic="' + CSS.escape(sig.topic) + '"]', root);
  }
  if (el && typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }
}
function refresh() {
  const focusSig = captureFocus();
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
  restoreFocus(focusSig);
}

/* ---------------- print revision sheet ---------------- */
async function printRevisionSheet() {
  const s = active(); if (!s) return;
  try {
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
    ? `<div class="review-empty"><h3>Nothing to review yet</h3><p class="muted">Rate some questions "Got it", "Fuzzy" or "Didn't get it" and they'll come back here on a schedule.</p></div>`
    : `<div class="review-list">${all.map(i => `
          <button class="review-item" data-topic="${esc(i.topicId)}" data-qid="${esc(i.qid)}" type="button">
            <span class="ri-main"><span class="ri-topic">${esc(i.topicTitle)} · ${CONF_LABEL[i.conf]}</span><span class="ri-q">${esc(i.question)}</span></span>
            <span class="ri-due ${i.due <= now ? 'due-now' : ''}">${i.due <= now ? 'Due now' : (i.due - now < 3600000 ? 'Soon' : (i.due - now < 86400000 ? 'Later today' : fmtDue(i.due) + 'd'))}</span>
          </button>`).join('')}</div>`;

  openModal(`<h2>Spaced-repetition review</h2>
    <p class="muted small">"Got it" pushes a question further out (1 → 3 → 7 → 15… days). "Fuzzy" brings it back sooner. "Didn't get it" resets it. Tap one to jump to it.</p>
    ${items.length ? `<p class="muted small"><strong>${dueNow.length}</strong> due now · <strong>${upcoming.length}</strong> upcoming · ${items.length} rated in total</p>` : ''}
    ${body}`, { wide: true });

  $$('#modalContent .review-item').forEach(row => row.addEventListener('click', () => {
    const topicId = row.dataset.topic, qid = row.dataset.qid;
    closeModal();
    openDrawer(topicId, qid); // opens and renders with the question focused
  }));
}
