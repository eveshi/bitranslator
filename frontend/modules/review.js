/* Review panel + Done panel + Name table */
import { state } from './state.js';
import { $, show, hide, showPanel, apiJson, startPolling, esc } from './core.js';
import { t } from './i18n.js';
import { startTranslation, renderChapterStatusList } from './translate.js';
import { updateRangeHint } from './analysis.js';

// openChapterReader injected from app.js to avoid circular deps
let _openChapterReader = null;
export function setOpenChapterReader(fn) { _openChapterReader = fn; }

export async function showReview(isStopped) {
  state.reviewIsStopped = isStopped;
  try {
    state.reviewChapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
    state.totalChapterCount = state.reviewChapters.length;
    renderReviewList();

    const untranslated = state.reviewChapters.filter(c => c.status !== "translated");
    const hasUntranslated = untranslated.length > 0;
    $("#review-translate-more").style.display = hasUntranslated ? "" : "none";
    if (hasUntranslated) {
      const first = untranslated[0].chapter_index + 1;
      const last = untranslated[untranslated.length - 1].chapter_index + 1;
      $("#review-range-start").value = first; $("#review-range-end").value = last;
      $("#review-range-end").max = state.totalChapterCount; $("#review-range-start").max = state.totalChapterCount;
      updateRangeHint("review-range-start", "review-range-end", "review-range-hint", state.totalChapterCount);
    }
  } catch (e) { console.error("showReview failed", e); }
}

export function renderReviewList() {
  const list = $("#review-chapter-list"); list.innerHTML = "";
  for (const ch of state.reviewChapters) {
    const ctype = ch.chapter_type || "chapter";
    const seq = ch.chapter_index + 1;

    const item = document.createElement("div");
    item.className = "review-chapter-item"; item.dataset.chapterId = ch.id;

    const title = document.createElement("span"); title.className = "ch-title";
    let label = `#${seq} `;
    if (ctype === "chapter" && ch.body_number != null) label += `Ch.${ch.body_number}: `;
    else if (ctype === "part") label += `[${t("part_divider")}${ch.body_number != null ? " " + ch.body_number : ""}] `;
    else if (ctype === "frontmatter") label += `[${t("frontmatter")}] `;
    else if (ctype === "backmatter") label += `[${t("backmatter")}] `;
    else label += "";
    const transTitle = ch.translated_title || "";
    const origTitle = ch.title;
    title.textContent = label + (transTitle && transTitle !== origTitle ? `${transTitle} / ${origTitle}` : origTitle);
    item.appendChild(title);

    const statusEl = document.createElement("span");
    statusEl.className = "ch-status" + (ch.status !== "translated" ? ` ${ch.status}` : "");
    statusEl.textContent = t("status_" + ch.status) || ch.status;
    item.appendChild(statusEl);

    if (ch.status === "translated") {
      item.addEventListener("click", () => _openChapterReader?.(ch));
    } else { item.style.opacity = "0.6"; item.style.cursor = "default"; }
    list.appendChild(item);
  }
}

export async function showDone(isStopped) {
  if (isStopped) {
    $("#done-title").textContent = t("translate_stopped");
    $("#done-hint").textContent = t("done_hint_stopped");
    $("#btn-resume-translate").style.display = "";
  } else {
    $("#done-title").textContent = t("translate_done");
    $("#done-hint").textContent = t("done_hint_complete");
    $("#btn-resume-translate").style.display = "none";
  }
  try {
    const data = await apiJson(`/api/projects/${state.currentProjectId}/chapter-files`);
    renderChapterStatusList(data.chapters, "#chapter-download-list", false);
  } catch (_) {}
}

async function loadNameTable() {
  const container = $("#name-table-content");
  try {
    const resp = await apiJson(`/api/projects/${state.currentProjectId}/name-map`);
    const nameMap = resp.name_map || {};
    // Filter out names that only appear once (noise)
    const entries = Object.entries(nameMap)
      .filter(([, data]) => (data.total || 0) > 1)
      .sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
    if (entries.length === 0) {
      container.innerHTML = `<p class="hint">${t("no_name_data")}</p>`;
      return;
    }

    let html = `<table class="name-table editable-table"><thead><tr>
      <th>${t("original")}</th><th>${t("occurrences")}</th>
      <th>${t("translations_used")}</th>
    </tr></thead><tbody>`;

    for (const [orig, data] of entries) {
      const trans = data.translations || {};
      const transEntries = Object.entries(trans).sort((a, b) => b[1] - a[1]);

      const transHtml = transEntries.map(([tl, c]) =>
        `<span class="name-variant">${esc(tl)} <small>(${c})</small></span>`
      ).join(", ") || `<em class="hint">${t("no_translations") || "未检测到"}</em>`;

      const hasMultiple = transEntries.length > 1;
      const inconsistentClass = hasMultiple ? ' class="inconsistent"' : '';

      html += `<tr${inconsistentClass} data-orig="${esc(orig)}">`;
      html += `<td><strong>${esc(orig)}</strong></td>`;
      html += `<td>${data.total || 0}</td>`;
      html += `<td class="trans-variants">${transHtml}</td>`;
      html += `</tr>`;
    }
    html += "</tbody></table>";
    container.innerHTML = html;

    /* ── Unify / replace buttons are disabled for now ──
     * The name unification feature is experimental and may produce
     * unexpected results.  The buttons below are commented out until
     * the matching logic is more reliable.
     *
     * container.querySelectorAll(".btn-unify").forEach(btn => { ... });
     * container.querySelectorAll(".btn-replace-custom").forEach(btn => { ... });
     */

  } catch (e) { container.innerHTML = `<p class="hint">${t("no_name_data")}</p>`; }
}

