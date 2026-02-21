/* BiTranslator – Frontend Application */

const API = "";  // same origin

// ── i18n ───────────────────────────────────────────────────────────────
const I18N = {
  zh: {
    app_title: "BiTranslator – 智能全书翻译",
    tagline: "智能全书翻译",
    llm_settings: "LLM 设置",
    provider: "提供商",
    api_key: "API Key",
    analysis_model: "分析模型",
    translation_model: "翻译模型 (可选, 留空则使用分析模型)",
    temperature: "Temperature",
    save_settings: "保存设置",
    settings_saved: "LLM 设置已保存！",
    save_failed: "保存失败",
    upload_title: "上传 EPUB 文件",
    target_language: "目标语言",
    uploading: "上传中…",
    upload_btn: "上传并开始分析",
    step_upload: "上传", step_analysis: "分析", step_strategy: "策略",
    step_sample: "样章", step_translate: "翻译", step_review: "审阅",
    step_reader: "阅读", step_done: "完成",
    analyzing: "正在深度分析…",
    genre: "体裁", themes: "主题", writing_style: "写作风格",
    setting_bg: "背景设定", characters: "主要角色",
    key_terms: "关键术语", cultural_notes: "文化注释",
    author_label: "作者", author_info: "作者简介",
    research_report: "完整调研报告", translation_notes: "翻译注意事项",
    chapter_overview: "章节概览",
    analysis_feedback: "如有分析错误（如角色名称、术语等），请在此输入修正意见：",
    refine_analysis: "重新分析",
    generate_strategy: "生成翻译策略 →",
    source_lang_label: "源语言（自动检测）",
    target_lang_label: "目标语言",
    save_lang: "保存",
    strategy_title: "翻译策略",
    overall_approach: "总体策略",
    tone_and_style: "语气与风格",
    character_names: "角色名称",
    glossary: "术语表",
    cultural_adaptation: "文化适应",
    special_considerations: "特殊注意事项",
    custom_instructions: "自定义指令",
    strategy_feedback: "对翻译策略有修改建议？请输入：",
    regen_strategy: "重新生成策略",
    back_to_analysis: "← 返回分析",
    translate_sample: "翻译样章",
    sample_chapter: "选择样章",
    sample_title: "样章翻译",
    sample_hint: "请审阅译文质量。如不满意，可修改翻译策略后重新翻译。",
    retranslate_sample: "修改策略并重新翻译样章",
    start_full_translate: "开始翻译选定章节 →",
    from_chapter: "从第",
    to_chapter: "到第",
    chapter_unit: "章",
    translating: "翻译中…",
    stop_translate: "停止翻译",
    translate_stopped: "⏸ 翻译已停止",
    translate_done: "✅ 翻译完成！",
    review_title: "📖 审阅译文",
    review_hint: "点击已翻译的章节进入阅读器阅读。如果对某章不满意，可以在阅读器中重新翻译。",
    translate_more: "📖 继续翻译更多章节",
    start_translate: "开始翻译 →",
    confirm_done: "确认完成，前往下载 →",
    chapter_prefix: "第",
    frontmatter: "前言",
    backmatter: "附录",
    body_chapter: "正文",
    original_title: "原文标题",
    translated_title: "译文标题",
    edit_chapter_titles: "✏️ 编辑章节标题",
    edit_titles_hint: "设置章节类型（前言/正文/附录）和双语标题。正文类章节将自动编号。",
    edit_titles_note: "可设置前言/正文/附录类型，编辑双语标题",
    save_all_titles: "保存所有标题",
    cancel: "取消",
    back_to_review: "← 返回审阅",
    retranslate_this: "🔄 重新翻译本章",
    show_original: "显示原文",
    ai_assistant: "🤖 AI 翻译助手",
    ai_hint: "选中文字后提问，或直接输入问题",
    selected_text: "选中文字：",
    ask_placeholder: "例如：这里为什么这样翻译？原文是什么意思？",
    ask_btn: "提问",
    not_translated_yet: "本章尚未翻译",
    combine_download: "合并为完整 EPUB 并下载",
    merging: "合并中…",
    download_chapters: "逐章下载",
    continue_translate: "继续翻译剩余章节",
    new_book: "翻译新书",
    home: "🏠 翻译新书",
    done_hint_stopped: "已翻译的章节已保存。您可以下载已完成的章节，或继续翻译剩余部分。",
    done_hint_complete: "每章译文已单独保存为 EPUB。您可以逐章下载，也可以合并为完整译本。",
    download_epub: "下载 EPUB",
    translated: "已翻译",
    not_translated: "未翻译",
    status_translated: "已翻译",
    status_translating: "翻译中…",
    status_pending: "未翻译",
    language: "网站语言/Website Language",
    projects: "项目列表",
    no_projects: "暂无项目，上传 EPUB 开始翻译",
    prev_chapter: "◀ 上一章",
    next_chapter: "下一章 ▶",
    generating_strategy: "正在生成翻译策略…",
    ai_translate_titles: "🤖 AI 一键翻译所有标题",
    ai_translate_titles_short: "🤖 翻译标题",
    translating_titles: "正在翻译标题…",
    titles_translated: "标题翻译完成！",
    auto_number: "🔢 自动编号正文章节",
    strip_numbers: "🔢 去除译文编号",
    copy_numbers: "🔢 从原文复制编号到译文",
    no_numbers_found: "未检测到编号。",
    auto_number_done: "已为 {n} 个正文章节自动编号。",
    delete_project: "删除项目",
    confirm_delete_project: "确定要删除项目「{name}」吗？此操作不可撤销，所有数据将被永久删除。",
    delete_failed: "删除失败",
  },
  en: {
    app_title: "BiTranslator – Intelligent Book Translation",
    tagline: "Intelligent Book Translation",
    llm_settings: "LLM Settings",
    provider: "Provider",
    api_key: "API Key",
    analysis_model: "Analysis Model",
    translation_model: "Translation Model (optional, uses analysis model if empty)",
    temperature: "Temperature",
    save_settings: "Save Settings",
    settings_saved: "LLM settings saved!",
    save_failed: "Save failed",
    upload_title: "Upload EPUB File",
    target_language: "Target Language",
    uploading: "Uploading…",
    upload_btn: "Upload & Start Analysis",
    step_upload: "Upload", step_analysis: "Analysis", step_strategy: "Strategy",
    step_sample: "Sample", step_translate: "Translate", step_review: "Review",
    step_reader: "Reader", step_done: "Done",
    analyzing: "Deep analyzing…",
    genre: "Genre", themes: "Themes", writing_style: "Writing Style",
    setting_bg: "Setting", characters: "Main Characters",
    key_terms: "Key Terms", cultural_notes: "Cultural Notes",
    author_label: "Author", author_info: "Author Info",
    research_report: "Full Research Report", translation_notes: "Translation Notes",
    chapter_overview: "Chapter Overview",
    analysis_feedback: "If the analysis has errors (character names, terms, etc.), enter corrections here:",
    refine_analysis: "Re-analyze",
    generate_strategy: "Generate Translation Strategy →",
    source_lang_label: "Source Language (auto-detected)",
    target_lang_label: "Target Language",
    save_lang: "Save",
    strategy_title: "Translation Strategy",
    overall_approach: "Overall Approach",
    tone_and_style: "Tone & Style",
    character_names: "Character Names",
    glossary: "Glossary",
    cultural_adaptation: "Cultural Adaptation",
    special_considerations: "Special Considerations",
    custom_instructions: "Custom Instructions",
    strategy_feedback: "Any suggestions to modify the translation strategy?",
    regen_strategy: "Regenerate Strategy",
    back_to_analysis: "← Back to Analysis",
    translate_sample: "Translate Sample",
    sample_chapter: "Select Sample Chapter",
    sample_title: "Sample Translation",
    sample_hint: "Review translation quality. If unsatisfied, modify the strategy and re-translate.",
    retranslate_sample: "Modify Strategy & Re-translate Sample",
    start_full_translate: "Start Translating Selected Chapters →",
    from_chapter: "From Ch.",
    to_chapter: "To Ch.",
    chapter_unit: "",
    translating: "Translating…",
    stop_translate: "Stop Translation",
    translate_stopped: "⏸ Translation Stopped",
    translate_done: "✅ Translation Complete!",
    review_title: "📖 Review Translations",
    review_hint: "Click a translated chapter to open the reader. Re-translate from within the reader if needed.",
    translate_more: "📖 Translate More Chapters",
    start_translate: "Start Translation →",
    confirm_done: "Confirm & Go to Download →",
    chapter_prefix: "Ch.",
    frontmatter: "Front Matter",
    backmatter: "Back Matter",
    body_chapter: "Chapter",
    original_title: "Original Title",
    translated_title: "Translated Title",
    edit_chapter_titles: "✏️ Edit Chapter Titles",
    edit_titles_hint: "Set chapter types (front matter/chapter/back matter) and bilingual titles. Chapter-type entries are auto-numbered.",
    edit_titles_note: "Set front matter/chapter/back matter types, edit bilingual titles",
    save_all_titles: "Save All Titles",
    cancel: "Cancel",
    back_to_review: "← Back to Review",
    retranslate_this: "🔄 Re-translate This Chapter",
    show_original: "Show Original",
    ai_assistant: "🤖 AI Translation Assistant",
    ai_hint: "Select text then ask, or type a question directly",
    selected_text: "Selected text:",
    ask_placeholder: "e.g. Why was this translated this way? What does the original mean?",
    ask_btn: "Ask",
    not_translated_yet: "Not translated yet",
    combine_download: "Combine into Full EPUB & Download",
    merging: "Merging…",
    download_chapters: "Download by Chapter",
    continue_translate: "Continue Translating Remaining",
    new_book: "Translate New Book",
    home: "🏠 Translate New Book",
    done_hint_stopped: "Translated chapters are saved. Download completed chapters or continue translating.",
    done_hint_complete: "Each chapter saved as individual EPUB. Download by chapter or combine into one.",
    download_epub: "Download EPUB",
    translated: "Translated",
    not_translated: "Not Translated",
    status_translated: "Translated",
    status_translating: "Translating…",
    status_pending: "Pending",
    language: "Language",
    projects: "Projects",
    no_projects: "No projects yet. Upload an EPUB to start.",
    prev_chapter: "◀ Prev",
    next_chapter: "Next ▶",
    generating_strategy: "Generating translation strategy…",
    ai_translate_titles: "🤖 AI Translate All Titles",
    ai_translate_titles_short: "🤖 Translate Titles",
    translating_titles: "Translating titles…",
    titles_translated: "Titles translated!",
    auto_number: "🔢 Auto-number Chapters",
    strip_numbers: "🔢 Strip Numbering from Translated",
    copy_numbers: "🔢 Copy Numbering from Original",
    no_numbers_found: "No numbering detected.",
    auto_number_done: "Auto-numbered {n} body chapters.",
    delete_project: "Delete project",
    confirm_delete_project: "Delete project \"{name}\"? This cannot be undone — all data will be permanently removed.",
    delete_failed: "Delete failed",
  },
};

