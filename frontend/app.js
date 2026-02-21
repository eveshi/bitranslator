/* BiTranslator – Frontend Application */

const API = "";  // same origin

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
  const steps = ["upload", "analysis", "strategy", "sample", "translate", "review", "done"];
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
    alert("LLM 设置已保存！");
  } catch (e) {
    alert("保存失败: " + e.message);
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
      div.innerHTML = `<div>${p.name}</div><div class="project-status">${statusLabel(p.status)} · ${p.translated_count}/${p.chapter_count} 章</div>`;
      div.addEventListener("click", () => openProject(p.id));
      list.appendChild(div);
    }
  } catch (e) {
    console.error("Failed to load projects", e);
  }
}

function statusLabel(s) {
  const map = {
    uploaded: "已上传",
    analyzing: "分析中…",
    analyzed: "已分析",
    generating_strategy: "策略生成中…",
    strategy_generated: "策略就绪",
    translating_sample: "样章翻译中…",
    sample_ready: "样章就绪",
    translating: "翻译中…",
    stopped: "已停止",
    completed: "已完成",
    error: "出错",
  };
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

function esc(s) { return s.replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

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
  hide($("#review-reader"));
  show($("#review-chapter-list"));

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
  for (const ch of reviewChapters) {
    const item = document.createElement("div");
    item.className = "review-chapter-item";
    item.dataset.chapterId = ch.id;

    const title = document.createElement("span");
    title.className = "ch-title";
    title.textContent = `第 ${ch.chapter_index + 1} 章: ${ch.title}`;
    item.appendChild(title);

    const status = document.createElement("span");
    status.className = "ch-status" + (ch.status !== "translated" ? ` ${ch.status}` : "");
    const statusText = { translated: "已翻译", translating: "翻译中…", pending: "未翻译" };
    status.textContent = statusText[ch.status] || ch.status;
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
  hide($("#review-chapter-list"));
  show($("#review-reader"));
  $("#reader-chapter-title").textContent = `第 ${ch.chapter_index + 1} 章: ${ch.title}`;
  $("#reader-original").innerHTML = "<p style='color:var(--text-dim)'>加载中…</p>";
  $("#reader-translated").innerHTML = "<p style='color:var(--text-dim)'>加载中…</p>";
  $("#btn-retranslate-chapter").dataset.chapterId = ch.id;
  $("#btn-retranslate-chapter").dataset.chapterIndex = ch.chapter_index;
  $("#btn-retranslate-chapter").disabled = false;
  $("#btn-retranslate-chapter").textContent = "🔄 重新翻译本章";

  try {
    const [orig, trans] = await Promise.all([
      apiJson(`/api/projects/${currentProjectId}/chapters/${ch.id}/original`),
      apiJson(`/api/projects/${currentProjectId}/chapters/${ch.id}/translation`),
    ]);
    $("#reader-original").innerHTML = textToHtml(orig.text || "(无内容)");
    $("#reader-translated").innerHTML = textToHtml(trans.text || "(尚未翻译)");
  } catch (e) {
    console.error("openChapterReader failed", e);
    $("#reader-original").innerHTML = "<p>加载失败</p>";
    $("#reader-translated").innerHTML = "<p>加载失败</p>";
  }
}

function textToHtml(text) {
  return text.split(/\n\n+/).map(para => {
    const escaped = para.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

$("#btn-reader-back").addEventListener("click", () => {
  hide($("#review-reader"));
  show($("#review-chapter-list"));
});

$("#btn-retranslate-chapter").addEventListener("click", async () => {
  const chapterId = $("#btn-retranslate-chapter").dataset.chapterId;
  if (!chapterId) return;
  if (!confirm("确认重新翻译本章？")) return;

  const btn = $("#btn-retranslate-chapter");
  btn.disabled = true;
  btn.textContent = "🔄 重新翻译中…";
  $("#reader-translated").innerHTML = "<p style='color:var(--text-dim)'>正在重新翻译，请稍候…</p>";

  try {
    await apiJson(`/api/projects/${currentProjectId}/chapters/${chapterId}/retranslate`, { method: "POST" });
    pollRetranslateChapter(chapterId);
  } catch (e) {
    alert("重新翻译失败: " + e.message);
    btn.disabled = false;
    btn.textContent = "🔄 重新翻译本章";
  }
});

function pollRetranslateChapter(chapterId) {
  const timer = setInterval(async () => {
    try {
      const chapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
      const ch = chapters.find(c => c.id === chapterId);
      if (!ch) { clearInterval(timer); return; }

      if (ch.status === "translated") {
        clearInterval(timer);
        reviewChapters = chapters;
        const trans = await apiJson(`/api/projects/${currentProjectId}/chapters/${chapterId}/translation`);
        $("#reader-translated").innerHTML = textToHtml(trans.text || "(尚未翻译)");
        const btn = $("#btn-retranslate-chapter");
        btn.disabled = false;
        btn.textContent = "🔄 重新翻译本章";
      } else if (ch.status === "pending") {
        clearInterval(timer);
        alert("重新翻译失败，请重试。");
        const btn = $("#btn-retranslate-chapter");
        btn.disabled = false;
        btn.textContent = "🔄 重新翻译本章";
      }
    } catch (e) {
      console.error("pollRetranslateChapter error", e);
    }
  }, 3000);
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
    $("#done-title").textContent = "⏸ 翻译已停止";
    $("#done-hint").textContent = "已翻译的章节已保存。您可以下载已完成的章节，或继续翻译剩余部分。";
    $("#btn-resume-translate").style.display = "";
  } else {
    $("#done-title").textContent = "✅ 翻译完成！";
    $("#done-hint").textContent = "每章译文已单独保存为 EPUB。您可以逐章下载，也可以合并为完整译本。";
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
      label.textContent = `Ch${ch.chapter_index + 1}: ${ch.title}`;
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
      title.textContent = `第 ${ch.chapter_index + 1} 章: ${ch.title}`;
      row.appendChild(title);
      if (ch.file_exists) {
        const dlBtn = document.createElement("a");
        dlBtn.href = `${API}/api/projects/${currentProjectId}/chapters/${ch.chapter_id}/download`;
        dlBtn.textContent = "下载 EPUB";
        dlBtn.className = "btn btn-sm";
        dlBtn.style.textDecoration = "none";
        row.appendChild(dlBtn);
      } else {
        const tag = document.createElement("span");
        tag.textContent = ch.status === "translated" ? "已翻译" : "未翻译";
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
    $("#btn-combine-download").textContent = "合并中…";
    $("#btn-combine-download").disabled = true;
    await apiJson(`/api/projects/${currentProjectId}/combine`, { method: "POST" });
    window.open(`${API}/api/projects/${currentProjectId}/download`, "_blank");
  } catch (e) {
    alert("合并失败: " + e.message);
  } finally {
    $("#btn-combine-download").textContent = "合并为完整 EPUB 并下载";
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

// ── Init ───────────────────────────────────────────────────────────────
loadProjects();
