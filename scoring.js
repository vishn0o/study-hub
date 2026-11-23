/* Study Hub — confidence scoring and SM-2 spaced-repetition schedule. */
'use strict';

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

/* Shared rating mutation: one confidence write, used by every rating UI. */
function setConfidence(s, qid, value) {
  if (value == null || value === '') {
    delete s.progress.confidence[qid];
    removeReview(s, qid);
  } else {
    s.progress.confidence[qid] = value;
    scheduleReview(s, qid, value);
  }
  save(); refresh();
}
