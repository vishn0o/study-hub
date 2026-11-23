/* Study Hub — shared helpers. Loaded first by every module (plain-script globals). */
'use strict';

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
