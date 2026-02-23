/* Analysis panel + chapter overview + range pickers */
import { state } from './state.js';
import { $, show, hide, showPanel, apiJson, startPolling, esc } from './core.js';
import { t } from './i18n.js';

export async function startAnalysis() {
  showPanel("analysis");
  show($("#analysis-loading")); hide($("#analysis-content"));
  try {
    await apiJson(`/api/projects/${state.currentProjectId}/analyze`, { method: "POST" });
    startPolling();
  } catch (e) { alert("启动分析失败: " + e.message); }
}

function _set(sel, prop, val) {
  const el = $(sel);
  if (el) el[prop] = val;
}

export async function showAnalysis() {
  hide($("#analysis-loading"));
  show($("#analysis-content"));
  showPanel("analysis");
  try {
    const proj = await apiJson(`/api/projects/${state.currentProjectId}`);
    _set("#edit-source-lang", "value", proj.source_language || "");
    _set("#edit-target-lang", "value", proj.target_language || "");

    const a = await apiJson(`/api/projects/${state.currentProjectId}/analysis`);

    _set("#ana-author", "textContent", a.author ? `作者: ${a.author}` : "");
    _set("#ana-research", "textContent", a.research_report || "(暂无调研数据)");
    _set("#ana-author-info", "textContent", a.author_info || "");
    _set("#ana-translation-notes", "textContent", a.translation_notes || "");
    _set("#ana-genre", "textContent", a.genre || "");
    _set("#ana-style", "textContent", a.writing_style || "");
    _set("#ana-setting", "textContent", a.setting || "");
    _set("#ana-cultural", "textContent", a.cultural_notes || "");

    const themesList = $("#ana-themes");
    if (themesList) {
      themesList.innerHTML = "";
      (a.themes || []).forEach(th => { const li = document.createElement("li"); li.textContent = th; themesList.appendChild(li); });
    }

    const charDiv = $("#ana-characters");
    if (charDiv) {
      charDiv.innerHTML = "";
      (a.characters || []).forEach(c => {
        const d = document.createElement("div"); d.className = "char-item";
        d.innerHTML = `<strong>${c.name || ""}</strong>: ${c.description || ""}`; charDiv.appendChild(d);
      });
    }

    const termDiv = $("#ana-terms");
    if (termDiv) {
      termDiv.innerHTML = "";
      (a.key_terms || []).forEach(term => {
        const d = document.createElement("div"); d.className = "term-item";
        d.innerHTML = `<strong>${term.term || ""}</strong>: ${term.explanation || ""}`; termDiv.appendChild(d);
      });
    }

    const authorInfoCard = $("#ana-author-info")?.closest(".card");
    const translationNotesCard = $("#ana-translation-notes")?.closest(".card");
    if (authorInfoCard) authorInfoCard.style.display = a.author_info ? "" : "none";
    if (translationNotesCard) translationNotesCard.style.display = a.translation_notes ? "" : "none";

    _set("#analysis-feedback", "value", "");
    await loadChapterOverview();
  } catch (e) {
    console.error("showAnalysis failed", e);
  }
}

