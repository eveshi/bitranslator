/* Shared template selection modal */
import { $, show, hide, apiJson, esc } from './core.js';
import { t } from './i18n.js';

let _onConfirm = null;
let _templates = [];

export function initTemplateModal() {
  $("#btn-close-template-modal")?.addEventListener("click", _closeModal);
  $("#template-modal-overlay")?.addEventListener("click", e => {
    if (e.target.id === "template-modal-overlay") _closeModal();
  });

  $("#tpl-modal-select")?.addEventListener("change", _onSelectChange);

  $("#btn-tpl-modal-confirm")?.addEventListener("click", () => {
    const sel = $("#tpl-modal-select");
    const id = sel?.value || "";
    const name = sel?.selectedOptions?.[0]?.textContent || "";
    if (_onConfirm) _onConfirm(id, name);
    _closeModal();
  });

  $("#btn-tpl-modal-none")?.addEventListener("click", () => {
    if (_onConfirm) _onConfirm(null, "");
    _closeModal();
  });

  $("#btn-tpl-modal-delete")?.addEventListener("click", async () => {
    const sel = $("#tpl-modal-select");
    const id = sel?.value;
    if (!id) return;
    const name = sel?.selectedOptions?.[0]?.textContent || "";
    if (!confirm(t("confirm_delete_template").replace("{name}", name))) return;
    try {
      await apiJson(`/api/strategy-templates/${id}`, { method: "DELETE" });
      await _loadAndPopulate();
    } catch (e) { alert("Delete failed: " + e.message); }
  });
}

export async function openTemplateModal(onConfirm) {
  _onConfirm = onConfirm;
  const overlay = $("#template-modal-overlay");
  if (!overlay) return;
  show(overlay);
  await _loadAndPopulate();
}

function _closeModal() {
  hide($("#template-modal-overlay"));
}

async function _loadAndPopulate() {
  const sel = $("#tpl-modal-select");
  const detail = $("#tpl-modal-detail");
  const confirmBtn = $("#btn-tpl-modal-confirm");
  const deleteBtn = $("#btn-tpl-modal-delete");
  if (!sel) return;

  try {
    _templates = await apiJson(`/api/strategy-templates`);
  } catch (e) {
    _templates = [];
  }

  sel.innerHTML = `<option value="">${t("select_template_placeholder")}</option>`;
  for (const tpl of _templates) {
    const opt = document.createElement("option");
    opt.value = tpl.id;
    opt.textContent = tpl.name;
    sel.appendChild(opt);
  }
  sel.value = "";
  if (detail) detail.innerHTML = `<p class="hint">${t("select_template_detail_hint")}</p>`;
  if (confirmBtn) confirmBtn.disabled = true;
  if (deleteBtn) deleteBtn.disabled = true;
}

async function _onSelectChange() {
  const sel = $("#tpl-modal-select");
  const detail = $("#tpl-modal-detail");
  const confirmBtn = $("#btn-tpl-modal-confirm");
  const deleteBtn = $("#btn-tpl-modal-delete");
  const id = sel?.value;

  if (!id) {
    if (detail) detail.innerHTML = `<p class="hint">${t("select_template_detail_hint")}</p>`;
    if (confirmBtn) confirmBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;
    return;
  }

  if (confirmBtn) confirmBtn.disabled = false;
  if (deleteBtn) deleteBtn.disabled = false;
  if (detail) detail.innerHTML = `<p class="hint">Loading…</p>`;

  try {
    const tpl = await apiJson(`/api/strategy-templates/${id}`);
    _renderDetail(detail, tpl);
  } catch (e) {
    if (detail) detail.innerHTML = `<p class="hint">Failed to load: ${esc(e.message)}</p>`;
  }
}

function _renderDetail(container, tpl) {
  if (!container) return;
  const data = tpl.data || {};

  const metaParts = [];
  if (tpl.source_language) metaParts.push(`${tpl.source_language} → ${tpl.target_language || "?"}`);
  if (tpl.genre) metaParts.push(tpl.genre);
  if (tpl.description) metaParts.push(tpl.description);
  if (tpl.created_at) metaParts.push(new Date(tpl.created_at).toLocaleString());

  let html = "";
  if (metaParts.length) {
    html += `<div class="tpl-detail-meta">${esc(metaParts.join(" · "))}</div>`;
  }

  const fields = [
    { label: t("overall_approach"), value: data.overall_approach },
    { label: t("tone_and_style"), value: data.tone_and_style },
    { label: t("cultural_adaptation"), value: data.cultural_adaptation },
    { label: t("special_considerations"), value: data.special_considerations },
  ];
  for (const f of fields) {
    if (!f.value) continue;
    html += `<div class="tpl-detail-field"><strong>${esc(f.label)}</strong><p>${esc(f.value)}</p></div>`;
  }

  const names = data.character_names || [];
  if (names.length) {
    html += `<div class="tpl-detail-field"><strong>${t("character_names")}</strong><table class="mini-table"><tr><th>${t("original")}</th><th>${t("translated")}</th></tr>`;
    for (const n of names.slice(0, 10)) {
      html += `<tr><td>${esc(n.original || "")}</td><td>${esc(n.translated || "")}</td></tr>`;
    }
    if (names.length > 10) html += `<tr><td colspan="2">… +${names.length - 10}</td></tr>`;
    html += `</table></div>`;
  }

  const glossary = data.glossary || [];
  if (glossary.length) {
    html += `<div class="tpl-detail-field"><strong>${t("glossary")}</strong><table class="mini-table"><tr><th>${t("original")}</th><th>${t("translated")}</th></tr>`;
    for (const g of glossary.slice(0, 10)) {
      html += `<tr><td>${esc(g.source || "")}</td><td>${esc(g.target || "")}</td></tr>`;
    }
    if (glossary.length > 10) html += `<tr><td colspan="2">… +${glossary.length - 10}</td></tr>`;
    html += `</table></div>`;
  }

  const flags = [];
  if (data.enable_annotations) flags.push("✓ " + t("enable_annotations").split("：")[0]);
  if (data.annotate_terms) flags.push("✓ " + t("rt_annotate_terms"));
  if (data.annotate_names) flags.push("✓ " + t("rt_annotate_names"));
  if (data.free_translation) flags.push("✓ " + t("rt_free_translation"));
  if (flags.length) {
    html += `<div class="tpl-detail-field"><strong>${t("rt_options_label")}</strong><p>${flags.join("<br>")}</p></div>`;
  }

  container.innerHTML = html || `<p class="hint">${t("select_template_detail_hint")}</p>`;
}
