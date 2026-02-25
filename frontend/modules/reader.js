/* Book reader panel + AI Q&A */
import { state } from './state.js';
import { $, show, hide, showPanel, apiJson, textToHtml, esc } from './core.js';
import { t } from './i18n.js';
import { showReview } from './review.js';

export function chapterDisplayLabel(ch) {
  const ctype = ch.chapter_type || "chapter";
  const seq = ch.chapter_index + 1;
  let prefix = `#${seq} `;
  if (ctype === "chapter" && ch.body_number != null) prefix += `Ch.${ch.body_number}: `;
  else if (ctype === "part") prefix += `[${t("part_divider")}${ch.body_number != null ? " " + ch.body_number : ""}] `;
  else if (ctype === "frontmatter") prefix += `[${t("frontmatter")}] `;
  else if (ctype === "backmatter") prefix += `[${t("backmatter")}] `;
  const orig = ch.title, trans = ch.translated_title || "";
  return trans && trans !== orig ? `${prefix}${trans} / ${orig}` : `${prefix}${orig}`;
}

let _currentAnnotations = [];
let _currentHighlights = [];
let _pendingHighlightText = "";

// ── Highlights & Notes ────────────────────────────────────────────────
function _applyHighlights(transEl, highlights) {
  if (!highlights || highlights.length === 0) return;
  let html = transEl.innerHTML;
  for (let i = 0; i < highlights.length; i++) {
    const text = highlights[i].text;
    if (!text || text.length < 2) continue;
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasNote = highlights[i].note ? ' has-note' : '';
    const noteAttr = highlights[i].note ? ` data-note="${esc(highlights[i].note)}"` : '';
    html = html.replace(
      new RegExp(`(${escaped})`, "g"),
      `<mark class="user-highlight${hasNote}" data-hl-idx="${i}"${noteAttr}>$1</mark>`
    );
  }
  transEl.innerHTML = html;
}

async function _saveHighlights() {
  if (!state.readerCurrentChapterId) return;
  try {
    await apiJson(`/api/projects/${state.currentProjectId}/chapters/${state.readerCurrentChapterId}/highlights`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ highlights: _currentHighlights }),
    });
  } catch (e) { console.error("Failed to save highlights", e); }
}

function _refreshHighlightsDisplay() {
  const transEl = $("#reader-book-translated-content");
  transEl.querySelectorAll("mark.user-highlight").forEach(m => {
    m.replaceWith(document.createTextNode(m.textContent));
  });
  _applyHighlights(transEl, _currentHighlights);
  if ($("#reader-show-annotations").checked && _currentAnnotations.length > 0) {
    _highlightAnnotatedText(transEl, _currentAnnotations);
  }
}

function _renderAnnotationsModal(annotations) {
  const list = $("#annotations-modal-list");
  if (!annotations || annotations.length === 0) {
    list.innerHTML = `<p class="hint">${t("no_annotations")}</p>`;
    return;
  }
  let html = '<table class="annotations-table"><thead><tr>' +
    `<th>#</th><th>${t("annotation_src")}</th><th>${t("annotation_tgt")}</th><th>${t("annotation_note")}</th>` +
    '</tr></thead><tbody>';
  annotations.forEach((a, i) => {
    html += `<tr data-ann-idx="${i}">` +
      `<td>${i + 1}</td>` +
      `<td class="ann-src">${esc(a.src || "")}</td>` +
      `<td class="ann-tgt">${esc(a.tgt || "")}</td>` +
      `<td class="ann-note">${esc(a.note || "")}</td></tr>`;
  });
  html += '</tbody></table>';
  list.innerHTML = html;
}

function _showAnnotationTooltip(ann) {
  const tooltip = $("#reader-ann-tooltip");
  $("#ann-tooltip-src-text").textContent = ann.src || "";
  $("#ann-tooltip-tgt-text").textContent = ann.tgt || "";
  $("#ann-tooltip-note-text").textContent = ann.note || "";
  show(tooltip);
}