let currentLang = localStorage.getItem("app-lang") || "zh";

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || (I18N.zh[key]) || key;
}

function applyI18n() {
  document.title = t("app_title");
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (el.tagName === "INPUT" && el.type !== "button" && el.type !== "submit") {
      el.placeholder = t(key);
    } else {
      const firstChild = el.firstChild;
      if (firstChild && firstChild.nodeType === Node.TEXT_NODE && el.children.length > 0) {
        firstChild.textContent = t(key) + " ";
      } else if (el.children.length === 0) {
        el.textContent = t(key);
      }
    }
  });
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem("app-lang", lang);
  applyI18n();
}

function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// ── State ──────────────────────────────────────────────────────────────
let currentProjectId = null;
let pollTimer = null;

// ── DOM helpers ────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function showPanel(name) {
  $$(".panel").forEach(p => p.classList.remove("active"));
  const panel = $(`#panel-${name}`);
  if (panel) panel.classList.add("active");

  // Update step bar
  const steps = ["upload", "analysis", "strategy", "sample", "translate", "review", "reader", "done"];
  const idx = steps.indexOf(name);
  const bar = $("#steps-bar");
  if (idx >= 0) {
    show(bar);
    bar.querySelectorAll(".step").forEach((s, i) => {
      s.classList.remove("active", "done");
      if (i < idx) s.classList.add("done");
      if (i === idx) s.classList.add("active");
    });
  }
}

async function api(path, options = {}) {
  const resp = await fetch(API + path, options);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || JSON.stringify(err));
  }
  return resp;
}

async function apiJson(path, options = {}) {
  const resp = await api(path, options);
  return resp.json();
}

// ── LLM Settings ───────────────────────────────────────────────────────
function getModelValue() {
  const provider = $("#llm-provider").value;
  if (provider === "gemini") return $("#llm-model").value;
  return $("#llm-model-custom").value;
}
function getTranslationModelValue() {
  const provider = $("#llm-provider").value;
  if (provider === "gemini") return $("#llm-translation-model").value;
  return $("#llm-translation-model-custom").value;
}

$("#btn-save-llm").addEventListener("click", async () => {
  try {
    await apiJson("/api/settings/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: $("#llm-provider").value,
        api_key: $("#llm-api-key").value,
        base_url: $("#llm-base-url").value,
        model: getModelValue(),
        translation_model: getTranslationModelValue(),
        temperature: parseFloat($("#llm-temperature").value),
      }),
    });
    alert(t("settings_saved"));
  } catch (e) {
    alert(t("save_failed") + ": " + e.message);
  }
});

function updateProviderUI() {
  const provider = $("#llm-provider").value;
  const baseUrlLabel = $("#label-base-url");
  const isGemini = provider === "gemini";

  // Toggle dropdown vs text input for model fields
  $("#llm-model").style.display = isGemini ? "" : "none";
  $("#llm-model-custom").style.display = isGemini ? "none" : "";
  $("#llm-translation-model").style.display = isGemini ? "" : "none";
  $("#llm-translation-model-custom").style.display = isGemini ? "none" : "";

  if (isGemini) {
    hide(baseUrlLabel);
    $("#llm-base-url").value = "";
    $("#llm-model").value = "gemini-2.5-pro";
    $("#llm-api-key").placeholder = "AIza...";
  } else if (provider === "ollama") {
    show(baseUrlLabel);
    $("#llm-base-url").value = "http://localhost:11434/v1";
    $("#llm-model-custom").value = "llama3";
    $("#llm-api-key").placeholder = "(not required)";
  } else {
    show(baseUrlLabel);
    $("#llm-base-url").value = "https://api.openai.com/v1";
    $("#llm-model-custom").value = "gpt-4o";
    $("#llm-api-key").placeholder = "sk-...";
  }
}
$("#llm-provider").addEventListener("change", updateProviderUI);
updateProviderUI();

