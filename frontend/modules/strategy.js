/* Strategy panel */
import { state } from './state.js';
import { $, show, hide, showPanel, apiJson, startPolling, esc } from './core.js';
import { t } from './i18n.js';
import { getSelectedTemplateId } from './analysis.js';

function _addNameRow(tbody, original = "", translated = "", note = "") {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input value="${esc(original)}" /></td>
    <td><input value="${esc(translated)}" /></td>
    <td><input value="${esc(note)}" /></td>
    <td><button class="btn-icon btn-delete-row" title="✕">✕</button></td>`;
  tr.querySelector(".btn-delete-row").addEventListener("click", () => tr.remove());
  tbody.appendChild(tr);
}

function _addGlossaryRow(tbody, source = "", target = "", context = "") {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><input value="${esc(source)}" /></td>
    <td><input value="${esc(target)}" /></td>
    <td><input value="${esc(context)}" /></td>
    <td><button class="btn-icon btn-delete-row" title="✕">✕</button></td>`;
  tr.querySelector(".btn-delete-row").addEventListener("click", () => tr.remove());
  tbody.appendChild(tr);
}

export function collectStrategyEdits() {
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
    annotate_terms: $("#strat-annotate-terms").checked,
    annotate_names: $("#strat-annotate-names").checked,
    free_translation: $("#strat-free-translation").checked,
    enable_annotations: $("#strat-enable-annotations").checked,
    annotation_density: $("#strat-annotation-density").value,
    character_names: names, glossary,
  };
}

export async function showStrategy() {
  hide($("#strategy-loading"));
  show($("#strategy-content"));
  showPanel("strategy");
  try {
    const s = await apiJson(`/api/projects/${state.currentProjectId}/strategy`);
    $("#strat-approach").value = s.overall_approach || "";
    $("#strat-tone").value = s.tone_and_style || "";
    $("#strat-cultural").value = s.cultural_adaptation || "";
    $("#strat-special").value = s.special_considerations || "";
    $("#strat-custom").value = s.custom_instructions || "";
    $("#strat-annotate-terms").checked = !!s.annotate_terms;
    $("#strat-annotate-names").checked = !!s.annotate_names;
    $("#strat-free-translation").checked = !!s.free_translation;
    $("#strat-enable-annotations").checked = !!s.enable_annotations;
    $("#strat-annotation-density").value = s.annotation_density || "normal";
    _toggleDensityVisibility();

    const chapters = await apiJson(`/api/projects/${state.currentProjectId}/chapters`);
    state.totalChapterCount = chapters.length;
    const sel = $("#sample-chapter-select"); sel.innerHTML = "";
    for (const ch of chapters) {
      const opt = document.createElement("option");
      opt.value = ch.chapter_index;
      opt.textContent = `${ch.chapter_index + 1} — ${ch.title}`;
      sel.appendChild(opt);
    }
    if (chapters.length > 1) sel.value = "1";

    const namesBody = $("#strat-names"); namesBody.innerHTML = "";
    (s.character_names || []).forEach(n => _addNameRow(namesBody, n.original, n.translated, n.note));
    const glossBody = $("#strat-glossary"); glossBody.innerHTML = "";
    (s.glossary || []).forEach(g => _addGlossaryRow(glossBody, g.source, g.target, g.context));

    $("#strategy-feedback").value = "";

    // Show current strategy version
    const verBadge = $("#strategy-current-ver");
    if (verBadge) verBadge.textContent = `v${s.version ?? 0}`;

    // Load strategy version history
    _loadStrategyVersions();
    // Load templates
    _loadTemplates();
  } catch (e) {
    console.error("showStrategy failed", e);
  }
}

// showAnalysis injected to avoid circular dep
let _showAnalysis = null;
export function setShowAnalysis(fn) { _showAnalysis = fn; }

function _toggleDensityVisibility() {
  const row = $("#annotation-density-row");
  if (row) {
    if ($("#strat-enable-annotations").checked) show(row); else hide(row);
  }
}