function _highlightAnnotatedText(transEl, annotations) {
  if (!annotations || annotations.length === 0) return;
  let html = transEl.innerHTML;
  for (let i = 0; i < annotations.length; i++) {
    const tgt = annotations[i].tgt;
    if (!tgt || tgt.length < 2) continue;
    const escaped = tgt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, "g");
    html = html.replace(regex, `<mark class="ann-highlight" data-ann-idx="${i}">$1</mark>`);
  }
  transEl.innerHTML = html;
}

export async function loadReaderChapter(idx) {
  const ch = state.readerChapters[idx];
  if (!ch) return;
  state.readerCurrentChapterId = ch.id;
  $("#reader-nav-label").textContent = chapterDisplayLabel(ch);
  $("#btn-reader-prev").disabled = idx === 0;
  $("#btn-reader-next").disabled = idx === state.readerChapters.length - 1;

  const origEl = $("#reader-book-original-content");
  const transEl = $("#reader-book-translated-content");
  origEl.innerHTML = "<p style='color:var(--text-dim)'>...</p>";
  transEl.innerHTML = "<p style='color:var(--text-dim)'>...</p>";

  try {
    const [orig, trans, annResp, hlResp] = await Promise.all([
      apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/original`),
      apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/translation`),
      apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/annotations`).catch(() => ({ annotations: [] })),
      apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/highlights`).catch(() => ({ highlights: [] })),
    ]);
    origEl.innerHTML = textToHtml(orig.text || "", ch.title);
    transEl.innerHTML = ch.status === "translated"
      ? textToHtml(trans.text || "", ch.translated_title || ch.title)
      : `<p style='color:var(--text-dim)'>(${t("not_translated_yet")})</p>`;

    _currentAnnotations = annResp.annotations || [];
    _currentHighlights = hlResp.highlights || [];
    hide($("#reader-ann-tooltip"));
    hide($("#reader-hl-tooltip"));
    hide($("#reader-highlight-bar"));

    _applyHighlights(transEl, _currentHighlights);
    if ($("#reader-show-annotations").checked && _currentAnnotations.length > 0) {
      _highlightAnnotatedText(transEl, _currentAnnotations);
    }
  } catch (e) {
    console.error("loadReaderChapter failed", e);
    origEl.innerHTML = "<p>加载失败</p>"; transEl.innerHTML = "<p>加载失败</p>";
    _currentAnnotations = [];
  }
  clearQASelection();
  _loadQAHistory(ch.id);
}

async function _loadQAHistory(chapterId) {
  const msgs = $("#reader-qa-messages");
  try {
    const resp = await apiJson(`/api/projects/${state.currentProjectId}/qa-history?chapter_id=${chapterId}`);
    const history = resp.history || [];
    msgs.innerHTML = "";
    for (const qa of history) {
      const userMsg = document.createElement("div"); userMsg.className = "qa-msg user";
      userMsg.textContent = qa.question;
      msgs.appendChild(userMsg);
      const aiMsg = document.createElement("div"); aiMsg.className = "qa-msg ai";
      aiMsg.innerHTML = textToHtml(qa.answer || "");
      msgs.appendChild(aiMsg);
    }
    if (history.length) msgs.scrollTop = msgs.scrollHeight;
  } catch (e) {
    console.error("Failed to load QA history", e);
  }
}

export async function openChapterReader(ch) {
  state.readerChapters = state.reviewChapters.length
    ? state.reviewChapters
    : await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
  const idx = state.readerChapters.findIndex(c => c.id === ch.id);
  state.readerCurrentIdx = idx >= 0 ? idx : 0;
  showPanel("reader");
  loadReaderChapter(state.readerCurrentIdx);
}

function clearQASelection() {
  state.readerSelectedOriginal = ""; state.readerSelectedTranslation = "";
  hide($("#reader-qa-selection")); $("#reader-qa-selection-text").textContent = "";
}