// ── Project List ───────────────────────────────────────────────────────
async function loadProjects() {
  try {
    const projects = await apiJson("/api/projects");
    const list = $("#project-list");
    list.innerHTML = "";
    for (const p of projects) {
      const div = document.createElement("div");
      div.className = "project-item" + (p.id === currentProjectId ? " active" : "");
      const chLabel = currentLang === "en" ? "ch" : "章";
      div.innerHTML = `<div class="project-info"><div>${esc(p.name)}</div><div class="project-status">${statusLabel(p.status)} · ${p.translated_count}/${p.chapter_count} ${chLabel}</div></div><button class="btn-delete-project" title="${t("delete_project")}">&times;</button>`;
      div.querySelector(".project-info").addEventListener("click", () => openProject(p.id));
      div.querySelector(".btn-delete-project").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(t("confirm_delete_project").replace("{name}", p.name))) return;
        try {
          await apiJson(`/api/projects/${p.id}`, { method: "DELETE" });
          if (currentProjectId === p.id) {
            currentProjectId = null;
            showPanel("upload");
            hide($("#steps-bar"));
          }
          await loadProjects();
        } catch (err) {
          alert(t("delete_failed") + ": " + err.message);
        }
      });
      list.appendChild(div);
    }
  } catch (e) {
    console.error("Failed to load projects", e);
  }
}

function statusLabel(s) {
  const zh = {
    uploaded: "已上传", analyzing: "分析中…", analyzed: "已分析",
    generating_strategy: "策略生成中…", strategy_generated: "策略就绪",
    translating_sample: "样章翻译中…", sample_ready: "样章就绪",
    translating: "翻译中…", stopped: "已停止", completed: "已完成", error: "出错",
  };
  const en = {
    uploaded: "Uploaded", analyzing: "Analyzing…", analyzed: "Analyzed",
    generating_strategy: "Generating strategy…", strategy_generated: "Strategy ready",
    translating_sample: "Translating sample…", sample_ready: "Sample ready",
    translating: "Translating…", stopped: "Stopped", completed: "Completed", error: "Error",
  };
  const map = currentLang === "en" ? en : zh;
  return map[s] || s;
}

// ── Upload ─────────────────────────────────────────────────────────────
const dropZone = $("#drop-zone");
const fileInput = $("#file-input");

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    uploadFile(e.dataTransfer.files[0]);
  }
});

$("#btn-upload").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) uploadFile(fileInput.files[0]);
});

async function uploadFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("source_language", "auto");
  fd.append("target_language", $("#target-lang").value);

  try {
    $("#btn-upload").textContent = "上传中…";
    $("#btn-upload").disabled = true;
    const project = await apiJson("/api/projects", { method: "POST", body: fd });
    currentProjectId = project.id;
    await loadProjects();
    await openProject(project.id);
  } catch (e) {
    alert("上传失败: " + e.message);
  } finally {
    $("#btn-upload").textContent = "选择文件并上传";
    $("#btn-upload").disabled = false;
  }
}

// ── Open Project (route to correct panel) ──────────────────────────────
async function openProject(projectId) {
  currentProjectId = projectId;
  stopPolling();
  await loadProjects();

  const project = await apiJson(`/api/projects/${projectId}`);
  $("#edit-source-lang").value = project.source_language || "";
  $("#edit-target-lang").value = project.target_language || "";

  switch (project.status) {
    case "uploaded":
      showPanel("analysis");
      hide($("#analysis-loading"));
      hide($("#analysis-content"));
      startAnalysis();
      break;
    case "analyzing":
      showPanel("analysis");
      show($("#analysis-loading"));
      hide($("#analysis-content"));
      pollStatus();
      break;
    case "analyzed":
      showPanel("analysis");
      await showAnalysis();
      break;
    case "generating_strategy":
      showPanel("strategy");
      show($("#strategy-loading"));
      hide($("#strategy-content"));
      pollStatus();
      break;
    case "strategy_generated":
      showPanel("strategy");
      await showStrategy();
      break;
    case "translating_sample":
      showPanel("sample");
      show($("#sample-loading"));
      hide($("#sample-content"));
      pollStatus();
      break;
    case "sample_ready":
      showPanel("sample");
      await showSample();
      break;
    case "translating":
      showPanel("translate");
      pollStatus();
      break;
    case "stopped":
      showPanel("review");
      await showReview(true);
      break;
    case "completed":
      showPanel("review");
      await showReview(false);
      break;
    case "error":
      alert("项目出错: " + (project.error_message || "未知错误") + "\n将返回上一个可用步骤。");
      showPanel("analysis");
      try { await showAnalysis(); } catch (_) {}
      break;
  }
}