export function initStrategy() {
  $("#btn-add-name").addEventListener("click", () => _addNameRow($("#strat-names")));
  $("#btn-add-glossary").addEventListener("click", () => _addGlossaryRow($("#strat-glossary")));

  // Close strategy version preview
  $("#btn-close-strat-preview")?.addEventListener("click", () => hide($("#strategy-version-preview")));

  // Toggle density visibility based on annotations checkbox
  $("#strat-enable-annotations").addEventListener("change", _toggleDensityVisibility);

  // Generate strategy (optionally from template selected on analysis page)
  $("#btn-gen-strategy").addEventListener("click", async () => {
    showPanel("strategy"); show($("#strategy-loading")); hide($("#strategy-content"));
    const templateId = getSelectedTemplateId();
    try {
      if (templateId) {
        await apiJson(`/api/projects/${state.currentProjectId}/strategy/from-template`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template_id: templateId }),
        });
      } else {
        await apiJson(`/api/projects/${state.currentProjectId}/strategy/generate`, { method: "POST" });
      }
      startPolling();
    } catch (e) { alert("生成策略失败: " + e.message); }
  });

  // Save strategy
  $("#btn-save-strategy").addEventListener("click", async () => {
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/strategy`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectStrategyEdits()),
      });
      alert("策略已保存！");
    } catch (e) { alert("保存失败: " + e.message); }
  });

  // Back to analysis
  $("#btn-back-to-analysis").addEventListener("click", async () => {
    if (_showAnalysis) { showPanel("analysis"); await _showAnalysis(); }
  });

  // Regen strategy with feedback
  $("#btn-regen-strategy").addEventListener("click", async () => {
    const feedback = $("#strategy-feedback").value.trim();
    if (!feedback) { alert("请输入反馈内容"); return; }
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/strategy`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectStrategyEdits()),
      });
    } catch (_) {}
    show($("#strategy-loading")); hide($("#strategy-content"));
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/strategy/refine`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      startPolling();
    } catch (e) {
      alert("策略重新生成失败: " + e.message);
      hide($("#strategy-loading")); show($("#strategy-content"));
    }
  });

  // Save as template
  $("#btn-save-template").addEventListener("click", async () => {
    const name = $("#template-name-input").value.trim();
    if (!name) { alert("请输入模板名称"); return; }
    const desc = $("#template-desc-input").value.trim();
    try {
      await apiJson(`/api/strategy-templates?project_id=${state.currentProjectId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: desc }),
      });
      alert(t("template_saved"));
      $("#template-name-input").value = "";
      $("#template-desc-input").value = "";
      _loadTemplates();
    } catch (e) { alert("保存失败: " + e.message); }
  });
}


async function _loadStrategyVersions() {
  const list = $("#strategy-versions-list");
  if (!list) return;
  try {
    const versions = await apiJson(`/api/projects/${state.currentProjectId}/strategy/versions`);
    if (!versions.length) { list.innerHTML = `<p class="hint">${t("ver_no_versions")}</p>`; return; }
    const s = await apiJson(`/api/projects/${state.currentProjectId}/strategy`);
    const currentVer = s.version ?? 0;

    list.innerHTML = "";
    for (const v of versions) {
      const row = document.createElement("div");
      const isCurrent = v.version === currentVer;
      row.className = "version-row clickable" + (isCurrent ? " active" : "");
      const date = v.created_at ? new Date(v.created_at).toLocaleString() : "";
      const feedbackHtml = v.feedback ? `<div class="ver-feedback">${t("ver_feedback")}${esc(v.feedback)}</div>` : "";
      row.innerHTML = `
        <div class="ver-info">
          <span class="ver-label">v${v.version}${isCurrent ? ` <span class="ver-badge">${t("ver_current")}</span>` : ""}</span>
          <span class="ver-meta">${date}</span>
          ${feedbackHtml}
        </div>
        <div class="ver-actions">
          ${!isCurrent ? `<button class="btn btn-sm btn-primary strat-ver-restore" data-ver="${v.version}">${t("ver_restore")}</button>` : ""}
        </div>`;
      // Click row to preview version details
      row.addEventListener("click", (e) => {
        if (e.target.closest(".strat-ver-restore")) return;
        _showStrategyVersionPreview(v.version, isCurrent);
      });
      list.appendChild(row);
    }

    list.querySelectorAll(".strat-ver-restore").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const ver = parseInt(btn.dataset.ver);
        if (!confirm(t("confirm_restore_ver").replace("{n}", ver))) return;
        try {
          await apiJson(`/api/projects/${state.currentProjectId}/strategy/versions/${ver}/restore`, { method: "POST" });
          await showStrategy();
        } catch (e) { alert("Use version failed: " + e.message); }
      });
    });
  } catch (e) {
    list.innerHTML = `<p class="hint">${t("ver_no_versions")}</p>`;
  }
}


