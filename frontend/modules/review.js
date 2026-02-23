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
    const entries = Object.entries(nameMap);
    if (entries.length === 0) {
      container.innerHTML = `<p class="hint">${t("no_name_data")}</p>`;
      return;
    }
    entries.sort((a, b) => (b[1].total || 0) - (a[1].total || 0));

    let html = `<table class="name-table editable-table"><thead><tr>
      <th>${t("original")}</th><th>${t("occurrences")}</th>
      <th>${t("translations_used")}</th>
      <th>${t("preferred_translation") || "首选译名"}</th>
      <th>${t("actions") || "操作"}</th>
    </tr></thead><tbody>`;

    for (const [orig, data] of entries) {
      const trans = data.translations || {};
      const transEntries = Object.entries(trans).sort((a, b) => b[1] - a[1]);
      const mainTrans = transEntries.length > 0 ? transEntries[0][0] : "";

      // Translation variants display
      const transHtml = transEntries.map(([tl, c]) =>
        `<span class="name-variant">${esc(tl)} <small>(${c})</small></span>`
      ).join(", ") || `<em class="hint">${t("no_translations") || "未检测到"}</em>`;

      // Inconsistency indicator
      const hasMultiple = transEntries.length > 1;
      const inconsistentClass = hasMultiple ? ' class="inconsistent"' : '';

      html += `<tr${inconsistentClass} data-orig="${esc(orig)}">`;
      html += `<td><strong>${esc(orig)}</strong></td>`;
      html += `<td>${data.total || 0}</td>`;
      html += `<td class="trans-variants">${transHtml}</td>`;
      html += `<td><input class="unify-input" value="${esc(mainTrans)}" placeholder="${t("enter_translation") || "输入译名"}" /></td>`;
      html += `<td class="name-actions">`;
      if (hasMultiple) {
        for (const [variant] of transEntries.slice(1)) {
          html += `<button class="btn btn-sm btn-unify" data-find="${esc(variant)}" title="${t("replace_all_with_preferred") || "全书替换为首选译名"}">${t("unify") || "统一"} "${esc(variant)}"</button>`;
        }
      }
      html += `<button class="btn btn-sm btn-replace-custom" title="${t("custom_replace") || "自定义搜索替换"}">${t("search_replace") || "搜索替换"}</button>`;
      html += `</td></tr>`;
    }
    html += "</tbody></table>";
    container.innerHTML = html;

    // Unify buttons — replace specific variant with preferred
    container.querySelectorAll(".btn-unify").forEach(btn => {
      btn.addEventListener("click", async () => {
        const row = btn.closest("tr");
        const replaceInput = row.querySelector(".unify-input");
        const findText = btn.dataset.find;
        const replaceText = replaceInput.value.trim();
        if (!replaceText) { alert(t("enter_translation") || "请输入译名"); return; }
        if (findText === replaceText) return;
        btn.disabled = true; btn.textContent = "…";
        try {
          const resp = await apiJson(`/api/projects/${state.currentProjectId}/unify-name`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ find: findText, replace: replaceText }),
          });
          alert(t("unify_done").replace("{n}", resp.replaced));
          await loadNameTable();
        } catch (e) { alert("Error: " + e.message); btn.disabled = false; btn.textContent = `${t("unify")} "${findText}"`; }
      });
    });

    // Custom search-replace button — user types what to find
    container.querySelectorAll(".btn-replace-custom").forEach(btn => {
      btn.addEventListener("click", async () => {
        const row = btn.closest("tr");
        const replaceText = row.querySelector(".unify-input").value.trim();
        if (!replaceText) { alert(t("enter_translation") || "请输入译名"); return; }
        const findText = prompt(t("enter_find_text") || "输入要替换的文本（将在全书中被替换为首选译名）：");
        if (!findText || !findText.trim() || findText.trim() === replaceText) return;
        btn.disabled = true; btn.textContent = "…";
        try {
          const resp = await apiJson(`/api/projects/${state.currentProjectId}/unify-name`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ find: findText.trim(), replace: replaceText }),
          });
          alert(t("unify_done").replace("{n}", resp.replaced));
          await loadNameTable();
        } catch (e) { alert("Error: " + e.message); btn.disabled = false; btn.textContent = t("search_replace") || "搜索替换"; }
      });
    });
  } catch (e) { container.innerHTML = `<p class="hint">${t("no_name_data")}</p>`; }
}

export function initReview() {
  // Name table overlay
  $("#btn-toggle-name-table").addEventListener("click", async () => {
    show($("#name-table-overlay"));
    await loadNameTable();
  });
  $("#btn-close-name-table").addEventListener("click", () => hide($("#name-table-overlay")));
  $("#btn-cancel-name-table").addEventListener("click", () => hide($("#name-table-overlay")));

  // Rescan names
  $("#btn-rescan-names").addEventListener("click", async () => {
    const btn = $("#btn-rescan-names");
    btn.disabled = true; btn.textContent = t("scanning") || "扫描中…";
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/rescan-names`, { method: "POST" });
      await loadNameTable();
    } catch (e) { alert("Error: " + e.message); }
    finally { btn.disabled = false; btn.textContent = t("rescan_names") || "🔄 重新扫描全书人名"; }
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