// ── Language Settings ───────────────────────────────────────────────────
$("#btn-save-langs").addEventListener("click", async () => {
  if (!currentProjectId) return;
  try {
    await apiJson(`/api/projects/${currentProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_language: $("#edit-source-lang").value,
        target_language: $("#edit-target-lang").value,
      }),
    });
    alert("语言设置已保存！");
  } catch (e) {
    alert("保存失败: " + e.message);
  }
});

// ── Analysis ───────────────────────────────────────────────────────────
async function startAnalysis() {
  showPanel("analysis");
  show($("#analysis-loading"));
  hide($("#analysis-content"));
  try {
    await apiJson(`/api/projects/${currentProjectId}/analyze`, { method: "POST" });
    pollStatus();
  } catch (e) {
    alert("启动分析失败: " + e.message);
  }
}

async function showAnalysis() {
  hide($("#analysis-loading"));
  try {
    // Refresh project data to pick up auto-detected source language
    const proj = await apiJson(`/api/projects/${currentProjectId}`);
    $("#edit-source-lang").value = proj.source_language || "";
    $("#edit-target-lang").value = proj.target_language || "";

    const a = await apiJson(`/api/projects/${currentProjectId}/analysis`);

    // Author & research
    $("#ana-author").textContent = a.author ? `作者: ${a.author}` : "";
    $("#ana-research").textContent = a.research_report || "(暂无调研数据)";
    $("#ana-author-info").textContent = a.author_info || "";
    $("#ana-translation-notes").textContent = a.translation_notes || "";

    // Basic analysis fields
    $("#ana-genre").textContent = a.genre;
    const themesList = $("#ana-themes");
    themesList.innerHTML = "";
    (a.themes || []).forEach(t => {
      const li = document.createElement("li");
      li.textContent = t;
      themesList.appendChild(li);
    });
    $("#ana-style").textContent = a.writing_style;
    $("#ana-setting").textContent = a.setting;
    $("#ana-cultural").textContent = a.cultural_notes;

    const charDiv = $("#ana-characters");
    charDiv.innerHTML = "";
    (a.characters || []).forEach(c => {
      const d = document.createElement("div");
      d.className = "char-item";
      d.innerHTML = `<strong>${c.name || ""}</strong>: ${c.description || ""}`;
      charDiv.appendChild(d);
    });

    const termDiv = $("#ana-terms");
    termDiv.innerHTML = "";
    (a.key_terms || []).forEach(t => {
      const d = document.createElement("div");
      d.className = "term-item";
      d.innerHTML = `<strong>${t.term || ""}</strong>: ${t.explanation || ""}`;
      termDiv.appendChild(d);
    });

    // Hide empty sections
    const authorInfoCard = $("#ana-author-info").closest(".card");
    const translationNotesCard = $("#ana-translation-notes").closest(".card");
    if (authorInfoCard) authorInfoCard.style.display = a.author_info ? "" : "none";
    if (translationNotesCard) translationNotesCard.style.display = a.translation_notes ? "" : "none";

    // Clear previous feedback
    $("#analysis-feedback").value = "";

    show($("#analysis-content"));
    showPanel("analysis");
    await loadChapterOverview();
  } catch (e) {
    console.error("showAnalysis failed", e);
  }
}

let totalChapterCount = 0;
async function loadChapterOverview() {
  try {
    const chapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
    totalChapterCount = chapters.length;
    $("#ana-chapter-count").textContent = `共 ${chapters.length} 章`;

    const list = $("#ana-chapter-list");
    list.innerHTML = "";
    for (const ch of chapters) {
      const row = document.createElement("div");
      row.className = "ch-row";
      row.innerHTML = `<span class="ch-idx">${ch.chapter_index + 1}.</span><span>${ch.title}</span>`;
      list.appendChild(row);
    }

    // Initialize range pickers with chapter count
    initRangePicker(chapters.length);
  } catch (e) {
    console.error("loadChapterOverview failed", e);
  }
}

function initRangePicker(total) {
  // Sample panel range picker
  $("#range-end").value = total;
  $("#range-end").max = total;
  $("#range-start").max = total;
  updateRangeHint("range-start", "range-end", "range-hint", total);

  // Presets
  const presets = $("#range-presets");
  presets.innerHTML = "";
  const presetDefs = [];
  if (total > 3) presetDefs.push({ label: "前 3 章", s: 1, e: 3 });
  if (total > 5) presetDefs.push({ label: "前 5 章", s: 1, e: 5 });
  if (total > 10) presetDefs.push({ label: "前 10 章", s: 1, e: 10 });
  presetDefs.push({ label: "全部章节", s: 1, e: total });
  for (const p of presetDefs) {
    const btn = document.createElement("button");
    btn.textContent = p.label;
    btn.addEventListener("click", () => {
      $("#range-start").value = p.s;
      $("#range-end").value = p.e;
      updateRangeHint("range-start", "range-end", "range-hint", total);
    });
    presets.appendChild(btn);
  }

  $("#range-start").addEventListener("input", () => updateRangeHint("range-start", "range-end", "range-hint", total));
  $("#range-end").addEventListener("input", () => updateRangeHint("range-start", "range-end", "range-hint", total));

  // Review panel range picker
  $("#review-range-end").value = total;
  $("#review-range-end").max = total;
  $("#review-range-start").max = total;
  updateRangeHint("review-range-start", "review-range-end", "review-range-hint", total);
  $("#review-range-start").addEventListener("input", () => updateRangeHint("review-range-start", "review-range-end", "review-range-hint", total));
  $("#review-range-end").addEventListener("input", () => updateRangeHint("review-range-start", "review-range-end", "review-range-hint", total));
}

function updateRangeHint(startId, endId, hintId, total) {
  const s = parseInt($(`#${startId}`).value) || 1;
  const e = parseInt($(`#${endId}`).value) || total;
  const count = Math.max(0, e - s + 1);
  $(`#${hintId}`).textContent = `(共 ${count} 章)`;
}

// ── Refine Analysis ─────────────────────────────────────────────────────
$("#btn-refine-analysis").addEventListener("click", async () => {
  const feedback = $("#analysis-feedback").value.trim();
  if (!feedback) { alert("请输入修正意见"); return; }
  if (!confirm("确认根据反馈重新分析？将保留在线调研数据，仅重新生成分析结论。")) return;

  show($("#analysis-loading"));
  hide($("#analysis-content"));
  $("#analysis-loading-text").textContent = "根据反馈重新分析中…";
  try {
    await apiJson(`/api/projects/${currentProjectId}/analysis/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
    pollStatus();
  } catch (e) {
    alert("重新分析失败: " + e.message);
    show($("#analysis-content"));
    hide($("#analysis-loading"));
  }
});

$("#btn-gen-strategy").addEventListener("click", async () => {
  showPanel("strategy");
  show($("#strategy-loading"));
  hide($("#strategy-content"));
  try {
    await apiJson(`/api/projects/${currentProjectId}/strategy/generate`, { method: "POST" });
    pollStatus();
  } catch (e) {
    alert("生成策略失败: " + e.message);
  }
});

// ── Strategy ───────────────────────────────────────────────────────────
async function showStrategy() {
  hide($("#strategy-loading"));
  try {
    const s = await apiJson(`/api/projects/${currentProjectId}/strategy`);
    $("#strat-approach").value = s.overall_approach || "";
    $("#strat-tone").value = s.tone_and_style || "";
    $("#strat-cultural").value = s.cultural_adaptation || "";
    $("#strat-special").value = s.special_considerations || "";
    $("#strat-custom").value = s.custom_instructions || "";

    // Populate sample chapter selector
    const chapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
    totalChapterCount = chapters.length;
    const sel = $("#sample-chapter-select");
    sel.innerHTML = "";
    for (const ch of chapters) {
      const opt = document.createElement("option");
      opt.value = ch.chapter_index;
      opt.textContent = `${ch.chapter_index + 1} — ${ch.title}`;
      sel.appendChild(opt);
    }
    // Default to chapter 1 (index 0), but if most books have an intro,
    // try to pick the second chapter if available
    if (chapters.length > 1) sel.value = "1";

    const namesBody = $("#strat-names");
    namesBody.innerHTML = "";
    (s.character_names || []).forEach((n, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input data-field="original" data-idx="${i}" value="${esc(n.original || "")}" /></td>
        <td><input data-field="translated" data-idx="${i}" value="${esc(n.translated || "")}" /></td>
        <td><input data-field="note" data-idx="${i}" value="${esc(n.note || "")}" /></td>`;
      namesBody.appendChild(tr);
    });

    const glossBody = $("#strat-glossary");
    glossBody.innerHTML = "";
    (s.glossary || []).forEach((g, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><input data-field="source" data-gidx="${i}" value="${esc(g.source || "")}" /></td>
        <td><input data-field="target" data-gidx="${i}" value="${esc(g.target || "")}" /></td>
        <td><input data-field="context" data-gidx="${i}" value="${esc(g.context || "")}" /></td>`;
      glossBody.appendChild(tr);
    });

    // Clear previous feedback
    $("#strategy-feedback").value = "";

    show($("#strategy-content"));
    showPanel("strategy");
  } catch (e) {
    console.error("showStrategy failed", e);
  }
}

function collectStrategyEdits() {
  const names = [];
  $("#strat-names").querySelectorAll("tr").forEach(tr => {
    const inputs = tr.querySelectorAll("input");
    names.push({ original: inputs[0].value, translated: inputs[1].value, note: inputs[2].value });
  });
  const glossary = [];
  $("#strat-glossary").querySelectorAll("tr").forEach(tr => {
    const inputs = tr.querySelectorAll("input");
    glossary.push({ source: inputs[0].value, target: inputs[1].value, context: inputs[2].value });
  });
  return {
    overall_approach: $("#strat-approach").value,
    tone_and_style: $("#strat-tone").value,
    cultural_adaptation: $("#strat-cultural").value,
    special_considerations: $("#strat-special").value,
    custom_instructions: $("#strat-custom").value,
    character_names: names,
    glossary: glossary,
  };
}

$("#btn-save-strategy").addEventListener("click", async () => {
  try {
    await apiJson(`/api/projects/${currentProjectId}/strategy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectStrategyEdits()),
    });
    alert("策略已保存！");
  } catch (e) {
    alert("保存失败: " + e.message);
  }
});

// ── Back to Analysis from Strategy ──────────────────────────────────
$("#btn-back-to-analysis").addEventListener("click", async () => {
  showPanel("analysis");
  await showAnalysis();
});

// ── Regenerate Strategy with Feedback ────────────────────────────────
$("#btn-regen-strategy").addEventListener("click", async () => {
  const feedback = $("#strategy-feedback").value.trim();
  if (!feedback) { alert("请输入反馈内容"); return; }

  // Save current edits first so they're preserved
  try {
    await apiJson(`/api/projects/${currentProjectId}/strategy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectStrategyEdits()),
    });
  } catch (_) {}

  show($("#strategy-loading"));
  hide($("#strategy-content"));
  try {
    await apiJson(`/api/projects/${currentProjectId}/strategy/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
    pollStatus();
  } catch (e) {
    alert("策略重新生成失败: " + e.message);
    hide($("#strategy-loading"));
    show($("#strategy-content"));
  }
});

// ── Sample Translation ─────────────────────────────────────────────────
$("#btn-translate-sample").addEventListener("click", async () => {
  // Save strategy first
  try {
    await apiJson(`/api/projects/${currentProjectId}/strategy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectStrategyEdits()),
    });
  } catch (_) {}

  const sampleIdx = parseInt($("#sample-chapter-select").value) || 0;

  showPanel("sample");
  show($("#sample-loading"));
  hide($("#sample-content"));
  try {
    await apiJson(`/api/projects/${currentProjectId}/translate/sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter_index: sampleIdx }),
    });
    pollStatus();
  } catch (e) {
    alert("样章翻译启动失败: " + e.message);
  }
});

