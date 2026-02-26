/* Title editor + numbering utilities */
import { state } from './state.js';
import { $, show, hide, apiJson, esc } from './core.js';
import { t } from './i18n.js';
import { loadReaderChapter } from './reader.js';
import { renderReviewList } from './review.js';

const _NUM_PATTERNS = [
  /^(chapter\s+\d+[\s.:：\-–—]*)/i, /^(kapitel\s+\d+[\s.:：\-–—]*)/i,
  /^(chapitre\s+\d+[\s.:：\-–—]*)/i, /^(teil\s+\d+[\s.:：\-–—]*)/i,
  /^(part\s+\d+[\s.:：\-–—]*)/i, /^(book\s+\d+[\s.:：\-–—]*)/i,
  /^(第\s*[一二三四五六七八九十百千\d]+\s*[章节篇卷部回][\s.:：\-–—]*)/,
  /^((?:chapter|kapitel|chapitre|part|teil|partie|book|volume)\s+[IVXLCDM]+[\s.:：\-–—]*)/i,
  /^(\d+[\s.:：\-–—]+)/, /^([IVXLCDM]+[\s.:：\-–—]+)/,
];

function detectNumberPrefix(title) {
  if (!title) return null;
  for (const re of _NUM_PATTERNS) { const m = title.trim().match(re); if (m) return m[1]; }
  return null;
}

function stripNumberPrefix(title) {
  if (!title) return title;
  const p = detectNumberPrefix(title);
  return p ? title.trim().slice(p.length).trim() : title;
}

function getChapterPrefix(lang, num) {
  const l = (lang || "").toLowerCase();
  if (l.startsWith("zh") || l.includes("chinese") || l.includes("中文")) return `第${num}章：`;
  if (l.startsWith("ja") || l.includes("japanese") || l.includes("日")) return `第${num}章：`;
  if (l.startsWith("ko") || l.includes("korean") || l.includes("韩")) return `제${num}장: `;
  if (l.startsWith("de") || l.includes("german") || l.includes("德")) return `Kapitel ${num}: `;
  if (l.startsWith("fr") || l.includes("french") || l.includes("法")) return `Chapitre ${num} : `;
  if (l.startsWith("es") || l.includes("spanish") || l.includes("西班牙")) return `Capítulo ${num}: `;
  if (l.startsWith("it") || l.includes("italian") || l.includes("意")) return `Capitolo ${num}: `;
  if (l.startsWith("ru") || l.includes("russian") || l.includes("俄")) return `Глава ${num}: `;
  return `Chapter ${num}: `;
}

function getPartPrefix(lang, num) {
  const l = (lang || "").toLowerCase();
  if (l.startsWith("zh") || l.includes("chinese") || l.includes("中文")) return `第${num}部：`;
  if (l.startsWith("ja") || l.includes("japanese") || l.includes("日")) return `第${num}部：`;
  if (l.startsWith("ko") || l.includes("korean") || l.includes("韩")) return `제${num}부: `;
  if (l.startsWith("de") || l.includes("german") || l.includes("德")) return `Teil ${num}: `;
  if (l.startsWith("fr") || l.includes("french") || l.includes("法")) return `Partie ${num} : `;
  if (l.startsWith("es") || l.includes("spanish") || l.includes("西班牙")) return `Parte ${num}: `;
  if (l.startsWith("it") || l.includes("italian") || l.includes("意")) return `Parte ${num}: `;
  if (l.startsWith("ru") || l.includes("russian") || l.includes("俄")) return `Часть ${num}: `;
  return `Part ${num}: `;
}

