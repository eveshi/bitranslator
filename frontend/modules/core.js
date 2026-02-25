/* DOM helpers, API wrappers, panel management, polling infrastructure */
import { state } from './state.js';

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => [...document.querySelectorAll(s)];
export function show(el) { el?.classList.remove("hidden"); }
export function hide(el) { el?.classList.add("hidden"); }
export function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── API helpers ─────────────────────────────────────────────────────
export async function api(path, opts = {}) {
  const resp = await fetch(path, opts);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || JSON.stringify(err));
  }
  return resp;
}
export async function apiJson(path, opts = {}) {
  return (await api(path, opts)).json();
}

// ── Panel switching ─────────────────────────────────────────────────
const STEPS = ["upload", "analysis", "strategy", "sample", "translate", "review", "reader", "done"];

export function showPanel(name) {
  $$(".panel").forEach(p => p.classList.remove("active"));
  const panel = $(`#panel-${name}`);
  if (panel) panel.classList.add("active");

  const idx = STEPS.indexOf(name);
  const bar = $("#steps-bar");
  if (idx >= 0) {
    show(bar);
    const reviewIdx = STEPS.indexOf("review");
    bar.querySelectorAll(".step").forEach((s, i) => {
      s.classList.remove("active", "done");
      if (i < idx) s.classList.add("done");
      if (i === idx) s.classList.add("active");
      // Allow jumping forward to review/reader/done when translated chapters exist
      if (i > idx && i >= reviewIdx && state.hasTranslatedChapters) {
        s.classList.add("done");
      }
    });
  }

  // Keep URL hash in sync
  if (state.currentProjectId && name !== "upload") {
    const h = `#/project/${state.currentProjectId}/${name}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  } else if (name === "upload") {
    if (location.hash && location.hash !== "#/") history.replaceState(null, "", "#/");
  }
}

// ── Polling infrastructure ──────────────────────────────────────────
let _pollCallback = null;
export function setPollCallback(fn) { _pollCallback = fn; }

export function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => _pollCallback?.(), 3000);
}
export function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

// ── Text → structured HTML (shared by reader and backend) ───────────
export function textToHtml(text, chapterTitle) {
  const escape = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const normalize = s => s.replace(/\s+/g, " ").trim().toLowerCase();

  // Split on double-newlines first; if that yields only 1 block with many
  // single-newline breaks, fall back to single-newline splitting.
  let paragraphs = text.split(/\n\n+/).map(s => s.trim()).filter(Boolean);
  if (paragraphs.length === 1 && paragraphs[0].includes("\n")) {
    paragraphs = paragraphs[0].split(/\n/).map(s => s.trim()).filter(Boolean);
  }

  let html = "";

  // Always render the known title as a styled heading
  if (chapterTitle) {
    html += `<h1 class="chapter-title">${escape(chapterTitle)}</h1>`;
  }

  const titleNorm = chapterTitle ? normalize(chapterTitle) : "";
  let firstBodyPara = true;

  for (const trimmed of paragraphs) {
    if (!trimmed) continue;
    const escaped = escape(trimmed).replace(/\n/g, "<br>");

    // Skip the first paragraph ONLY if it is clearly the same title
    // (short text that closely matches the known chapter title)
    if (firstBodyPara && titleNorm) {
      firstBodyPara = false;
      const paraNorm = normalize(trimmed);
      // Only consider paragraphs that are short enough to be a title
      // (no more than 2x the title length + some slack)
      const maxTitleLen = Math.max(titleNorm.length * 2, 120);
      if (paraNorm.length <= maxTitleLen) {
        if (paraNorm === titleNorm) continue;
        // Strip common decorations (dashes, colons, numbering) and compare
        const stripDeco = s => s.replace(/[—–\-:：·.。,，\s]/g, "");
        if (stripDeco(paraNorm) === stripDeco(titleNorm)) continue;
      }
    }

    if (/^[\s*\-=~·•—]{3,}$/.test(trimmed)) { html += `<p class="separator">* * *</p>`; continue; }
    if (trimmed.length < 60 && /^(第.{1,6}[章节回部篇]|Chapter\s+\d|Part\s+\d|PART\s+\d|\d+\.)/.test(trimmed)) {
      html += `<h2>${escaped}</h2>`; continue;
    }
    html += `<p>${escaped}</p>`;
  }

  return html;
}