async function showSample() {
  hide($("#sample-loading"));
  try {
    const proj = await apiJson(`/api/projects/${currentProjectId}`);
    const sampleIdx = proj.sample_chapter_index || 0;

    const chapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
    if (!chapters.length) return;
    totalChapterCount = chapters.length;
    initRangePicker(totalChapterCount);

    const ch = chapters.find(c => c.chapter_index === sampleIdx) || chapters[0];
    const orig = await apiJson(`/api/projects/${currentProjectId}/chapters/${ch.id}/original`);
    const trans = await apiJson(`/api/projects/${currentProjectId}/chapters/${ch.id}/translation`);
    $("#sample-original").textContent = orig.text || "(无内容)";
    $("#sample-translated").textContent = trans.text || "(尚未翻译)";
    show($("#sample-content"));
    showPanel("sample");
  } catch (e) {
    console.error("showSample failed", e);
  }
}

// ── Refine & Re-translate Sample ───────────────────────────────────────
$("#btn-refine-and-retranslate").addEventListener("click", async () => {
  const feedback = $("#sample-feedback").value.trim();
  if (!feedback) { alert("请输入反馈内容"); return; }
  try {
    hide($("#sample-content"));
    show($("#sample-loading"));
    $("#sample-loading-text").textContent = "根据反馈调整策略并重新翻译样章…";

    await apiJson(`/api/projects/${currentProjectId}/strategy/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
    // Wait for strategy to regenerate, then trigger sample re-translation
    pollForRetranslate();
  } catch (e) {
    alert("策略调整失败: " + e.message);
  }
});

function pollForRetranslate() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!currentProjectId) return;
    try {
      const project = await apiJson(`/api/projects/${currentProjectId}`);
      if (project.status === "strategy_generated") {
        stopPolling();
        $("#sample-loading-text").textContent = "翻译样章中…";
        const sampleIdx = project.sample_chapter_index || 0;
        await apiJson(`/api/projects/${currentProjectId}/translate/sample`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapter_index: sampleIdx }),
        });
        pollStatus();
      } else if (project.status === "sample_ready") {
        stopPolling();
        await showSample();
      } else if (project.status === "error") {
        stopPolling();
        alert("出错: " + (project.error_message || "未知错误"));
        await showSample();
      }
    } catch (e) {
      console.error("pollForRetranslate error", e);
    }
  }, 3000);
}

// ── Full Translation ───────────────────────────────────────────────────
async function startTranslation(startEl, endEl) {
  const s = parseInt(startEl.value) || 1;
  const e = parseInt(endEl.value) || totalChapterCount;
  const count = e - s + 1;
  if (count < 1) { alert("请选择有效的章节范围"); return; }
  if (!confirm(`确认翻译第 ${s} 章到第 ${e} 章（共 ${count} 章）？`)) return;

  showPanel("translate");
  $("#btn-stop-translate").disabled = false;
  $("#btn-stop-translate").textContent = "⏹ 停止翻译";
  try {
    await apiJson(`/api/projects/${currentProjectId}/translate/all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start_chapter: s - 1, end_chapter: e - 1 }),
    });
    pollStatus();
  } catch (e) {
    alert("翻译启动失败: " + e.message);
  }
}

$("#btn-translate-all").addEventListener("click", () => {
  startTranslation($("#range-start"), $("#range-end"));
});

// ── Progress Polling ───────────────────────────────────────────────────
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function pollStatus() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (!currentProjectId) return;
    try {
      const project = await apiJson(`/api/projects/${currentProjectId}`);
      await loadProjects();

      if (project.status === "analyzed") {
        stopPolling();
        await showAnalysis();
      } else if (project.status === "strategy_generated") {
        stopPolling();
        await showStrategy();
      } else if (project.status === "sample_ready") {
        stopPolling();
        await showSample();
      } else if (project.status === "translating") {
        showPanel("translate");
        const progress = await apiJson(`/api/projects/${currentProjectId}/progress`);
        await updateProgressUI(progress);
      } else if (project.status === "stopped") {
        stopPolling();
        showPanel("review");
        await showReview(true);
      } else if (project.status === "completed") {
        stopPolling();
        showPanel("review");
        await showReview(false);
      } else if (project.status === "error") {
        stopPolling();
        alert("出错: " + (project.error_message || "未知错误"));
      }
    } catch (e) {
      console.error("Poll error", e);
    }
  }, 3000);
}

async function updateProgressUI(progress) {
  const pct = progress.total_chapters > 0
    ? Math.round((progress.translated_chapters / progress.total_chapters) * 100) : 0;
  $("#progress-fill").style.width = pct + "%";
  $("#progress-text").textContent =
    `${progress.translated_chapters} / ${progress.total_chapters} 章已翻译 (${pct}%)` +
    (progress.current_chapter ? ` · 正在翻译: ${progress.current_chapter}` : "");

  // Show per-chapter status with download links
  try {
    const data = await apiJson(`/api/projects/${currentProjectId}/chapter-files`);
    renderChapterStatusList(data.chapters, "#chapter-status-list", true);
  } catch (_) {}
}

// ── Stop Translation ───────────────────────────────────────────────────
$("#btn-stop-translate").addEventListener("click", async () => {
  if (!confirm("确认停止翻译？已翻译的章节不会丢失，您可以稍后继续。")) return;
  try {
    await apiJson(`/api/projects/${currentProjectId}/translate/stop`, { method: "POST" });
    $("#btn-stop-translate").disabled = true;
    $("#btn-stop-translate").textContent = "正在停止…";
  } catch (e) {
    alert("停止失败: " + e.message);
  }
});