const _PHASE_LABELS = {
  extracting: { zh: "提取候选人名…", en: "Extracting candidate names…" },
  ai_verify:  { zh: "AI 验证人名并生成译名…", en: "AI verifying names & translations…" },
  searching:  { zh: "在译文中搜索译名…", en: "Searching translations in text…" },
  done:       { zh: "扫描完成", en: "Scan complete" },
  error:      { zh: "扫描出错", en: "Scan error" },
};

function _phaseLabel(phase) {
  const labels = _PHASE_LABELS[phase];
  if (!labels) return phase;
  const lang = (document.documentElement.lang || "zh").startsWith("en") ? "en" : "zh";
  return labels[lang] || labels.zh;
}

let _nameScanTimer = null;

function _pollNameScan() {
  const container = $("#name-table-content");
  const btn = $("#btn-rescan-names");
  if (_nameScanTimer) clearInterval(_nameScanTimer);

  const renderProgress = (s) => {
    const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    const bar = s.total > 0
      ? `<div class="progress-bar" style="margin:.6rem 0"><div class="progress-fill" style="width:${pct}%"></div></div>`
      : '';
    container.innerHTML = `
      <div style="text-align:center;padding:2rem 0">
        <div class="spinner" style="margin:0 auto .8rem"></div>
        <p><strong>${_phaseLabel(s.phase)}</strong></p>
        ${bar}
        <p class="hint">${s.detail || ''}${s.total > 0 ? ` (${s.done}/${s.total})` : ''}</p>
        <p class="hint" style="margin-top:.5rem">${t("scan_bg_hint") || "扫描在后台运行，可以关闭此面板，稍后再回来查看结果。"}</p>
      </div>`;
  };

  // Show initial state immediately
  renderProgress({ phase: "extracting", detail: "", done: 0, total: 0 });
  btn.disabled = true;
  btn.textContent = t("scanning") || "扫描中…";

  _nameScanTimer = setInterval(async () => {
    try {
      const s = await apiJson(`/api/projects/${state.currentProjectId}/rescan-names/status`);
      if (s.finished) {
        clearInterval(_nameScanTimer); _nameScanTimer = null;
        btn.disabled = false;
        btn.textContent = t("rescan_names") || "🔄 重新扫描全书人名";
        if (s.phase === "error") {
          container.innerHTML = `<p class="hint" style="color:var(--danger,red)">⚠️ ${s.detail}</p>`;
        } else {
          await loadNameTable();
        }
        return;
      }
      renderProgress(s);
    } catch (_) {}
  }, 2000);
}

export function initReview() {
  // Name table overlay
  $("#btn-toggle-name-table").addEventListener("click", async () => {
    show($("#name-table-overlay"));
    try {
      const s = await apiJson(`/api/projects/${state.currentProjectId}/rescan-names/status`);
      if (s.running) { _pollNameScan(); return; }
    } catch (_) {}
    await loadNameTable();
  });
  $("#btn-close-name-table").addEventListener("click", () => hide($("#name-table-overlay")));
  $("#btn-cancel-name-table").addEventListener("click", () => hide($("#name-table-overlay")));

  // Rescan names (background + polling)
  $("#btn-rescan-names").addEventListener("click", async () => {
    const btn = $("#btn-rescan-names");
    btn.disabled = true;
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/rescan-names`, { method: "POST" });
      _pollNameScan();
    } catch (e) { alert("Error: " + e.message); btn.disabled = false; }
  });

  // Translate more chapters
  $("#btn-translate-more").addEventListener("click", () => {
    startTranslation($("#review-range-start"), $("#review-range-end"));
  });

  // Done button
  $("#btn-review-done").addEventListener("click", () => {
    showPanel("done"); showDone(state.reviewIsStopped);
  });

  // Combine & download
  $("#btn-combine-download").addEventListener("click", async () => {
    try {
      $("#btn-combine-download").textContent = t("merging"); $("#btn-combine-download").disabled = true;
      await apiJson(`/api/projects/${state.currentProjectId}/combine`, { method: "POST" });
      window.open(`/api/projects/${state.currentProjectId}/download`, "_blank");
    } catch (e) { alert(t("save_failed") + ": " + e.message); }
    finally { $("#btn-combine-download").textContent = t("combine_download"); $("#btn-combine-download").disabled = false; }
  });

  // Download annotations EPUB
  $("#btn-download-annotations").addEventListener("click", async () => {
    try {
      window.open(`/api/projects/${state.currentProjectId}/download-annotations`, "_blank");
    } catch (e) { alert(t("save_failed") + ": " + e.message); }
  });

  // Resume translation
  $("#btn-resume-translate").addEventListener("click", async () => {
    showPanel("translate");
    $("#btn-stop-translate").disabled = false; $("#btn-stop-translate").textContent = "⏹ 停止翻译";
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/translate/all`, { method: "POST" });
      startPolling();
    } catch (e) { alert("继续翻译失败: " + e.message); }
  });

  // Back to review from done
  $("#btn-back-to-review").addEventListener("click", () => { showPanel("review"); showReview(state.reviewIsStopped); });

  // New project / Home
  $("#btn-new-project").addEventListener("click", () => { state.currentProjectId = null; showPanel("upload"); hide($("#steps-bar")); });
  $("#btn-home").addEventListener("click", () => {
    state.currentProjectId = null; showPanel("upload"); hide($("#steps-bar"));
    // Lazy import to avoid circular; loadProjects is re-exported in app
    import('./upload.js').then(m => m.loadProjects());
  });
}