async function _showStrategyVersionPreview(version, isCurrent) {
  const panel = $("#strategy-version-preview");
  const titleEl = $("#strat-preview-title");
  const fieldsEl = $("#strat-preview-fields");
  const useBtn = $("#btn-use-strat-version");
  if (!panel) return;

  titleEl.textContent = t("ver_preview_title").replace("{n}", version);
  fieldsEl.innerHTML = "<p class='hint'>Loading…</p>";
  if (isCurrent) hide(useBtn); else show(useBtn);
  show(panel);

  try {
    const v = await apiJson(`/api/projects/${state.currentProjectId}/strategy/versions/${version}`);
    const data = v.data || {};
    const fields = [
      { label: t("overall_approach"), value: data.overall_approach },
      { label: t("tone_and_style"), value: data.tone_and_style },
      { label: t("cultural_adaptation"), value: data.cultural_adaptation },
      { label: t("special_considerations"), value: data.special_considerations },
      { label: t("custom_instructions"), value: data.custom_instructions },
    ];

    let html = "";
    for (const f of fields) {
      if (!f.value) continue;
      html += `<div class="preview-field"><strong>${esc(f.label)}</strong><p>${esc(f.value)}</p></div>`;
    }

    const names = data.character_names || [];
    if (names.length) {
      html += `<div class="preview-field"><strong>${t("character_names")}</strong><table class="mini-table"><tr><th>${t("original")}</th><th>${t("translated")}</th></tr>`;
      for (const n of names.slice(0, 20)) {
        html += `<tr><td>${esc(n.original || "")}</td><td>${esc(n.translated || "")}</td></tr>`;
      }
      if (names.length > 20) html += `<tr><td colspan="2">… +${names.length - 20}</td></tr>`;
      html += `</table></div>`;
    }

    const glossary = data.glossary || [];
    if (glossary.length) {
      html += `<div class="preview-field"><strong>${t("glossary")}</strong><table class="mini-table"><tr><th>${t("original")}</th><th>${t("translated")}</th></tr>`;
      for (const g of glossary.slice(0, 20)) {
        html += `<tr><td>${esc(g.source || "")}</td><td>${esc(g.target || "")}</td></tr>`;
      }
      if (glossary.length > 20) html += `<tr><td colspan="2">… +${glossary.length - 20}</td></tr>`;
      html += `</table></div>`;
    }

    // Show flags
    const flags = [];
    if (data.enable_annotations) flags.push(t("enable_annotations").split("：")[0]);
    if (data.annotate_terms) flags.push(t("rt_annotate_terms"));
    if (data.annotate_names) flags.push(t("rt_annotate_names"));
    if (data.free_translation) flags.push(t("rt_free_translation"));
    if (flags.length) {
      html += `<div class="preview-field"><strong>${t("annotation_options")} / ${t("translation_style_options")}</strong><p>${flags.map(f => "✓ " + esc(f)).join("<br>")}</p></div>`;
    }

    if (v.feedback) {
      html += `<div class="preview-field"><strong>${t("ver_feedback")}</strong><p>${esc(v.feedback)}</p></div>`;
    }

    fieldsEl.innerHTML = html || "<p class='hint'>Empty strategy data</p>";

    useBtn.onclick = async () => {
      if (!confirm(t("confirm_restore_ver").replace("{n}", version))) return;
      try {
        await apiJson(`/api/projects/${state.currentProjectId}/strategy/versions/${version}/restore`, { method: "POST" });
        hide(panel);
        await showStrategy();
      } catch (e) { alert("Use version failed: " + e.message); }
    };
  } catch (e) {
    fieldsEl.innerHTML = `<p class="hint">Failed to load version: ${esc(e.message)}</p>`;
  }
}

async function _loadTemplates() {
  const list = $("#template-list");
  if (!list) return;
  try {
    const templates = await apiJson(`/api/strategy-templates`);
    if (!templates.length) { list.innerHTML = ""; return; }
    list.innerHTML = "";
    for (const tpl of templates) {
      const row = document.createElement("div");
      row.className = "template-row";
      const date = tpl.created_at ? new Date(tpl.created_at).toLocaleString() : "";
      row.innerHTML = `
        <div class="tpl-info">
          <span class="tpl-name">${esc(tpl.name)}</span>
          <span class="tpl-meta">${esc(tpl.description || "")}${tpl.genre ? " · " + esc(tpl.genre) : ""} · ${date}</span>
        </div>
        <div class="tpl-actions">
          <button class="btn btn-sm btn-primary tpl-apply" data-id="${tpl.id}">${t("apply_template")}</button>
          <button class="btn btn-sm btn-danger tpl-delete" data-id="${tpl.id}" data-name="${esc(tpl.name)}">${t("delete_template")}</button>
        </div>`;
      list.appendChild(row);
    }

    list.querySelectorAll(".tpl-apply").forEach(btn => {
      btn.addEventListener("click", async () => {
        const tid = btn.dataset.id;
        try {
          show($("#strategy-loading")); hide($("#strategy-content"));
          await apiJson(`/api/projects/${state.currentProjectId}/strategy/from-template`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ template_id: tid }),
          });
          alert(t("template_applied"));
          startPolling();
        } catch (e) {
          alert("Apply failed: " + e.message);
          hide($("#strategy-loading")); show($("#strategy-content"));
        }
      });
    });

    list.querySelectorAll(".tpl-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.name;
        if (!confirm(t("confirm_delete_template").replace("{name}", name))) return;
        try {
          await apiJson(`/api/strategy-templates/${btn.dataset.id}`, { method: "DELETE" });
          _loadTemplates();
        } catch (e) { alert("Delete failed: " + e.message); }
      });
    });
  } catch (e) {
    list.innerHTML = "";
  }
}