// ── Review Panel ──────────────────────────────────────────────────────
let reviewChapters = [];
let reviewIsStopped = false;

async function showReview(isStopped) {
  reviewIsStopped = isStopped;

  try {
    reviewChapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
    totalChapterCount = reviewChapters.length;
    renderReviewList();

    // Set "translate more" range to next untranslated chapters
    const untranslated = reviewChapters.filter(c => c.status !== "translated");
    const hasUntranslated = untranslated.length > 0;
    $("#review-translate-more").style.display = hasUntranslated ? "" : "none";
    if (hasUntranslated) {
      const firstUntrans = untranslated[0].chapter_index + 1;
      const lastUntrans = untranslated[untranslated.length - 1].chapter_index + 1;
      $("#review-range-start").value = firstUntrans;
      $("#review-range-end").value = lastUntrans;
      $("#review-range-end").max = totalChapterCount;
      $("#review-range-start").max = totalChapterCount;
      updateRangeHint("review-range-start", "review-range-end", "review-range-hint", totalChapterCount);
    }
  } catch (e) {
    console.error("showReview failed", e);
  }
}

function renderReviewList() {
  const list = $("#review-chapter-list");
  list.innerHTML = "";
  let chapterNum = 0;
  for (const ch of reviewChapters) {
    const ctype = ch.chapter_type || "chapter";
    if (ctype === "chapter") chapterNum++;

    const item = document.createElement("div");
    item.className = "review-chapter-item";
    item.dataset.chapterId = ch.id;

    const title = document.createElement("span");
    title.className = "ch-title";
    let label = "";
    if (ctype === "chapter") {
      label = `${t("chapter_prefix")} ${chapterNum}: `;
    } else if (ctype === "frontmatter") {
      label = `[${t("frontmatter")}] `;
    } else if (ctype === "backmatter") {
      label = `[${t("backmatter")}] `;
    }
    const transTitle = ch.translated_title || "";
    const origTitle = ch.title;
    title.textContent = label + (transTitle && transTitle !== origTitle ? `${transTitle} / ${origTitle}` : origTitle);
    item.appendChild(title);

    const status = document.createElement("span");
    status.className = "ch-status" + (ch.status !== "translated" ? ` ${ch.status}` : "");
    status.textContent = t("status_" + ch.status) || ch.status;
    item.appendChild(status);

    if (ch.status === "translated") {
      item.addEventListener("click", () => openChapterReader(ch));
    } else {
      item.style.opacity = "0.6";
      item.style.cursor = "default";
    }

    list.appendChild(item);
  }
}

async function openChapterReader(ch) {
  // Load chapters into reader and jump to the selected chapter
  readerChapters = reviewChapters.length ? reviewChapters
    : await apiJson(`/api/projects/${currentProjectId}/chapters`);
  const idx = readerChapters.findIndex(c => c.id === ch.id);
  readerCurrentIdx = idx >= 0 ? idx : 0;
  showPanel("reader");
  loadReaderChapter(readerCurrentIdx);
}

function textToHtml(text, chapterTitle) {
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
    if (trimmed.length < 60 && /^(第.{1,6}[章节回部篇]|Chapter\s+\d|Part\s+\d|PART\s+\d|\d+\.)/.test(trimmed)) return `<h2>${escaped}</h2>`;
    return `<p>${escaped}</p>`;
  }).join("");
}

$("#btn-translate-more").addEventListener("click", () => {
  startTranslation($("#review-range-start"), $("#review-range-end"));
});

$("#btn-review-done").addEventListener("click", () => {
  showPanel("done");
  showDone(reviewIsStopped);
});

// ── Done Panel ─────────────────────────────────────────────────────────
async function showDone(isStopped) {
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
    const data = await apiJson(`/api/projects/${currentProjectId}/chapter-files`);
    renderChapterStatusList(data.chapters, "#chapter-download-list", false);
  } catch (_) {}
}

function renderChapterStatusList(chapters, selector, compact) {
  const container = $(selector);
  container.innerHTML = "";
  for (const ch of chapters) {
    const row = document.createElement("div");
    row.className = compact ? "chapter-row" : "chapter-dl-row";

    if (compact) {
      const dot = document.createElement("span");
      dot.className = "status-dot " + ch.status;
      row.appendChild(dot);
      const label = document.createElement("span");
      label.textContent = `${t("chapter_prefix")} ${ch.chapter_index + 1}: ${ch.title}`;
      row.appendChild(label);
      if (ch.file_exists) {
        const dlBtn = document.createElement("a");
        dlBtn.href = `${API}/api/projects/${currentProjectId}/chapters/${ch.chapter_id}/download`;
        dlBtn.textContent = "↓";
        dlBtn.className = "btn btn-sm";
        dlBtn.style.marginLeft = "auto";
        dlBtn.style.textDecoration = "none";
        row.appendChild(dlBtn);
      }
    } else {
      const dot = document.createElement("span");
      dot.className = "status-dot " + ch.status;
      row.appendChild(dot);
      const title = document.createElement("span");
      title.className = "ch-title";
      title.textContent = `${t("chapter_prefix")} ${ch.chapter_index + 1}: ${ch.title}`;
      row.appendChild(title);
      if (ch.file_exists) {
        const dlBtn = document.createElement("a");
        dlBtn.href = `${API}/api/projects/${currentProjectId}/chapters/${ch.chapter_id}/download`;
        dlBtn.textContent = t("download_epub");
        dlBtn.className = "btn btn-sm";
        dlBtn.style.textDecoration = "none";
        row.appendChild(dlBtn);
      } else {
        const tag = document.createElement("span");
        tag.textContent = ch.status === "translated" ? t("translated") : t("not_translated");
        tag.style.color = "var(--text-dim)";
        tag.style.fontSize = ".8rem";
        row.appendChild(tag);
      }
    }
    container.appendChild(row);
  }
}

// ── Combine & Download ─────────────────────────────────────────────────
$("#btn-combine-download").addEventListener("click", async () => {
  try {
    $("#btn-combine-download").textContent = t("merging");
    $("#btn-combine-download").disabled = true;
    await apiJson(`/api/projects/${currentProjectId}/combine`, { method: "POST" });
    window.open(`${API}/api/projects/${currentProjectId}/download`, "_blank");
  } catch (e) {
    alert(t("save_failed") + ": " + e.message);
  } finally {
    $("#btn-combine-download").textContent = t("combine_download");
    $("#btn-combine-download").disabled = false;
  }
});

// ── Resume Translation ─────────────────────────────────────────────────
$("#btn-resume-translate").addEventListener("click", async () => {
  showPanel("translate");
  $("#btn-stop-translate").disabled = false;
  $("#btn-stop-translate").textContent = "⏹ 停止翻译";
  try {
    await apiJson(`/api/projects/${currentProjectId}/translate/all`, { method: "POST" });
    pollStatus();
  } catch (e) {
    alert("继续翻译失败: " + e.message);
  }
});

$("#btn-back-to-review").addEventListener("click", () => {
  showPanel("review");
  showReview(reviewIsStopped);
});

$("#btn-new-project").addEventListener("click", () => {
  currentProjectId = null;
  showPanel("upload");
  hide($("#steps-bar"));
});

$("#btn-home").addEventListener("click", () => {
  currentProjectId = null;
  showPanel("upload");
  hide($("#steps-bar"));
  loadProjects();
});

