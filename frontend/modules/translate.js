/* Translation progress panel */
import { state } from './state.js';
import { $, showPanel, apiJson, startPolling } from './core.js';
import { t } from './i18n.js';

export function startTranslation(startEl, endEl) {
  const s = parseInt(startEl.value) || 1;
  const e = parseInt(endEl.value) || state.totalChapterCount;
  const count = e - s + 1;
  if (count < 1) { alert(t("invalid_range") || "请选择有效的范围"); return; }
  if (!confirm(`${t("confirm_translate_range") || "确认翻译"} #${s} ~ #${e}（${t("total_prefix") || "共"} ${count} ${t("chapter_unit") || "项"}）？`)) return;

  state.translateRangeStart = s - 1;
  state.translateRangeEnd = e - 1;

  showPanel("translate");
  $("#btn-stop-translate").disabled = false;
  $("#btn-stop-translate").textContent = "⏹ 停止翻译";
  apiJson(`/api/projects/${state.currentProjectId}/translate/all`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_chapter: s - 1, end_chapter: e - 1 }),
  }).then(() => startPolling()).catch(err => alert("翻译启动失败: " + err.message));
}

export async function updateProgressUI(progress) {
  try {
    const data = await apiJson(`/api/projects/${state.currentProjectId}/chapter-files`);
    const rs = state.translateRangeStart;
    const re = state.translateRangeEnd >= 0 ? state.translateRangeEnd : data.chapters.length - 1;
    const rangeChapters = data.chapters.filter(ch => ch.chapter_index >= rs && ch.chapter_index <= re);
    const total = rangeChapters.length || progress.total_chapters;
    const translated = rangeChapters.filter(ch => ch.status === "translated").length;
    const pct = total > 0 ? Math.round((translated / total) * 100) : 0;
    $("#progress-fill").style.width = pct + "%";
    $("#progress-text").textContent =
      `${translated} / ${total} ${t("items_translated") || "项已翻译"} (${pct}%)` +
      (progress.current_chapter ? ` · ${t("translating") || "翻译中…"} ${progress.current_chapter}` : "");
    renderChapterStatusList(rangeChapters, "#chapter-status-list", true);
  } catch (_) {
    const pct = progress.total_chapters > 0
      ? Math.round((progress.translated_chapters / progress.total_chapters) * 100) : 0;
    $("#progress-fill").style.width = pct + "%";
    $("#progress-text").textContent =
      `${progress.translated_chapters} / ${progress.total_chapters} ${t("items_translated") || "项已翻译"} (${pct}%)` +
      (progress.current_chapter ? ` · ${t("translating") || "翻译中…"} ${progress.current_chapter}` : "");
  }
}

export function renderChapterStatusList(chapters, selector, compact) {
  const container = $(selector); container.innerHTML = "";
  for (const ch of chapters) {
    const row = document.createElement("div");
    row.className = compact ? "chapter-row" : "chapter-dl-row";
    const dot = document.createElement("span");
    dot.className = "status-dot " + ch.status;
    row.appendChild(dot);
    const label = document.createElement("span");
    if (!compact) label.className = "ch-title";
    label.textContent = `#${ch.chapter_index + 1}: ${ch.title}`;
    row.appendChild(label);
    if (ch.file_exists) {
      const dlBtn = document.createElement("a");
      dlBtn.href = `/api/projects/${state.currentProjectId}/chapters/${ch.chapter_id}/download`;
      dlBtn.textContent = compact ? "↓" : t("download_epub");
      dlBtn.className = "btn btn-sm"; dlBtn.style.textDecoration = "none";
      if (compact) dlBtn.style.marginLeft = "auto";
      row.appendChild(dlBtn);
    } else if (!compact) {
      const tag = document.createElement("span");
      tag.textContent = ch.status === "translated" ? t("translated") : t("not_translated");
      tag.style.color = "var(--text-dim)"; tag.style.fontSize = ".8rem";
      row.appendChild(tag);
    }
    container.appendChild(row);
  }
}

export function initTranslate() {
  // Translate range from sample panel
  $("#btn-translate-all").addEventListener("click", () => {
    startTranslation($("#range-start"), $("#range-end"));
  });

  // Stop translation
  $("#btn-stop-translate").addEventListener("click", async () => {
    if (!confirm("确认停止翻译？已翻译的章节不会丢失，您可以稍后继续。")) return;
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/translate/stop`, { method: "POST" });
      $("#btn-stop-translate").disabled = true;
      $("#btn-stop-translate").textContent = "正在停止…";
    } catch (e) { alert("停止失败: " + e.message); }
  });
}
