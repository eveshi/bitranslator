/* BiTranslator – Application entry point, router & polling dispatcher */
import { state } from './modules/state.js';
import { $, show, hide, showPanel, apiJson, setPollCallback, startPolling, stopPolling } from './modules/core.js';
import { applyI18n, setLang, currentLang } from './modules/i18n.js';
import { initSettings, loadLLMSettings } from './modules/settings.js';
import { initUpload, loadProjects, setOpenProject } from './modules/upload.js';
import { startAnalysis, showAnalysis, initAnalysis } from './modules/analysis.js';
import { showStrategy, initStrategy, setShowAnalysis } from './modules/strategy.js';
import { showSample, initSample } from './modules/sample.js';
import { updateProgressUI, initTranslate } from './modules/translate.js';
import { showReview, showDone, initReview, setOpenChapterReader } from './modules/review.js';
import { openChapterReader, loadReaderChapter, initReader } from './modules/reader.js';
import { initTitles } from './modules/titles.js';

// ── Wire cross-module callbacks ─────────────────────────────────────
setOpenProject(openProject);
setShowAnalysis(showAnalysis);
setOpenChapterReader(openChapterReader);

// ── Hash-based routing ──────────────────────────────────────────────
function parseRoute() {
  const hash = location.hash.slice(1) || "/";
  const m = hash.match(/^\/project\/([^/]+)(?:\/(.+))?$/);
  return m ? { projectId: m[1], step: m[2] || null } : { projectId: null, step: null };
}

async function handleRoute() {
  const { projectId, step } = parseRoute();

  if (!projectId) {
    state.currentProjectId = null;
    showPanel("upload");
    hide($("#steps-bar"));
    await loadProjects();
    return;
  }

  state.currentProjectId = projectId;
  await loadProjects();

  if (step) {
    await navigateToStep(step);
  } else {
    await openProject(projectId);
  }
}

async function navigateToStep(step) {
  try {
    const project = await apiJson(`/api/projects/${state.currentProjectId}`);
    const isStopped = project.status === "stopped";
    _detectTranslatedChapters(project);

    switch (step) {
      case "analysis": showPanel(step); await showAnalysis(); break;
      case "strategy": showPanel(step); await showStrategy(); break;
      case "sample":   showPanel(step); await showSample();   break;
      case "review":   showPanel(step); await showReview(isStopped); break;
      case "done":     showPanel(step); await showDone(isStopped); break;
      case "reader":
        showPanel(step);
        if (state.readerChapters.length) loadReaderChapter(state.readerCurrentIdx);
        else await openProject(state.currentProjectId);
        break;
      case "translate":
        if (project.status === "translating") { showPanel(step); startPolling(); }
        else await openProject(state.currentProjectId);
        break;
      default:
        await openProject(state.currentProjectId);
    }
  } catch (e) {
    console.error(`navigateToStep(${step}) failed`, e);
    await openProject(state.currentProjectId);
  }
}

// ── Detect if project has any translated chapters ───────────────────
function _detectTranslatedChapters(project) {
  state.hasTranslatedChapters =
    (project.translated_count > 0) ||
    ["translating", "stopped", "completed"].includes(project.status);
}

// ── Open project by status ──────────────────────────────────────────
async function openProject(projectId) {
  state.currentProjectId = projectId;
  stopPolling();
  await loadProjects();

  // Update URL hash
  const newHash = `#/project/${projectId}`;
  if (!location.hash.startsWith(newHash)) {
    history.replaceState(null, "", newHash);
  }

  const project = await apiJson(`/api/projects/${projectId}`);
  $("#edit-source-lang").value = project.source_language || "";
  $("#edit-target-lang").value = project.target_language || "";
  _detectTranslatedChapters(project);

  switch (project.status) {
    case "uploaded":
      showPanel("analysis"); hide($("#analysis-loading")); hide($("#analysis-content"));
      startAnalysis();
      break;
    case "analyzing":
      showPanel("analysis"); show($("#analysis-loading")); hide($("#analysis-content"));
      startPolling();
      break;
    case "analyzed":
      showPanel("analysis"); await showAnalysis();
      break;
    case "generating_strategy":
      showPanel("strategy"); show($("#strategy-loading")); hide($("#strategy-content"));
      startPolling();
      break;
    case "strategy_generated":
      showPanel("strategy"); await showStrategy();
      break;
    case "translating_sample":
      showPanel("sample"); show($("#sample-loading")); hide($("#sample-content"));
      startPolling();
      break;
    case "sample_ready":
      showPanel("sample"); await showSample();
      break;
    case "translating":
      showPanel("translate"); startPolling();
      break;
    case "stopped":
      showPanel("review"); await showReview(true);
      break;
    case "completed":
      showPanel("review"); await showReview(false);
      break;
    case "error":
      alert("项目出错: " + (project.error_message || "未知错误") + "\n将返回上一个可用步骤。");
      showPanel("analysis");
      try { await showAnalysis(); } catch (_) {}
      break;
  }
}

// ── Centralized polling dispatcher ──────────────────────────────────
setPollCallback(async () => {
  if (!state.currentProjectId) return;
  try {
    const project = await apiJson(`/api/projects/${state.currentProjectId}`);
    await loadProjects();

    if (project.status === "analyzed") {
      stopPolling(); await showAnalysis();
    } else if (project.status === "strategy_generated") {
      stopPolling(); await showStrategy();
    } else if (project.status === "sample_ready") {
      stopPolling(); await showSample();
    } else if (project.status === "translating") {
      showPanel("translate");
      const progress = await apiJson(`/api/projects/${state.currentProjectId}/progress`);
      await updateProgressUI(progress);
    } else if (project.status === "stopped") {
      stopPolling(); showPanel("review"); await showReview(true);
    } else if (project.status === "completed") {
      stopPolling(); showPanel("review"); await showReview(false);
    } else if (project.status === "error") {
      stopPolling(); alert("出错: " + (project.error_message || "未知错误"));
    }
  } catch (e) { console.error("Poll error", e); }
});

// ── Step bar click navigation ───────────────────────────────────────
$("#steps-bar").addEventListener("click", (e) => {
  const stepEl = e.target.closest(".step");
  if (!stepEl || !stepEl.classList.contains("done")) return;
  const name = stepEl.dataset.step;
  if (!name || !state.currentProjectId) return;
  location.hash = `#/project/${state.currentProjectId}/${name}`;
});

// ── Sidebar toggle ──────────────────────────────────────────────────
$("#btn-toggle-sidebar").addEventListener("click", () => {
  $("#sidebar").classList.toggle("collapsed");
  localStorage.setItem("sidebar-collapsed", $("#sidebar").classList.contains("collapsed") ? "1" : "");
});
if (localStorage.getItem("sidebar-collapsed") === "1") {
  $("#sidebar").classList.add("collapsed");
}

// ── Language selector ───────────────────────────────────────────────
$("#app-lang-select").value = currentLang;
$("#app-lang-select").addEventListener("change", (e) => setLang(e.target.value));

// ── Initialize all modules ──────────────────────────────────────────
initSettings();
initUpload();
initAnalysis();
initStrategy();
initSample();
initTranslate();
initReview();
initReader();
initTitles();

// ── Scroll shadow for sticky steps bar ──────────────────────────────
const mainEl = $("#main");
mainEl.addEventListener("scroll", () => {
  const bar = $("#steps-bar");
  if (bar) bar.classList.toggle("scrolled", mainEl.scrollTop > 8);
});

// ── Boot ────────────────────────────────────────────────────────────
applyI18n();
loadLLMSettings();
window.addEventListener("hashchange", handleRoute);
handleRoute();