// ── Book Reader ─────────────────────────────────────────────────────────
let readerChapters = [];
let readerCurrentIdx = 0;
let readerSelectedOriginal = "";
let readerSelectedTranslation = "";
let readerCurrentChapterId = "";

$("#btn-reader-exit").addEventListener("click", () => {
  showPanel("review");
  showReview(reviewIsStopped);
});

$("#btn-reader-prev").addEventListener("click", () => {
  if (readerCurrentIdx > 0) {
    readerCurrentIdx--;
    loadReaderChapter(readerCurrentIdx);
  }
});

$("#btn-reader-next").addEventListener("click", () => {
  if (readerCurrentIdx < readerChapters.length - 1) {
    readerCurrentIdx++;
    loadReaderChapter(readerCurrentIdx);
  }
});

$("#reader-show-original").addEventListener("change", () => {
  const show = $("#reader-show-original").checked;
  const view = $("#reader-book-view");
  const origPane = $("#reader-book-original");
  if (show) {
    view.classList.remove("single-pane");
    origPane.style.display = "";
  } else {
    view.classList.add("single-pane");
    origPane.style.display = "none";
  }
});

function chapterDisplayLabel(ch) {
  const ctype = ch.chapter_type || "chapter";
  let num = "";
  if (ctype === "chapter") {
    let chapterNum = 0;
    for (const c of readerChapters) {
      if ((c.chapter_type || "chapter") === "chapter") chapterNum++;
      if (c.id === ch.id) break;
    }
    num = `${t("chapter_prefix")} ${chapterNum}: `;
  }
  const origTitle = ch.title;
  const transTitle = ch.translated_title || "";
  if (transTitle && transTitle !== origTitle) return `${num}${transTitle} / ${origTitle}`;
  return `${num}${origTitle}`;
}

async function loadReaderChapter(idx) {
  const ch = readerChapters[idx];
  if (!ch) return;
  readerCurrentChapterId = ch.id;

  $("#reader-nav-label").textContent = chapterDisplayLabel(ch);
  $("#btn-reader-prev").disabled = idx === 0;
  $("#btn-reader-next").disabled = idx === readerChapters.length - 1;

  const origEl = $("#reader-book-original-content");
  const transEl = $("#reader-book-translated-content");
  origEl.innerHTML = "<p style='color:var(--text-dim)'>...</p>";
  transEl.innerHTML = "<p style='color:var(--text-dim)'>...</p>";

  try {
    const [orig, trans] = await Promise.all([
      apiJson(`/api/projects/${currentProjectId}/chapters/${ch.id}/original`),
      apiJson(`/api/projects/${currentProjectId}/chapters/${ch.id}/translation`),
    ]);
    origEl.innerHTML = textToHtml(orig.text || "", ch.title);
    transEl.innerHTML = ch.status === "translated"
      ? textToHtml(trans.text || "", ch.translated_title || ch.title)
      : `<p style='color:var(--text-dim)'>(${t("not_translated_yet")})</p>`;
  } catch (e) {
    console.error("loadReaderChapter failed", e);
    origEl.innerHTML = "<p>加载失败</p>";
    transEl.innerHTML = "<p>加载失败</p>";
  }

  // Clear Q&A selection
  clearQASelection();
}

// ── Text selection for Q&A ──────────────────────────────────────────
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

  if (origPane.contains(range.startContainer)) {
    readerSelectedOriginal = text;
    readerSelectedTranslation = "";
  } else if (transPane.contains(range.startContainer)) {
    readerSelectedTranslation = text;
    readerSelectedOriginal = "";
  } else {
    return;
  }

  $("#reader-qa-selection-text").textContent = text.length > 100 ? text.slice(0, 100) + "…" : text;
  show($("#reader-qa-selection"));
});

function clearQASelection() {
  readerSelectedOriginal = "";
  readerSelectedTranslation = "";
  hide($("#reader-qa-selection"));
  $("#reader-qa-selection-text").textContent = "";
}

$("#btn-clear-selection").addEventListener("click", clearQASelection);

// ── AI Q&A ──────────────────────────────────────────────────────────
$("#btn-reader-ask").addEventListener("click", askAI);
$("#reader-qa-question").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askAI(); }
});

