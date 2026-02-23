/* Upload panel + project list */
import { state } from './state.js';
import { $, show, hide, showPanel, apiJson, esc } from './core.js';
import { t, currentLang, statusLabel } from './i18n.js';

// openProject is injected from app.js to avoid circular deps
let _openProject = null;
export function setOpenProject(fn) { _openProject = fn; }

export async function loadProjects() {
  try {
    const projects = await apiJson("/api/projects");
    const list = $("#project-list");
    list.innerHTML = "";
    for (const p of projects) {
      const div = document.createElement("div");
      div.className = "project-item" + (p.id === state.currentProjectId ? " active" : "");
      const chLabel = currentLang === "en" ? "ch" : "章";
      div.innerHTML = `<div class="project-info"><div>${esc(p.name)}</div><div class="project-status">${statusLabel(p.status)} · ${p.translated_count}/${p.chapter_count} ${chLabel}</div></div><button class="btn-delete-project" title="${t("delete_project")}">&times;</button>`;
      div.querySelector(".project-info").addEventListener("click", () => _openProject?.(p.id));
      div.querySelector(".btn-delete-project").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(t("confirm_delete_project").replace("{name}", p.name))) return;
        try {
          await apiJson(`/api/projects/${p.id}`, { method: "DELETE" });
          if (state.currentProjectId === p.id) {
            state.currentProjectId = null;
            showPanel("upload"); hide($("#steps-bar"));
          }
          await loadProjects();
        } catch (err) { alert(t("delete_failed") + ": " + err.message); }
      });
      list.appendChild(div);
    }
  } catch (e) { console.error("Failed to load projects", e); }
}

export async function uploadFile(file) {
  try {
    const llm = await apiJson("/api/settings/llm");
    if (!llm.api_key_set) { alert(t("api_key_missing_upload")); return; }
  } catch (_) {}

  const fd = new FormData();
  fd.append("file", file);
  fd.append("source_language", "auto");
  fd.append("target_language", $("#target-lang").value);

  try {
    $("#btn-upload").textContent = "上传中…";
    $("#btn-upload").disabled = true;
    const project = await apiJson("/api/projects", { method: "POST", body: fd });
    state.currentProjectId = project.id;
    await loadProjects();
    _openProject?.(project.id);
  } catch (e) { alert("上传失败: " + e.message); }
  finally {
    $("#btn-upload").textContent = "选择文件并上传";
    $("#btn-upload").disabled = false;
  }
}

export function initUpload() {
  const dropZone = $("#drop-zone");
  const fileInput = $("#file-input");

  dropZone.addEventListener("click", (e) => {
    if (e.target.closest("button, input, label")) return;
    fileInput.click();
  });
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault(); dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      uploadFile(e.dataTransfer.files[0]);
    }
  });
  $("#btn-upload").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { if (fileInput.files.length) uploadFile(fileInput.files[0]); });
}
