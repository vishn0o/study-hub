/* Study Hub — import wizard (wizard + preflight prompt), subject/topic/question editors,
   subject manager, help, backup import/export, sample, topic listing. */
'use strict';

/* ---------------- import wizard ---------------- */
const wz = { step: 1, parsed: null, fileName: '', error: '', busy: false, answers: null, promptKind: 'tracker' };

function openWizard() {
  wz.step = 1; wz.parsed = null; wz.fileName = ''; wz.error = ''; wz.busy = false; wz.answers = null; wz.promptKind = 'tracker';
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
      <p class="muted small">Tell us when your exam is and how many effective hours you actually have. The prompt will be tailored to your situation. Already have a plan file from your agent? Skip and upload it now.</p>
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
          <div class="field full">
            <label>Choose a prompt</label>
            <div class="quick-picks" id="promptChoice" role="group" aria-label="Choose a prompt">
              ${PROMPT_KINDS.map(k => `<button type="button" class="qp-chip ${k.id === wz.promptKind ? 'is-active' : ''}" data-kind="${k.id}" title="${esc(k.hint)}">${esc(k.label)}</button>`).join('')}
            </div>
            <span class="hint" id="promptHint">${esc(PROMPT_KINDS.find(k => k.id === wz.promptKind).hint)}</span>
          </div>
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
    document.querySelectorAll('#promptChoice .qp-chip').forEach(btn => btn.addEventListener('click', () => {
      wz.promptKind = btn.dataset.kind;
      document.querySelectorAll('#promptChoice .qp-chip').forEach(b => b.classList.toggle('is-active', b === btn));
      $('#promptHint').textContent = PROMPT_KINDS.find(k => k.id === wz.promptKind).hint;
    }));
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
    const promptText = buildPrompt(answers, wz.promptKind);
    const kindLabel = PROMPT_KINDS.find(k => k.id === wz.promptKind).label;
    const dateLabel = (() => {
      try { const d = new Date(answers.examDate + ':00'); return d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
      catch (e) { return answers.examDate; }
    })();
    const modeLabel = modeFor(answers.effectiveHours).label;
    openModal(`<h2>Your ${esc(kindLabel)} prompt is ready</h2>
      <p class="muted small">Paste it into Gemini, Claude, ChatGPT or any chat agent — with your syllabus, PYQs and notes in the same message. Switch prompts below at any time, then copy or download it. All parsing is local.</p>
      <div class="quick-picks" id="promptSwitch" role="group" aria-label="Switch prompt">
        ${PROMPT_KINDS.map(k => `<button type="button" class="qp-chip ${k.id === wz.promptKind ? 'is-active' : ''}" data-kind="${k.id}" title="${esc(k.hint)}">${esc(k.label)}</button>`).join('')}
      </div>
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
    document.querySelectorAll('#promptSwitch .qp-chip').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.kind === wz.promptKind) return;
      wz.promptKind = btn.dataset.kind;
      renderWizard();
    }));
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

/* ---------------- subject form modal (shared by subject/topic/question editors) ---------------- */
function openFormModal({ title, extra, body, deleteBtn, onSubmit }) {
  openModal(`<h2>${title}</h2>${extra ? '<p class="muted small">' + extra + '</p>' : ''}<form id="formModal" novalidate>
    ${body}
    <p class="form-error" role="alert" tabindex="-1"></p>
    <div class="modal-actions">
      ${deleteBtn ? `<button class="btn btn-danger" id="formDelete" type="button">Delete</button>` : ''}
      <button class="btn btn-outline" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="submit">Save</button>
    </div>
  </form>`);
  const form = $('#formModal');
  const errBox = form.querySelector('.form-error');
  const showErr = (msg) => { errBox.textContent = msg; errBox.classList.add('is-show'); errBox.focus(); };
  form.addEventListener('submit', e => {
    e.preventDefault();
    onSubmit(form, showErr);
  });
  if (deleteBtn) $('#formDelete').addEventListener('click', deleteBtn);
}

/* ---------------- subject editor ---------------- */
function openSubjectEditor() {
  const s = active(); if (!s) return;
  openFormModal({
    title: 'Edit subject',
    extra: 'These values drive the score prediction and the exam countdown.',
    body: `<div class="form-grid">
      <div class="field full"><label for="sf-name">Subject name</label><input id="sf-name" name="name" value="${esc(s.name)}" autocomplete="off"></div>
      <div class="field"><label for="sf-code">Course code</label><input id="sf-code" name="code" value="${esc(s.code)}" autocomplete="off"></div>
      <div class="field full"><label for="sf-examDate">Exam date &amp; time</label><input id="sf-examDate" name="examDate" type="datetime-local" value="${esc(s.examDate || '')}"></div>
      <div class="field"><label for="sf-examTotal">Exam total marks</label><input id="sf-examTotal" name="examTotal" type="number" min="1" step="1" value="${esc(s.examTotal)}"></div>
      <div class="field"><label for="sf-target">Target marks</label><input id="sf-target" name="target" type="number" min="0" step="1" value="${esc(s.target)}"></div>
      <div class="field full"><label for="sf-desc">Description</label><textarea id="sf-desc" name="description" rows="2" autocomplete="off">${esc(s.description)}</textarea></div>
    </div>`,
    onSubmit: (f, showErr) => {
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
    },
    deleteBtn: () => {
      if (!confirm(`Delete "${s.name}" and all its progress? This cannot be undone.`)) return;
      state.subjects = state.subjects.filter(x => x.id !== s.id);
      state.activeId = state.subjects[0] ? state.subjects[0].id : null;
      save(); closeModal(); closeDrawer(); refresh(); toast('Subject deleted');
    },
  });
}

/* ---------------- topic editor ---------------- */
function openTopicEditor(tid) {
  const s = active(); if (!s) return;
  const t = tid ? s.topics.find(x => x.id === tid) : null;
  openFormModal({
    title: t ? 'Edit topic' : 'New topic',
    body: `<div class="form-grid">
      <div class="field full"><label for="tf-title">Topic title</label><input id="tf-title" name="title" required value="${t ? esc(t.title) : ''}" autocomplete="off"></div>
      <div class="field"><label for="tf-marks">Marks</label><input id="tf-marks" name="marks" type="number" min="0" step="1" value="${t ? esc(t.marks) : 1}"></div>
      <div class="field"><label for="tf-rank">Study rank</label><input id="tf-rank" name="rank" type="number" min="0" step="1" value="${t ? esc(t.rank) : s.topics.length + 1}"></div>
      <div class="field full"><label for="tf-concepts">Key concepts &amp; steps to remember</label>
        <textarea id="tf-concepts" name="concepts" rows="8" placeholder="One concept per line" autocomplete="off">${t ? esc(t.concepts.join('\n')) : ''}</textarea>
        <span class="hint">One per line. These appear when you open the topic.</span>
      </div>
    </div>`,
    onSubmit: (f, showErr) => {
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
    },
    deleteBtn: t ? (() => {
      return () => {
        if (!confirm(`Delete topic "${t.title}" and its ${t.questions.length} questions?`)) return;
        t.questions.forEach(q => { delete s.progress.confidence[q.id]; removeReview(s, q.id); });
        delete s.progress.topics[t.id];
        s.topics = s.topics.filter(x => x.id !== t.id);
        save(); closeModal(); closeDrawer(); refresh(); toast('Topic deleted');
      };
    })() : null,
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
  openFormModal({
    title: q ? 'Edit question' : 'New question',
    body: `<div class="form-grid">
      <div class="field full"><label for="qf-question">Question</label><textarea id="qf-question" name="question" rows="3" required autocomplete="off">${q ? esc(q.question) : ''}</textarea></div>
      <div class="field"><label for="qf-marks">Marks</label><input id="qf-marks" name="marks" type="number" min="0" step="1" value="${q ? esc(q.marks) : 1}"></div>
      <div class="field"><label for="qf-source">Source / paper</label><input id="qf-source" name="source" value="${q ? esc(q.source) : ''}" placeholder="e.g. 2024 Q2" autocomplete="off"></div>
      <div class="field full"><label for="qf-answer">Answer</label><textarea id="qf-answer" name="answer" rows="5" placeholder="One paragraph per line" autocomplete="off">${esc(flat.answer)}</textarea></div>
      <div class="field full"><label for="qf-steps">Steps to remember</label><textarea id="qf-steps" name="steps" rows="4" placeholder="One step per line" autocomplete="off">${esc(flat.steps)}</textarea></div>
      <div class="field full"><label for="qf-code">Code / trace / diagram (optional)</label><textarea id="qf-code" name="code" rows="4" style="font-family:'JetBrains Mono',monospace;font-size:12px" autocomplete="off">${esc(flat.code)}</textarea></div>
    </div>`,
    onSubmit: (f, showErr) => {
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
    },
    deleteBtn: q ? (() => {
      return () => {
        if (!confirm('Delete this question?')) return;
        delete s.progress.confidence[q.id]; removeReview(s, q.id);
        t.questions = t.questions.filter(x => x.id !== q.id);
        save(); closeModal(); refresh(); toast('Question deleted');
      };
    })() : null,
  });
}

/* ---------------- subject manager ---------------- */
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
      <li><strong>Bring your own plan.</strong> Click "Agent prompt" → fill in your exam date/time, effective hours and target marks → paste the tailored prompt into any LLM (Gemini, Claude, ChatGPT, Llama) → attach your syllabus + PYQs + notes to the same message → save whatever it prints out as <code>.txt</code> → this app parses it offline.</li>
      <li><strong>Everything is local.</strong> File parsing and storage happen in this browser. No server, no uploads.</li>
      <li><strong>Rate, don't just tick.</strong> Every question gets "Got it / Fuzzy / Didn't get it". Your predicted score is weighted by marks <em>and</em> confidence.</li>
      <li><strong>Spaced repetition.</strong> "Got it" schedules the question 1 → 3 → 7 → 15… days out; "Fuzzy" gets it back sooner; "Didn't get it" is due in 10 minutes. Tap <em>Reviews</em> to drill what's due.</li>
      <li><strong>Formulas, hidden until you reveal.</strong> Topics with formulas show "Key formulas" in the drawer — tap to flip them as you study (blind recall). Reveal all / hide all available.</li>
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

function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (Array.isArray(obj.subjects)) {
    if (!obj.subjects.length || obj.subjects.length > MAX_SUBJECTS) return null;
    if (!obj.subjects.every(s => s && typeof s === 'object' && Array.isArray(s.topics))) return null;
    if (obj.activeId && !obj.subjects.some(s => s.id === obj.activeId)) return null;
    return { kind: 'all', subjects: obj.subjects, activeId: obj.activeId || null };
  }
  if (Array.isArray(obj.topics) ||
      (obj.subject && typeof obj.subject === 'object' && Array.isArray(obj.subject.topics))) {
    return { kind: 'one', raw: obj };
  }
  return null;
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    const plan = validateBackup(obj);
    if (!plan) throw new Error('Unrecognised backup file');
    if (plan.kind === 'all') {
      if (!confirm('Replace all current subjects with this backup?')) return;
      state = { subjects: plan.subjects.map(normalizeSubject), activeId: plan.activeId };
    } else {
      if (state.subjects.length >= MAX_SUBJECTS) { toast('Maximum subjects reached'); return; }
      const s = normalizeSubject(plan.raw);
      if (!s.topics.length) throw new Error('Backup has no topics');
      s.id = uid('sub');
      state.subjects.push(s);
      state.activeId = s.id;
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
