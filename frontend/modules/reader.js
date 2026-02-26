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

  // If this chapter is currently being retranslated, keep showing the placeholder
  if (state.retranslatingChapterId === ch.id) {
    try {
      const orig = await apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/original`);
      origEl.innerHTML = textToHtml(orig.text || "", ch.title);
    } catch (_) {}
    transEl.innerHTML = "<p style='color:var(--text-dim)'>正在根据反馈重新翻译，请稍候…</p>";
    return;
  }

  try {
    // Fetch fresh chapter status from API to avoid stale cache
    const freshChapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
    const freshCh = freshChapters.find(c => c.id === ch.id);
    if (freshCh) {
      state.readerChapters[idx] = freshCh;
      Object.assign(ch, freshCh);
    }

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

function _toggleImmersive(force) {
  const on = force !== undefined ? force : !state.immersiveMode;
  state.immersiveMode = on;
  document.body.classList.toggle("immersive", on);

  const btn = $("#btn-reader-immersive");
  if (btn) {
    // In immersive mode the button text is rendered via data-icon + CSS
    // but update data-icon for the exit state
    btn.setAttribute("data-icon", on ? "✕" : "📖");
    btn.textContent = on ? "✕ " + t("exit_immersive") : "📖 " + t("immersive_mode");
  }

  const aiFab = $("#immersive-ai-fab");
  const menuFab = $("#immersive-menu-fab");
  const qa = $("#reader-qa");
  if (on) {
    if (aiFab) show(aiFab);
    if (menuFab) show(menuFab);
    if (qa) qa.classList.remove("qa-visible");
  } else {
    if (aiFab) hide(aiFab);
    if (menuFab) hide(menuFab);
    if (qa) qa.classList.remove("qa-visible");
    const tb = $(".reader-toolbar");
    if (tb) tb.classList.remove("toolbar-visible");
  }
}

export function initReader() {
  _initReaderSettings();

  // Exit reader → back to review (also exit immersive)
  $("#btn-reader-exit").addEventListener("click", () => {
    if (state.immersiveMode) _toggleImmersive(false);
    showPanel("review"); showReview(state.reviewIsStopped);
  });

  // Immersive mode
  $("#btn-reader-immersive")?.addEventListener("click", () => _toggleImmersive());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.immersiveMode) _toggleImmersive(false);
  });

  // Floating AI chat button (immersive mode)
  $("#immersive-ai-fab")?.addEventListener("click", () => {
    const qa = $("#reader-qa");
    if (qa) qa.classList.toggle("qa-visible");
  });

  // Mobile: menu fab toggles toolbar
  $("#immersive-menu-fab")?.addEventListener("click", () => {
    const tb = $(".reader-toolbar");
    if (tb) tb.classList.toggle("toolbar-visible");
  });

  // Mobile: close toolbar when clicking outside
  document.addEventListener("click", (e) => {
    if (!state.immersiveMode || window.innerWidth >= 768) return;
    const tb = $(".reader-toolbar");
    if (!tb || !tb.classList.contains("toolbar-visible")) return;
    if (tb.contains(e.target)) return;
    if (e.target.closest(".immersive-menu-fab") || e.target.closest(".immersive-ai-fab")) return;
    if (e.target.closest(".modal-overlay") || e.target.closest(".reader-qa")) return;
    tb.classList.remove("toolbar-visible");
  });

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

  // Retranslate from reader — open feedback dialog with current strategy options
  $("#btn-reader-retranslate").addEventListener("click", async () => {
    if (!state.readerCurrentChapterId) return;
    $("#retranslate-feedback").value = "";
    $("#retranslate-update-strategy").checked = true;
    try {
      const s = await apiJson(`/api/projects/${state.currentProjectId}/strategy`);
      $("#rt-enable-annotations").checked = !!s.enable_annotations;
      $("#rt-annotate-terms").checked = !!s.annotate_terms;
      $("#rt-annotate-names").checked = !!s.annotate_names;
      $("#rt-free-translation").checked = !!s.free_translation;
      $("#rt-annotation-density").value = s.annotation_density || "normal";
      const dRow = $("#rt-density-row");
      if (dRow) { if (s.enable_annotations) show(dRow); else hide(dRow); }
    } catch (_) {}
    show($("#retranslate-overlay"));
  });

  $("#btn-close-retranslate-modal").addEventListener("click", () => hide($("#retranslate-overlay")));
  $("#btn-cancel-retranslate").addEventListener("click", () => hide($("#retranslate-overlay")));

  // Toggle density visibility in retranslate dialog
  $("#rt-enable-annotations")?.addEventListener("change", () => {
    const dRow = $("#rt-density-row");
    if (dRow) { if ($("#rt-enable-annotations").checked) show(dRow); else hide(dRow); }
  });

  $("#btn-confirm-retranslate").addEventListener("click", async () => {
    const feedback = $("#retranslate-feedback").value.trim();
    if (!feedback) { alert(t("retranslate_placeholder")); return; }
    const updateStrategy = $("#retranslate-update-strategy").checked;
    const strategyOverrides = {
      enable_annotations: $("#rt-enable-annotations").checked,
      annotate_terms: $("#rt-annotate-terms").checked,
      annotate_names: $("#rt-annotate-names").checked,
      free_translation: $("#rt-free-translation").checked,
      annotation_density: $("#rt-annotation-density").value,
    };
    hide($("#retranslate-overlay"));

    const retranslateChId = state.readerCurrentChapterId;
    // Record current version so we can detect when a NEW translation finishes
    const curCh = state.readerChapters[state.readerCurrentIdx];
    const versionBefore = curCh?.translation_version ?? 0;
    state.retranslatingChapterId = retranslateChId;
    const btn = $("#btn-reader-retranslate"); btn.disabled = true; btn.textContent = "🔄 翻译中…";
    $("#reader-book-translated-content").innerHTML = "<p style='color:var(--text-dim)'>正在根据反馈重新翻译，请稍候…</p>";
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/chapters/${retranslateChId}/retranslate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback, update_strategy: updateStrategy, strategy_overrides: strategyOverrides }),
      });
      let sawTranslating = false;
      const timer = setInterval(async () => {
        try {
          const chapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
          const ch = chapters.find(c => c.id === retranslateChId);
          if (!ch) { clearInterval(timer); state.retranslatingChapterId = null; return; }

          if (ch.status === "translating") sawTranslating = true;

          // Only accept "translated" if we've seen "translating" first
          // OR the translation_version has actually incremented
          const versionNow = ch.translation_version ?? 0;
          const versionChanged = versionNow > versionBefore;

          if (ch.status === "translated" && (sawTranslating || versionChanged)) {
            clearInterval(timer);
            state.retranslatingChapterId = null;
            state.readerChapters = chapters; state.reviewChapters = chapters;
            loadReaderChapter(state.readerCurrentIdx);
            btn.disabled = false; btn.textContent = "🔄 重新翻译本章";
          } else if (ch.status === "pending" && sawTranslating) {
            clearInterval(timer);
            state.retranslatingChapterId = null;
            alert("重新翻译失败，请重试。"); btn.disabled = false; btn.textContent = "🔄 重新翻译本章";
          }
        } catch (e) { console.error("poll retranslate error", e); }
      }, 3000);
    } catch (e) {
      state.retranslatingChapterId = null;
      alert("重新翻译失败: " + e.message); btn.disabled = false; btn.textContent = "🔄 重新翻译本章";
    }
  });

  // Version history
  $("#btn-reader-versions").addEventListener("click", async () => {
    if (!state.readerCurrentChapterId) return;
    await _loadVersionHistory();
    show($("#versions-overlay"));
  });

  $("#btn-close-versions-modal").addEventListener("click", () => hide($("#versions-overlay")));
}

async function _loadVersionHistory() {
  const list = $("#versions-list");
  const compare = $("#version-compare");
  hide(compare);
  list.innerHTML = "<p style='color:var(--text-dim)'>加载中…</p>";

  try {
    const versions = await apiJson(
      `/api/projects/${state.currentProjectId}/chapters/${state.readerCurrentChapterId}/versions`
    );
    const ch = state.readerChapters[state.readerCurrentIdx];
    const currentVer = ch?.translation_version || 0;

    if (!versions.length) {
      list.innerHTML = `<p class="hint">${t("ver_no_versions")}</p>`;
      return;
    }

    list.innerHTML = "";
    for (const v of versions) {
      const row = document.createElement("div");
      row.className = "version-row" + (v.version === currentVer ? " active" : "");
      const isCurrent = v.version === currentVer;
      const label = `v${v.version}`;
      const date = v.created_at ? new Date(v.created_at).toLocaleString() : "";
      const stratLabel = v.strategy_version ? `${t("ver_strategy").replace("{n}", v.strategy_version)}` : "";
      const feedbackHtml = v.feedback ? `<div class="ver-feedback">${t("ver_feedback")}${esc(v.feedback)}</div>` : "";

      row.innerHTML = `
        <div class="ver-info">
          <span class="ver-label">${label}${isCurrent ? ` <span class="ver-badge">${t("ver_current")}</span>` : ""}</span>
          <span class="ver-meta">${date}${stratLabel ? " · " + stratLabel : ""}</span>
          ${feedbackHtml}
        </div>
        <div class="ver-actions">
          ${!isCurrent ? `<button class="btn btn-sm ver-btn-compare" data-ver="${v.version}">${t("ver_compare")}</button>` : ""}
          ${!isCurrent ? `<button class="btn btn-sm btn-primary ver-btn-restore" data-ver="${v.version}">${t("ver_restore")}</button>` : ""}
        </div>`;
      list.appendChild(row);
    }

    list.querySelectorAll(".ver-btn-compare").forEach(btn => {
      btn.addEventListener("click", async () => {
        const ver = parseInt(btn.dataset.ver);
        await _showVersionCompare(ver);
      });
    });

    list.querySelectorAll(".ver-btn-restore").forEach(btn => {
      btn.addEventListener("click", async () => {
        const ver = parseInt(btn.dataset.ver);
        if (!confirm(t("confirm_restore_ver").replace("{n}", ver))) return;
        try {
          await apiJson(`/api/projects/${state.currentProjectId}/chapters/${state.readerCurrentChapterId}/versions/${ver}/restore`, { method: "POST" });
          const chapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
          state.readerChapters = chapters; state.reviewChapters = chapters;
          loadReaderChapter(state.readerCurrentIdx);
          await _loadVersionHistory();
        } catch (e) { alert("Restore failed: " + e.message); }
      });
    });
  } catch (e) {
    list.innerHTML = `<p class="hint">${t("ver_no_versions")}</p>`;
  }
}

async function _showVersionCompare(version) {
  const compare = $("#version-compare");
  show(compare);

  try {
    const vData = await apiJson(
      `/api/projects/${state.currentProjectId}/chapters/${state.readerCurrentChapterId}/versions/${version}`
    );
    const currentTrans = await apiJson(
      `/api/projects/${state.currentProjectId}/chapters/${state.readerCurrentChapterId}/translation`
    );
    const ch = state.readerChapters[state.readerCurrentIdx];

    $("#version-compare-label-current").textContent = `当前 v${ch?.translation_version ?? 0}`;
    $("#version-compare-label-old").textContent = `v${version}`;
    $("#version-compare-current").textContent = currentTrans.text || "";
    $("#version-compare-old").textContent = vData.translated_content || "";
  } catch (e) {
    console.error("Version compare failed", e);
  }
}
