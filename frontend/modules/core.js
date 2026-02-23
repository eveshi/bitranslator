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
    bar.querySelectorAll(".step").forEach((s, i) => {
      s.classList.remove("active", "done");
      if (i < idx) s.classList.add("done");
      if (i === idx) s.classList.add("active");
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
  const similarity = (a, b) => {
    if (!a || !b) return 0;
    const sa = new Set(a.toLowerCase()), sb = new Set(b.toLowerCase());
    const inter = [...sa].filter(c => sb.has(c)).length;
    return inter / Math.max(sa.size + sb.size - inter, 1);
  };
  let titleAdded = false;
  return text.split(/\n\n+/).map((para) => {
    const trimmed = para.trim();
    if (!trimmed) return "";
    const escaped = escape(trimmed).replace(/\n/g, "<br>");
    if (/^[\s*\-=~·•—]{3,}$/.test(trimmed)) return `<p class="separator">* * *</p>`;
    if (!titleAdded) {
      titleAdded = true;
      if (chapterTitle && (
        trimmed.toLowerCase() === chapterTitle.toLowerCase() ||
        similarity(trimmed, chapterTitle) > 0.6 ||
        (trimmed.length < 80 && !/[。.！!？?」"…]$/.test(trimmed))
      )) {
        return `<h1>${escaped}</h1>`;
      }
    }
    if (trimmed.length < 60 && /^(第.{1,6}[章节回部篇]|Chapter\s+\d|Part\s+\d|PART\s+\d|\d+\.)/.test(trimmed))
      return `<h2>${escaped}</h2>`;
    return `<p>${escaped}</p>`;
  }).join("");
}