export async function loadChapterOverview() {
  try {
    const chapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
    state.totalChapterCount = chapters.length;

    const typeCounts = {};
    chapters.forEach(ch => { const ct = ch.chapter_type || "chapter"; typeCounts[ct] = (typeCounts[ct] || 0) + 1; });
    const parts = [];
    if (typeCounts.frontmatter) parts.push(`${typeCounts.frontmatter} ${t("frontmatter")}`);
    if (typeCounts.part) parts.push(`${typeCounts.part} ${t("part_divider")}`);
    if (typeCounts.chapter) parts.push(`${typeCounts.chapter} ${t("body_chapter")}`);
    if (typeCounts.backmatter) parts.push(`${typeCounts.backmatter} ${t("backmatter")}`);
    $("#ana-chapter-count").textContent = `共 ${chapters.length} 项` + (parts.length > 1 ? `（${parts.join("、")}）` : "");

    const list = $("#ana-chapter-list"); list.innerHTML = "";
    const typeLabels = { frontmatter: t("frontmatter"), part: t("part_divider"), chapter: t("body_chapter"), backmatter: t("backmatter") };
    for (const ch of chapters) {
      const ctype = ch.chapter_type || "chapter";
      const seq = ch.chapter_index + 1;
      const row = document.createElement("div");
      row.className = `ch-row ch-type-${ctype}`;
      const seqTag = `<span class="ch-seq-num">#${seq}</span>`;
      let infoTag = "";
      if (ctype === "chapter" && ch.body_number != null) infoTag = `<span class="ch-type-tag ch-tag-chapter">Ch.${ch.body_number}</span>`;
      else if (ctype === "part" && ch.body_number != null) infoTag = `<span class="ch-type-tag ch-tag-part">${typeLabels.part} ${ch.body_number}</span>`;
      else if (ctype !== "chapter") infoTag = `<span class="ch-type-tag ch-tag-${ctype}">${typeLabels[ctype] || ctype}</span>`;
      else infoTag = `<span class="ch-type-tag ch-tag-chapter">Ch.</span>`;
      row.innerHTML = `${seqTag}${infoTag}<span class="ch-title-text">${esc(ch.title)}</span>`;
      list.appendChild(row);
    }
    initRangePicker(chapters.length);
  } catch (e) { console.error("loadChapterOverview failed", e); }
}

export function initRangePicker(total) {
  $("#range-end").value = total; $("#range-end").max = total; $("#range-start").max = total;
  updateRangeHint("range-start", "range-end", "range-hint", total);

  const presets = $("#range-presets"); presets.innerHTML = "";
  const defs = [];
  if (total > 3) defs.push({ label: "#1 ~ #3", s: 1, e: 3 });
  if (total > 5) defs.push({ label: "#1 ~ #5", s: 1, e: 5 });
  if (total > 10) defs.push({ label: "#1 ~ #10", s: 1, e: 10 });
  defs.push({ label: t("select_all") || "全部", s: 1, e: total });
  for (const p of defs) {
    const btn = document.createElement("button"); btn.textContent = p.label;
    btn.addEventListener("click", () => {
      $("#range-start").value = p.s; $("#range-end").value = p.e;
      updateRangeHint("range-start", "range-end", "range-hint", total);
    });
    presets.appendChild(btn);
  }
  $("#range-start").addEventListener("input", () => updateRangeHint("range-start", "range-end", "range-hint", total));
  $("#range-end").addEventListener("input", () => updateRangeHint("range-start", "range-end", "range-hint", total));

  // Review panel range picker
  $("#review-range-end").value = total; $("#review-range-end").max = total; $("#review-range-start").max = total;
  updateRangeHint("review-range-start", "review-range-end", "review-range-hint", total);
  $("#review-range-start").addEventListener("input", () => updateRangeHint("review-range-start", "review-range-end", "review-range-hint", total));
  $("#review-range-end").addEventListener("input", () => updateRangeHint("review-range-start", "review-range-end", "review-range-hint", total));
}

export function updateRangeHint(startId, endId, hintId, total) {
  const s = parseInt($(`#${startId}`).value) || 1;
  const e = parseInt($(`#${endId}`).value) || total;
  $(`#${hintId}`).textContent = `(共 ${Math.max(0, e - s + 1)} 项)`;
}

export function initAnalysis() {
  // Refine analysis
  $("#btn-refine-analysis").addEventListener("click", async () => {
    const feedback = $("#analysis-feedback").value.trim();
    if (!feedback) { alert("请输入修正意见"); return; }
    if (!confirm("确认根据反馈重新分析？将保留在线调研数据，仅重新生成分析结论。")) return;
    show($("#analysis-loading")); hide($("#analysis-content"));
    $("#analysis-loading-text").textContent = "根据反馈重新分析中…";
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/analysis/refine`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      startPolling();
    } catch (e) {
      alert("重新分析失败: " + e.message);
      show($("#analysis-content")); hide($("#analysis-loading"));
    }
  });

  // Language settings
  $("#btn-save-langs").addEventListener("click", async () => {
    if (!state.currentProjectId) return;
    try {
      await apiJson(`/api/projects/${state.currentProjectId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_language: $("#edit-source-lang").value, target_language: $("#edit-target-lang").value }),
      });
      alert("语言设置已保存！");
    } catch (e) { alert("保存失败: " + e.message); }
  });
}