export async function openTitleEditor() {
  if (!state.readerChapters.length && state.currentProjectId) {
    state.readerChapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
    state.reviewChapters = state.readerChapters;
  }
  const list = $("#title-editor-list"); list.innerHTML = "";
  for (const ch of state.readerChapters) {
    const row = document.createElement("div"); row.className = "title-editor-row";
    const chType = ch.chapter_type || "chapter";
    const seq = ch.chapter_index + 1;
    const bodyLabel = ch.body_number != null ? (chType === "part" ? `P${ch.body_number}` : `Ch.${ch.body_number}`) : "";
    row.innerHTML = `
      <div class="te-header">
        <span class="te-seq">#${seq}</span>
        <span class="te-body-num">${esc(bodyLabel)}</span>
        <select class="te-type" data-chapter-id="${ch.id}">
          <option value="frontmatter"${chType === "frontmatter" ? " selected" : ""}>${t("frontmatter")}</option>
          <option value="part"${chType === "part" ? " selected" : ""}>${t("part_divider")}</option>
          <option value="chapter"${chType === "chapter" ? " selected" : ""}>${t("body_chapter")}</option>
          <option value="backmatter"${chType === "backmatter" ? " selected" : ""}>${t("backmatter")}</option>
        </select>
      </div>
      <div class="te-titles">
        <input class="te-orig" data-chapter-id="${ch.id}" value="${esc(ch.title)}" placeholder="${t("original_title")}" />
        <input class="te-trans" data-chapter-id="${ch.id}" value="${esc(ch.translated_title || "")}" placeholder="${t("translated_title")}" />
      </div>`;
    list.appendChild(row);
  }
  show($("#title-editor-overlay"));
}

async function aiTranslateTitles(btn) {
  const origText = btn.textContent; btn.disabled = true; btn.textContent = t("translating_titles");
  try {
    await apiJson(`/api/projects/${state.currentProjectId}/chapters/translate-titles`, { method: "POST" });
    state.readerChapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
    state.reviewChapters = state.readerChapters;
    if (!$("#title-editor-overlay").classList.contains("hidden")) openTitleEditor();
    if ($("#panel-review").classList.contains("active")) renderReviewList();
    if (state.readerCurrentIdx >= 0 && $("#panel-reader").classList.contains("active")) loadReaderChapter(state.readerCurrentIdx);
    btn.textContent = t("titles_translated");
    setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2000);
  } catch (e) { alert(t("save_failed") + ": " + e.message); btn.textContent = origText; btn.disabled = false; }
}

