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
    const [orig, trans, annResp] = await Promise.all([
      apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/original`),
      apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/translation`),
      apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/annotations`).catch(() => ({ annotations: [] })),
    ]);
    origEl.innerHTML = textToHtml(orig.text || "", ch.title);
    transEl.innerHTML = ch.status === "translated"
      ? textToHtml(trans.text || "", ch.translated_title || ch.title)
      : `<p style='color:var(--text-dim)'>(${t("not_translated_yet")})</p>`;

    _currentAnnotations = annResp.annotations || [];
    hide($("#reader-ann-tooltip"));

    if ($("#reader-show-annotations").checked && _currentAnnotations.length > 0) {
      _highlightAnnotatedText(transEl, _currentAnnotations);
    }
  } catch (e) {
    console.error("loadReaderChapter failed", e);
    origEl.innerHTML = "<p>加载失败</p>"; transEl.innerHTML = "<p>加载失败</p>";
    _currentAnnotations = [];
  }
  clearQASelection();
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

export function initReader() {
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

  // Text selection for Q&A
  document.addEventListener("mouseup", () => {
    const panel = $("#panel-reader");
    if (!panel || !panel.classList.contains("active")) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text || text.length < 2) return;
    const range = sel.getRangeAt(0);
    const origPane = $("#reader-book-original-content");
    const transPane = $("#reader-book-translated-content");
    if (origPane.contains(range.startContainer)) { state.readerSelectedOriginal = text; state.readerSelectedTranslation = ""; }
    else if (transPane.contains(range.startContainer)) { state.readerSelectedTranslation = text; state.readerSelectedOriginal = ""; }
    else return;
    $("#reader-qa-selection-text").textContent = text.length > 100 ? text.slice(0, 100) + "…" : text;
    show($("#reader-qa-selection"));
  });
  $("#btn-clear-selection").addEventListener("click", clearQASelection);

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