async function askAI() {
  const question = $("#reader-qa-question").value.trim();
  if (!question) return;

  const msgs = $("#reader-qa-messages");

  // Show user message
  const userMsg = document.createElement("div");
  userMsg.className = "qa-msg user";
  let userContent = "";
  if (readerSelectedOriginal) {
    userContent += `<span class="qa-selection-badge">原文: "${esc(readerSelectedOriginal.slice(0, 80))}"</span>`;
  }
  if (readerSelectedTranslation) {
    userContent += `<span class="qa-selection-badge">译文: "${esc(readerSelectedTranslation.slice(0, 80))}"</span>`;
  }
  userContent += esc(question);
  userMsg.innerHTML = userContent;
  msgs.appendChild(userMsg);
  msgs.scrollTop = msgs.scrollHeight;

  // Show loading
  const aiMsg = document.createElement("div");
  aiMsg.className = "qa-msg ai";
  aiMsg.textContent = "思考中…";
  msgs.appendChild(aiMsg);
  msgs.scrollTop = msgs.scrollHeight;

  $("#reader-qa-question").value = "";

  try {
    const resp = await apiJson(`/api/projects/${currentProjectId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        selected_original: readerSelectedOriginal,
        selected_translation: readerSelectedTranslation,
        chapter_id: readerCurrentChapterId,
      }),
    });
    aiMsg.innerHTML = textToHtml(resp.answer || "(无回复)");
  } catch (e) {
    aiMsg.textContent = "提问失败: " + e.message;
  }
  msgs.scrollTop = msgs.scrollHeight;
  clearQASelection();
}

// ── Retranslate from Reader ──────────────────────────────────────────
$("#btn-reader-retranslate").addEventListener("click", async () => {
  if (!readerCurrentChapterId) return;
  if (!confirm("确认重新翻译本章？")) return;

  const btn = $("#btn-reader-retranslate");
  btn.disabled = true;
  btn.textContent = "🔄 翻译中…";
  $("#reader-book-translated-content").innerHTML = "<p style='color:var(--text-dim)'>正在重新翻译，请稍候…</p>";

  try {
    await apiJson(`/api/projects/${currentProjectId}/chapters/${readerCurrentChapterId}/retranslate`, { method: "POST" });
    // Poll until done
    const timer = setInterval(async () => {
      try {
        const chapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
        const ch = chapters.find(c => c.id === readerCurrentChapterId);
        if (!ch) { clearInterval(timer); return; }
        if (ch.status === "translated") {
          clearInterval(timer);
          readerChapters = chapters;
          reviewChapters = chapters;
          loadReaderChapter(readerCurrentIdx);
          btn.disabled = false;
          btn.textContent = "🔄 重新翻译本章";
        } else if (ch.status === "pending") {
          clearInterval(timer);
          alert("重新翻译失败，请重试。");
          btn.disabled = false;
          btn.textContent = "🔄 重新翻译本章";
        }
      } catch (e) {
        console.error("poll retranslate error", e);
      }
    }, 3000);
  } catch (e) {
    alert("重新翻译失败: " + e.message);
    btn.disabled = false;
    btn.textContent = "🔄 重新翻译本章";
  }
});

// ── Title Editor ────────────────────────────────────────────────────
async function openTitleEditor() {
  // Ensure chapters are loaded
  if (!readerChapters.length && currentProjectId) {
    readerChapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
    reviewChapters = readerChapters;
  }
  const list = $("#title-editor-list");
  list.innerHTML = "";
  for (const ch of readerChapters) {
    const row = document.createElement("div");
    row.className = "title-editor-row";
    const chType = ch.chapter_type || "chapter";
    row.innerHTML = `
      <div class="te-header">
        <select class="te-type" data-chapter-id="${ch.id}">
          <option value="frontmatter"${chType === "frontmatter" ? " selected" : ""}>${t("frontmatter")}</option>
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

$("#btn-edit-titles").addEventListener("click", openTitleEditor);
$("#btn-review-edit-titles").addEventListener("click", openTitleEditor);

$("#btn-close-title-editor").addEventListener("click", () => hide($("#title-editor-overlay")));
$("#btn-cancel-title-editor").addEventListener("click", () => hide($("#title-editor-overlay")));

$("#btn-save-titles").addEventListener("click", async () => {
  const titles = {};
  const types = {};
  $("#title-editor-list").querySelectorAll(".te-type").forEach(sel => {
    types[sel.dataset.chapterId] = sel.value;
  });
  $("#title-editor-list").querySelectorAll(".te-orig").forEach(input => {
    const id = input.dataset.chapterId;
    const transInput = $(`#title-editor-list .te-trans[data-chapter-id="${id}"]`);
    titles[id] = {
      title: input.value,
      translated_title: transInput ? transInput.value : "",
      chapter_type: types[id] || "chapter",
    };
  });
  try {
    await apiJson(`/api/projects/${currentProjectId}/chapters/titles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles }),
    });
    readerChapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
    reviewChapters = readerChapters;
    if ($("#panel-reader").classList.contains("active")) {
      loadReaderChapter(readerCurrentIdx);
    }
    if ($("#panel-review").classList.contains("active")) {
      renderReviewList();
    }
    hide($("#title-editor-overlay"));
  } catch (e) {
    alert(t("save_failed") + ": " + e.message);
  }
});

// ── AI Translate Titles ─────────────────────────────────────────────
async function aiTranslateTitles(btn) {
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = t("translating_titles");
  try {
    await apiJson(`/api/projects/${currentProjectId}/chapters/translate-titles`, {
      method: "POST",
    });
    readerChapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
    reviewChapters = readerChapters;

    // Refresh the title editor if open
    const overlay = $("#title-editor-overlay");
    if (!overlay.classList.contains("hidden")) {
      openTitleEditor();
    }

    // Refresh the review list if visible
    const reviewPanel = $("#panel-review");
    if (reviewPanel.classList.contains("active")) {
      renderReviewList();
    }

    // Refresh the reader if visible
    if (readerCurrentIdx >= 0 && $("#panel-reader").classList.contains("active")) {
      loadReaderChapter(readerCurrentIdx);
    }

    btn.textContent = t("titles_translated");
    setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2000);
  } catch (e) {
    alert(t("save_failed") + ": " + e.message);
    btn.textContent = origText;
    btn.disabled = false;
  }
}

$("#btn-ai-translate-titles").addEventListener("click", function () {
  aiTranslateTitles(this);
});

$("#btn-quick-translate-titles").addEventListener("click", function () {
  aiTranslateTitles(this);
});

// ── Title Numbering Detection & Manipulation ───────────────────────

const _NUM_PATTERNS = [
  /^(chapter\s+\d+[\s.:：\-–—]*)/i,
  /^(kapitel\s+\d+[\s.:：\-–—]*)/i,
  /^(chapitre\s+\d+[\s.:：\-–—]*)/i,
  /^(teil\s+\d+[\s.:：\-–—]*)/i,
  /^(part\s+\d+[\s.:：\-–—]*)/i,
  /^(book\s+\d+[\s.:：\-–—]*)/i,
  /^(第\s*[一二三四五六七八九十百千\d]+\s*[章节篇卷部回][\s.:：\-–—]*)/,
  /^((?:chapter|kapitel|chapitre)\s+[IVXLCDM]+[\s.:：\-–—]*)/i,
  /^(\d+[\s.:：\-–—]+)/,
  /^([IVXLCDM]+[\s.:：\-–—]+)/,
];

function detectNumberPrefix(title) {
  if (!title) return null;
  const trimmed = title.trim();
  for (const re of _NUM_PATTERNS) {
    const m = trimmed.match(re);
    if (m) return m[1];
  }
  return null;
}

function stripNumberPrefix(title) {
  if (!title) return title;
  const prefix = detectNumberPrefix(title);
  if (!prefix) return title;
  return title.trim().slice(prefix.length).trim();
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

$("#btn-auto-number").addEventListener("click", () => {
  const rows = document.querySelectorAll("#title-editor-list .title-editor-row");
  const tgtLang = ($("#edit-target-lang") || {}).value || "en";
  let num = 1;
  let count = 0;
  rows.forEach(row => {
    const typeSelect = row.querySelector(".te-type");
    if (!typeSelect || typeSelect.value !== "chapter") return;

    const origInput = row.querySelector(".te-orig");
    const transInput = row.querySelector(".te-trans");

    const origBody = stripNumberPrefix(origInput.value);
    origInput.value = getChapterPrefix("en", num) + origBody;

    if (transInput.value.trim()) {
      const transBody = stripNumberPrefix(transInput.value);
      transInput.value = getChapterPrefix(tgtLang, num) + transBody;
    }

    num++;
    count++;
  });
  alert(t("auto_number_done").replace("{n}", count));
});

$("#btn-strip-numbers").addEventListener("click", () => {
  const rows = document.querySelectorAll("#title-editor-list .title-editor-row");
  let changed = 0;
  rows.forEach(row => {
    const transInput = row.querySelector(".te-trans");
    if (!transInput || !transInput.value.trim()) return;
    const stripped = stripNumberPrefix(transInput.value);
    if (stripped !== transInput.value.trim()) {
      transInput.value = stripped;
      changed++;
    }
  });
  if (changed === 0) alert(t("no_numbers_found"));
});

$("#btn-copy-numbers").addEventListener("click", () => {
  const rows = document.querySelectorAll("#title-editor-list .title-editor-row");
  let changed = 0;
  rows.forEach(row => {
    const origInput = row.querySelector(".te-orig");
    const transInput = row.querySelector(".te-trans");
    if (!origInput || !transInput || !transInput.value.trim()) return;
    const origPrefix = detectNumberPrefix(origInput.value);
    if (!origPrefix) return;
    const currentTransPrefix = detectNumberPrefix(transInput.value);
    const transBody = currentTransPrefix ? transInput.value.trim().slice(currentTransPrefix.length).trim() : transInput.value.trim();
    transInput.value = origPrefix + transBody;
    changed++;
  });
  if (changed === 0) alert(t("no_numbers_found"));
});

// ── Sidebar Toggle ──────────────────────────────────────────────────
$("#btn-toggle-sidebar").addEventListener("click", () => {
  $("#sidebar").classList.toggle("collapsed");
  localStorage.setItem("sidebar-collapsed", $("#sidebar").classList.contains("collapsed") ? "1" : "");
});
if (localStorage.getItem("sidebar-collapsed") === "1") {
  $("#sidebar").classList.add("collapsed");
}

// ── Language Selector ───────────────────────────────────────────────
$("#app-lang-select").value = currentLang;
$("#app-lang-select").addEventListener("change", (e) => {
  setLang(e.target.value);
});

// ── Init ───────────────────────────────────────────────────────────────
applyI18n();
loadProjects();
