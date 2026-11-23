/* Study Hub — app wiring: global events, top bar, storage sync, init.
   All logic now lives in the module files: helpers.js, state.js, scoring.js,
   parse.js, render.js, wizard.js. */
'use strict';

/* ---------------- init ---------------- */
applyPrefs();
ensureIds();
let seeded = true;
try { seeded = !!localStorage.getItem('study-hub-seeded'); }
catch (e) { toast('Cannot read saved progress — browser storage is unavailable.'); }
if (!state.subjects.length && !seeded) {
  const s = normalizeSubject(JSON.parse(JSON.stringify(SAMPLE_SUBJECT)));
  s.id = uid('sub');
  s.progress = { topics: {}, confidence: {}, review: {}, history: [] };
  state.subjects.push(s);
  state.activeId = s.id;
  try { localStorage.setItem('study-hub-seeded', '1'); }
  catch (e) { toast('Cannot save the sample subject — browser storage is unavailable or full.'); }
  save();
}
ensureIds();
save();
populateSelect();
renderSubject();
refreshBadges();

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
    return;
  }
  if (e.key === 'Tab') {
    const dialog = activeDialog();
    if (!dialog) return;
    const items = focusableIn(dialog);
    if (!items.length) { e.preventDefault(); dialog.focus(); return; }
    const first = items[0], last = items[items.length - 1], cur = document.activeElement;
    if (e.shiftKey && (cur === first || !dialog.contains(cur))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (cur === last || !dialog.contains(cur))) { e.preventDefault(); first.focus(); }
    return;
  }
  if (e.key === 'Escape') {
    const dialog = activeDialog();
    if (dialog === $('#modal')) closeModal();
    else if (dialog === $('#drawer')) closeDrawer();
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
