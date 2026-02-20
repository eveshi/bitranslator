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
  const steps = ["upload", "analysis", "strategy", "sample", "translate", "done"];
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
$("#btn-save-llm").addEventListener("click", async () => {
  try {
    await apiJson("/api/settings/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: $("#llm-provider").value,
        api_key: $("#llm-api-key").value,
        base_url: $("#llm-base-url").value,
        model: $("#llm-model").value,
        translation_model: $("#llm-translation-model").value,
        temperature: parseFloat($("#llm-temperature").value),
      }),
    });
    alert("LLM 设置已保存！");
  } catch (e) {
    alert("保存失败: " + e.message);
  }
});

$("#llm-provider").addEventListener("change", () => {
  const provider = $("#llm-provider").value;
  if (provider === "ollama") {
    $("#llm-base-url").value = "http://localhost:11434/v1";
    $("#llm-model").value = "llama3";
  } else if (provider === "gemini") {
    $("#llm-base-url").value = "https://generativelanguage.googleapis.com/v1beta/openai/";
    $("#llm-model").value = "gemini-2.0-flash";
  } else {
    $("#llm-base-url").value = "https://api.openai.com/v1";
    $("#llm-model").value = "gpt-4o";
  }
});

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
    strategy_generated: "策略就绪",
    translating_sample: "样章翻译中…",
    sample_ready: "样章就绪",
    translating: "翻译中…",
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
  fd.append("source_language", $("#source-lang").value);
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
    case "completed":
      showPanel("done");
      break;
    case "error":
      alert("项目出错: " + (project.error_message || "未知错误") + "\n将返回上一个可用步骤。");
      showPanel("analysis");
      try { await showAnalysis(); } catch (_) {}
      break;
  }
}

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
    const a = await apiJson(`/api/projects/${currentProjectId}/analysis`);
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

    show($("#analysis-content"));
    showPanel("analysis");
  } catch (e) {
    console.error("showAnalysis failed", e);
  }
}

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

  showPanel("sample");
  show($("#sample-loading"));
  hide($("#sample-content"));
  try {
    await apiJson(`/api/projects/${currentProjectId}/translate/sample`, { method: "POST" });
    pollStatus();
  } catch (e) {
    alert("样章翻译启动失败: " + e.message);
  }
});

async function showSample() {
  hide($("#sample-loading"));
  try {
    const chapters = await apiJson(`/api/projects/${currentProjectId}/chapters`);
    if (!chapters.length) return;
    const ch = chapters[0];
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

// ── Refine strategy ────────────────────────────────────────────────────
$("#btn-refine-strategy").addEventListener("click", async () => {
  const feedback = $("#sample-feedback").value.trim();
  if (!feedback) { alert("请输入反馈内容"); return; }
  try {
    showPanel("strategy");
    show($("#strategy-loading"));
    hide($("#strategy-content"));
    await apiJson(`/api/projects/${currentProjectId}/strategy/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
    pollStatus();
  } catch (e) {
    alert("策略调整失败: " + e.message);
  }
});

// ── Full Translation ───────────────────────────────────────────────────
$("#btn-translate-all").addEventListener("click", async () => {
  if (!confirm("确认开始全书翻译？这可能需要较长时间。")) return;
  showPanel("translate");
  try {
    await apiJson(`/api/projects/${currentProjectId}/translate/all`, { method: "POST" });
    pollStatus();
  } catch (e) {
    alert("全书翻译启动失败: " + e.message);
  }
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
        updateProgressUI(progress);
      } else if (project.status === "completed") {
        stopPolling();
        showPanel("done");
      } else if (project.status === "error") {
        stopPolling();
        alert("出错: " + (project.error_message || "未知错误"));
      }
    } catch (e) {
      console.error("Poll error", e);
    }
  }, 3000);
}

function updateProgressUI(progress) {
  const pct = progress.total_chapters > 0
    ? Math.round((progress.translated_chapters / progress.total_chapters) * 100) : 0;
  $("#progress-fill").style.width = pct + "%";
  $("#progress-text").textContent =
    `${progress.translated_chapters} / ${progress.total_chapters} 章已翻译 (${pct}%)` +
    (progress.current_chapter ? ` · 正在翻译: ${progress.current_chapter}` : "");
}

// ── Download ───────────────────────────────────────────────────────────
$("#btn-download").addEventListener("click", () => {
  window.open(`${API}/api/projects/${currentProjectId}/download`, "_blank");
});

$("#btn-new-project").addEventListener("click", () => {
  currentProjectId = null;
  showPanel("upload");
  hide($("#steps-bar"));
});

// ── Init ───────────────────────────────────────────────────────────────
loadProjects();
