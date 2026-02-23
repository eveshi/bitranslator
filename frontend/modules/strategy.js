/* Strategy panel */
import { state } from './state.js';
import { $, show, hide, showPanel, apiJson, startPolling, esc } from './core.js';
import { t } from './i18n.js';

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
  } catch (e) {
    console.error("showStrategy failed", e);
  }
}

// showAnalysis injected to avoid circular dep
let _showAnalysis = null;
export function setShowAnalysis(fn) { _showAnalysis = fn; }

export function initStrategy() {
  $("#btn-add-name").addEventListener("click", () => _addNameRow($("#strat-names")));
  $("#btn-add-glossary").addEventListener("click", () => _addGlossaryRow($("#strat-glossary")));

  // Generate strategy
  $("#btn-gen-strategy").addEventListener("click", async () => {
    showPanel("strategy"); show($("#strategy-loading")); hide($("#strategy-content"));
    try {
      await apiJson(`/api/projects/${state.currentProjectId}/strategy/generate`, { method: "POST" });
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
}