async function askAI() {
  const question = $("#reader-qa-question").value.trim();
  if (!question) return;
  const msgs = $("#reader-qa-messages");

  const userMsg = document.createElement("div"); userMsg.className = "qa-msg user";
  let content = "";
  if (state.readerSelectedOriginal) content += `<span class="qa-selection-badge">原文: "${esc(state.readerSelectedOriginal.slice(0, 80))}"</span>`;
  if (state.readerSelectedTranslation) content += `<span class="qa-selection-badge">译文: "${esc(state.readerSelectedTranslation.slice(0, 80))}"</span>`;
  content += esc(question);
  userMsg.innerHTML = content;
  msgs.appendChild(userMsg); msgs.scrollTop = msgs.scrollHeight;

  const aiMsg = document.createElement("div"); aiMsg.className = "qa-msg ai"; aiMsg.textContent = "思考中…";
  msgs.appendChild(aiMsg); msgs.scrollTop = msgs.scrollHeight;
  $("#reader-qa-question").value = "";

  try {
    const resp = await apiJson(`/api/projects/${state.currentProjectId}/ask`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question, selected_original: state.readerSelectedOriginal,
        selected_translation: state.readerSelectedTranslation,
        chapter_id: state.readerCurrentChapterId,
      }),
    });
    aiMsg.innerHTML = textToHtml(resp.answer || "(无回复)");
  } catch (e) { aiMsg.textContent = "提问失败: " + e.message; }
  msgs.scrollTop = msgs.scrollHeight;
  clearQASelection();
}

// ── Reader settings (height / font / theme) ──────────────────────────
const _SETTINGS_KEY = "reader-settings";
const _DEFAULTS = { height: "standard", fontsize: "medium", theme: "dark" };

function _loadReaderSettings() {
  try { return { ..._DEFAULTS, ...JSON.parse(localStorage.getItem(_SETTINGS_KEY)) }; }
  catch { return { ..._DEFAULTS }; }
}

function _saveReaderSettings(s) { localStorage.setItem(_SETTINGS_KEY, JSON.stringify(s)); }

function _applyReaderSettings(s) {
  const panel = $("#panel-reader");
  panel.classList.forEach(c => { if (/^r[htf]-/.test(c)) panel.classList.remove(c); });
  panel.classList.add(`rh-${s.height}`, `rf-${s.fontsize}`, `rt-${s.theme}`);

  // Sync active button states
  for (const [group, val] of [["rset-height", s.height], ["rset-fontsize", s.fontsize], ["rset-theme", s.theme]]) {
    $(`#${group}`).querySelectorAll(".rset-opt").forEach(b => {
      b.classList.toggle("active", b.dataset.val === val);
    });
  }
}

function _initReaderSettings() {
  const s = _loadReaderSettings();
  _applyReaderSettings(s);

  // Toggle dropdown
  $("#btn-reader-settings").addEventListener("click", (e) => {
    e.stopPropagation();
    $("#reader-settings-dropdown").classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    const dd = $("#reader-settings-dropdown");
    if (!dd.classList.contains("hidden") && !dd.contains(e.target) && e.target !== $("#btn-reader-settings")) {
      dd.classList.add("hidden");
    }
  });

  // Option clicks
  for (const [groupId, key] of [["rset-height", "height"], ["rset-fontsize", "fontsize"], ["rset-theme", "theme"]]) {
    $(`#${groupId}`).addEventListener("click", (e) => {
      const btn = e.target.closest(".rset-opt");
      if (!btn) return;
      const cur = _loadReaderSettings();
      cur[key] = btn.dataset.val;
      _saveReaderSettings(cur);
      _applyReaderSettings(cur);
    });
  }
}