export function initTitles() {
  $("#btn-edit-titles").addEventListener("click", openTitleEditor);
  $("#btn-review-edit-titles").addEventListener("click", openTitleEditor);
  $("#btn-close-title-editor").addEventListener("click", () => hide($("#title-editor-overlay")));
  $("#btn-cancel-title-editor").addEventListener("click", () => hide($("#title-editor-overlay")));

  // Save titles
  $("#btn-save-titles").addEventListener("click", async () => {
    const titles = {}, types = {};
    $("#title-editor-list").querySelectorAll(".te-type").forEach(sel => { types[sel.dataset.chapterId] = sel.value; });
    $("#title-editor-list").querySelectorAll(".te-orig").forEach(input => {
      const id = input.dataset.chapterId;
      const transInput = $(`#title-editor-list .te-trans[data-chapter-id="${id}"]`);
      titles[id] = { title: input.value, translated_title: transInput ? transInput.value : "", chapter_type: types[id] || "chapter" };
    });
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/chapters/titles`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titles }),
      });
      state.readerChapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
      state.reviewChapters = state.readerChapters;
      if ($("#panel-reader").classList.contains("active")) loadReaderChapter(state.readerCurrentIdx);
      if ($("#panel-review").classList.contains("active")) renderReviewList();
      hide($("#title-editor-overlay"));
    } catch (e) { alert(t("save_failed") + ": " + e.message); }
  });

  // AI translate titles (batch — from title editor)
  $("#btn-ai-translate-titles").addEventListener("click", function () { aiTranslateTitles(this); });
  // AI translate current chapter title only (from reader toolbar)
  $("#btn-quick-translate-titles").addEventListener("click", async function () {
    if (!state.readerCurrentChapterId) return;
    const btn = this;
    const origText = btn.textContent;
    btn.disabled = true; btn.textContent = t("translating_titles");
    try {
      const res = await apiJson(
        `/api/projects/${state.currentProjectId}/chapters/${state.readerCurrentChapterId}/translate-title`,
        { method: "POST" },
      );
      if (res.translated_title) {
        const chapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
        state.readerChapters = chapters; state.reviewChapters = chapters;
        loadReaderChapter(state.readerCurrentIdx);
      }
      btn.textContent = t("titles_translated");
      setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2000);
    } catch (e) {
      alert(t("save_failed") + ": " + e.message);
      btn.textContent = origText; btn.disabled = false;
    }
  });

  // Auto-number: detect mode from existing body_numbers
  $("#btn-auto-number").addEventListener("click", () => {
    // Detect numbering mode from current data
    const chapters = state.readerChapters || [];
    let mode = "continuous";
    let prevNum = null, prevPartIdx = -1, lastPartIdx = -1;
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      if ((ch.chapter_type || "chapter") === "part") lastPartIdx = i;
      else if ((ch.chapter_type || "chapter") === "chapter" && ch.body_number != null) {
        if (prevNum != null && lastPartIdx > prevPartIdx && lastPartIdx >= 0 && ch.body_number <= prevNum) {
          mode = "per_part"; break;
        }
        prevNum = ch.body_number; prevPartIdx = lastPartIdx;
      }
    }

    const modeLabel = mode === "per_part"
      ? (t("numbering_per_part") || "检测到：分部编号（每部重新开始）")
      : (t("numbering_continuous") || "检测到：连续编号（跨部递增）");
    if (!confirm(`${modeLabel}\n${t("auto_number_confirm") || "确认应用自动编号？"}`)) return;

    const rows = document.querySelectorAll("#title-editor-list .title-editor-row");
    const tgtLang = ($("#edit-target-lang") || {}).value || "en";
    let partNum = 0, chapterNum = 0, count = 0;
    rows.forEach(row => {
      const typeSelect = row.querySelector(".te-type"); if (!typeSelect) return;
      const ctype = typeSelect.value;
      const origInput = row.querySelector(".te-orig"), transInput = row.querySelector(".te-trans");
      if (ctype === "part") {
        partNum++;
        origInput.value = getPartPrefix("en", partNum) + stripNumberPrefix(origInput.value);
        if (transInput.value.trim()) transInput.value = getPartPrefix(tgtLang, partNum) + stripNumberPrefix(transInput.value);
        if (mode === "per_part") chapterNum = 0;
        count++;
      } else if (ctype === "chapter") {
        chapterNum++;
        origInput.value = getChapterPrefix("en", chapterNum) + stripNumberPrefix(origInput.value);
        if (transInput.value.trim()) transInput.value = getChapterPrefix(tgtLang, chapterNum) + stripNumberPrefix(transInput.value);
        count++;
      }
    });
    alert(t("auto_number_done").replace("{n}", count));
  });

  // Strip / copy numbers
  $("#btn-strip-numbers").addEventListener("click", () => {
    let changed = 0;
    document.querySelectorAll("#title-editor-list .title-editor-row").forEach(row => {
      const inp = row.querySelector(".te-trans"); if (!inp || !inp.value.trim()) return;
      const stripped = stripNumberPrefix(inp.value);
      if (stripped !== inp.value.trim()) { inp.value = stripped; changed++; }
    });
    if (changed === 0) alert(t("no_numbers_found"));
  });

  $("#btn-copy-numbers").addEventListener("click", () => {
    let changed = 0;
    document.querySelectorAll("#title-editor-list .title-editor-row").forEach(row => {
      const origInput = row.querySelector(".te-orig"), transInput = row.querySelector(".te-trans");
      if (!origInput || !transInput || !transInput.value.trim()) return;
      const origPrefix = detectNumberPrefix(origInput.value);
      if (!origPrefix) return;
      const curPrefix = detectNumberPrefix(transInput.value);
      const body = curPrefix ? transInput.value.trim().slice(curPrefix.length).trim() : transInput.value.trim();
      transInput.value = origPrefix + body; changed++;
    });
    if (changed === 0) alert(t("no_numbers_found"));
  });
}
