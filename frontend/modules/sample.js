/* Sample translation panel */
import { state } from './state.js';
import { $, show, hide, showPanel, apiJson, startPolling, stopPolling, esc } from './core.js';
import { t } from './i18n.js';
import { collectStrategyEdits } from './strategy.js';
import { initRangePicker } from './analysis.js';

function renderChapterOverview(chapters) {
  const list = $("#sample-chapter-overview");
  if (!list) return;
  list.innerHTML = "";
  const typeLabels = {
    frontmatter: t("frontmatter"), part: t("part_divider"),
    chapter: t("body_chapter"), backmatter: t("backmatter"),
  };
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
}

export async function showSample() {
  hide($("#sample-loading"));
  show($("#sample-content"));
  showPanel("sample");
  try {
    const proj = await apiJson(`/api/projects/${state.currentProjectId}`);
    const sampleIdx = proj.sample_chapter_index || 0;
    const chapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
    if (!chapters.length) return;
    state.totalChapterCount = chapters.length;
    initRangePicker(state.totalChapterCount);
    renderChapterOverview(chapters);

    const ch = chapters.find(c => c.chapter_index === sampleIdx) || chapters[0];
    const orig = await apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/original`);
    const trans = await apiJson(`/api/projects/${state.currentProjectId}/chapters/${ch.id}/translation`);
    $("#sample-original").textContent = orig.text || "(无内容)";
    $("#sample-translated").textContent = trans.text || "(尚未翻译)";
  } catch (e) {
    console.error("showSample failed", e);
  }
}

function pollForRetranslate() {
  stopPolling();
  state.pollTimer = setInterval(async () => {
    if (!state.currentProjectId) return;
    try {
      const project = await apiJson(`/api/projects/${state.currentProjectId}`);
      if (project.status === "strategy_generated") {
        stopPolling();
        $("#sample-loading-text").textContent = "翻译样章中…";
        const sampleIdx = project.sample_chapter_index || 0;
        await apiJson(`/api/projects/${state.currentProjectId}/translate/sample`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapter_index: sampleIdx }),
        });
        startPolling();
      } else if (project.status === "sample_ready") { stopPolling(); await showSample(); }
      else if (project.status === "error") { stopPolling(); alert("出错: " + (project.error_message || "未知错误")); await showSample(); }
    } catch (e) { console.error("pollForRetranslate error", e); }
  }, 3000);
}

export function initSample() {
  // Translate sample
  $("#btn-translate-sample").addEventListener("click", async () => {
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/strategy`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectStrategyEdits()),
      });
    } catch (_) {}
    const sampleIdx = parseInt($("#sample-chapter-select").value) || 0;
    showPanel("sample"); show($("#sample-loading")); hide($("#sample-content"));
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/translate/sample`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_index: sampleIdx }),
      });
      startPolling();
    } catch (e) { alert("样章翻译启动失败: " + e.message); }
  });

  // Refine & retranslate sample
  $("#btn-refine-and-retranslate").addEventListener("click", async () => {
    const feedback = $("#sample-feedback").value.trim();
    if (!feedback) { alert("请输入反馈内容"); return; }
    try {
      hide($("#sample-content")); show($("#sample-loading"));
      $("#sample-loading-text").textContent = "根据反馈调整策略并重新翻译样章…";
      await apiJson(`/api/projects/${state.currentProjectId}/strategy/refine`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      pollForRetranslate();
    } catch (e) { alert("策略调整失败: " + e.message); }
  });
}