export function initReader() {
  _initReaderSettings();

  // Exit reader → back to review
  $("#btn-reader-exit").addEventListener("click", () => { showPanel("review"); showReview(state.reviewIsStopped); });

  // Navigation
  $("#btn-reader-prev").addEventListener("click", () => {
    if (state.readerCurrentIdx > 0) { state.readerCurrentIdx--; loadReaderChapter(state.readerCurrentIdx); }
  });
  $("#btn-reader-next").addEventListener("click", () => {
    if (state.readerCurrentIdx < state.readerChapters.length - 1) { state.readerCurrentIdx++; loadReaderChapter(state.readerCurrentIdx); }
  });

  // Show original toggle
  $("#reader-show-original").addEventListener("change", () => {
    const on = $("#reader-show-original").checked;
    const view = $("#reader-book-view"), origPane = $("#reader-book-original");
    if (on) { view.classList.remove("single-pane"); origPane.style.display = ""; }
    else { view.classList.add("single-pane"); origPane.style.display = "none"; }
  });

  // Show annotations toggle — highlights in translation text
  $("#reader-show-annotations").addEventListener("change", () => {
    const on = $("#reader-show-annotations").checked;
    const transEl = $("#reader-book-translated-content");
    if (on && _currentAnnotations.length > 0) {
      _highlightAnnotatedText(transEl, _currentAnnotations);
    } else {
      transEl.querySelectorAll("mark.ann-highlight").forEach(m => {
        m.replaceWith(document.createTextNode(m.textContent));
      });
      hide($("#reader-ann-tooltip"));
    }
  });

  // Click a highlight → show single annotation tooltip at bottom of reader
  $("#reader-book-translated-content").addEventListener("click", (e) => {
    const mark = e.target.closest("mark.ann-highlight");
    if (!mark) return;
    const idx = parseInt(mark.dataset.annIdx, 10);
    const ann = _currentAnnotations[idx];
    if (ann) _showAnnotationTooltip(ann);
  });

  // Close tooltip
  $("#btn-close-ann-tooltip").addEventListener("click", () => hide($("#reader-ann-tooltip")));

  // View all annotations — open modal
  $("#btn-view-all-annotations").addEventListener("click", () => {
    _renderAnnotationsModal(_currentAnnotations);
    show($("#annotations-overlay"));
  });

  // Close annotations modal
  $("#btn-close-annotations-modal").addEventListener("click", () => hide($("#annotations-overlay")));
  $("#annotations-overlay").addEventListener("click", (e) => {
    if (e.target === $("#annotations-overlay")) hide($("#annotations-overlay"));
  });

  // Text selection for Q&A and highlights
  document.addEventListener("mouseup", (evt) => {
    const panel = $("#panel-reader");
    if (!panel || !panel.classList.contains("active")) return;
    if (evt.target.closest(".reader-highlight-bar") || evt.target.closest(".reader-note-popup")) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { hide($("#reader-highlight-bar")); return; }
    const text = sel.toString().trim();
    if (!text || text.length < 2) { hide($("#reader-highlight-bar")); return; }
    const range = sel.getRangeAt(0);
    const origPane = $("#reader-book-original-content");
    const transPane = $("#reader-book-translated-content");
    if (origPane.contains(range.startContainer)) {
      state.readerSelectedOriginal = text; state.readerSelectedTranslation = "";
      hide($("#reader-highlight-bar"));
    } else if (transPane.contains(range.startContainer)) {
      state.readerSelectedTranslation = text; state.readerSelectedOriginal = "";
      _pendingHighlightText = text;
      const rect = range.getBoundingClientRect();
      const bar = $("#reader-highlight-bar");
      bar.style.top = `${rect.top + window.scrollY - 40}px`;
      bar.style.left = `${rect.left + window.scrollX + rect.width / 2 - 50}px`;
      show(bar);
    } else { hide($("#reader-highlight-bar")); return; }
    $("#reader-qa-selection-text").textContent = text.length > 100 ? text.slice(0, 100) + "…" : text;
    show($("#reader-qa-selection"));
  });
  $("#btn-clear-selection").addEventListener("click", () => { clearQASelection(); hide($("#reader-highlight-bar")); });

  // Highlight action bar
  $("#btn-add-highlight").addEventListener("click", () => {
    if (!_pendingHighlightText) return;
    _currentHighlights.push({ text: _pendingHighlightText, note: "" });
    _saveHighlights();
    _refreshHighlightsDisplay();
    hide($("#reader-highlight-bar"));
    window.getSelection().removeAllRanges();
  });

  $("#btn-add-note").addEventListener("click", () => {
    if (!_pendingHighlightText) return;
    hide($("#reader-highlight-bar"));
    const popup = $("#reader-note-popup");
    $("#reader-note-input").value = "";
    show(popup);
    $("#reader-note-input").focus();
  });

  $("#btn-save-note").addEventListener("click", () => {
    const note = $("#reader-note-input").value.trim();
    _currentHighlights.push({ text: _pendingHighlightText, note });
    _saveHighlights();
    _refreshHighlightsDisplay();
    hide($("#reader-note-popup"));
    window.getSelection().removeAllRanges();
  });

  $("#btn-cancel-note").addEventListener("click", () => { hide($("#reader-note-popup")); });

  // Click user highlight → show dedicated highlight/note tooltip
  $("#reader-book-translated-content").addEventListener("click", (e) => {
    const userMark = e.target.closest("mark.user-highlight");
    if (!userMark) return;
    const hlIdx = parseInt(userMark.dataset.hlIdx, 10);
    if (isNaN(hlIdx) || hlIdx < 0 || hlIdx >= _currentHighlights.length) return;
    const hl = _currentHighlights[hlIdx];
    if (!hl) return;

    const tip = $("#reader-hl-tooltip");
    const body = $("#hl-tooltip-content");
    body.innerHTML = "";

    if (hl.imported) {
      const badge = document.createElement("span");
      badge.className = "hl-imported-badge";
      badge.textContent = t("imported_note");
      body.appendChild(badge);
    }

    if (hl.note) {
      const label = document.createElement("span");
      label.className = "hl-note-label";
      label.textContent = t("user_note");
      body.appendChild(label);
      const noteP = document.createElement("p");
      noteP.className = "hl-note-text";
      noteP.textContent = hl.note;
      body.appendChild(noteP);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-sm btn-danger";
    removeBtn.textContent = hl.note ? t("remove_note") : t("remove_highlight");
    removeBtn.style.marginTop = "6px";
    removeBtn.addEventListener("click", () => {
      _currentHighlights.splice(hlIdx, 1);
      _saveHighlights();
      _refreshHighlightsDisplay();
      hide(tip);
    });
    body.appendChild(removeBtn);

    show(tip);
  });

  // Close user highlight tooltip
  $("#btn-close-hl-tooltip").addEventListener("click", () => hide($("#reader-hl-tooltip")));

  // AI Q&A
  $("#btn-reader-ask").addEventListener("click", askAI);
  $("#reader-qa-question").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(); } });

  // Retranslate from reader
  $("#btn-reader-retranslate").addEventListener("click", async () => {
    if (!state.readerCurrentChapterId) return;
    if (!confirm("确认重新翻译本章？")) return;
    const btn = $("#btn-reader-retranslate"); btn.disabled = true; btn.textContent = "🔄 翻译中…";
    $("#reader-book-translated-content").innerHTML = "<p style='color:var(--text-dim)'>正在重新翻译，请稍候…</p>";
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/chapters/${state.readerCurrentChapterId}/retranslate`, { method: "POST" });
      const timer = setInterval(async () => {
        try {
          const chapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
          const ch = chapters.find(c => c.id === state.readerCurrentChapterId);
          if (!ch) { clearInterval(timer); return; }
          if (ch.status === "translated") {
            clearInterval(timer);
            state.readerChapters = chapters; state.reviewChapters = chapters;
            loadReaderChapter(state.readerCurrentIdx);
            btn.disabled = false; btn.textContent = "🔄 重新翻译本章";
          } else if (ch.status === "pending") {
            clearInterval(timer);
            alert("重新翻译失败，请重试。"); btn.disabled = false; btn.textContent = "🔄 重新翻译本章";
          }
        } catch (e) { console.error("poll retranslate error", e); }
      }, 3000);
    } catch (e) {
      alert("重新翻译失败: " + e.message); btn.disabled = false; btn.textContent = "🔄 重新翻译本章";
    }
  });
}
