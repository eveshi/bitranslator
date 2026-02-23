/* LLM settings sidebar */
import { $, show, hide, apiJson } from './core.js';
import { t } from './i18n.js';

function getModelValue() {
  const provider = $("#llm-provider").value;
  return provider === "gemini" ? $("#llm-model").value : $("#llm-model-custom").value;
}
function getTranslationModelValue() {
  const provider = $("#llm-provider").value;
  return provider === "gemini" ? $("#llm-translation-model").value : $("#llm-translation-model-custom").value;
}

export function updateProviderUI(resetDefaults = true) {
  const provider = $("#llm-provider").value;
  const baseUrlLabel = $("#label-base-url");
  const isGemini = provider === "gemini";

  $("#llm-model").style.display = isGemini ? "" : "none";
  $("#llm-model-custom").style.display = isGemini ? "none" : "";
  $("#llm-translation-model").style.display = isGemini ? "" : "none";
  $("#llm-translation-model-custom").style.display = isGemini ? "none" : "";

  if (!resetDefaults) {
    if (isGemini) { hide(baseUrlLabel); $("#llm-api-key").placeholder = "AIza..."; }
    else { show(baseUrlLabel); }
    return;
  }
  if (isGemini) {
    hide(baseUrlLabel); $("#llm-base-url").value = "";
    $("#llm-model").value = "gemini-2.5-pro"; $("#llm-api-key").placeholder = "AIza...";
  } else if (provider === "ollama") {
    show(baseUrlLabel); $("#llm-base-url").value = "http://localhost:11434/v1";
    $("#llm-model-custom").value = "llama3"; $("#llm-api-key").placeholder = "(not required)";
  } else {
    show(baseUrlLabel); $("#llm-base-url").value = "https://api.openai.com/v1";
    $("#llm-model-custom").value = "gpt-4o"; $("#llm-api-key").placeholder = "sk-...";
  }
}

export async function loadLLMSettings() {
  try {
    const s = await apiJson("/api/settings/llm");
    $("#llm-provider").value = s.provider || "gemini";
    updateProviderUI(false);
    if (s.provider === "gemini") {
      $("#llm-model").value = s.model || "gemini-2.5-pro";
      $("#llm-translation-model").value = s.translation_model || "";
    } else {
      $("#llm-model-custom").value = s.model || "";
      $("#llm-translation-model-custom").value = s.translation_model || "";
      if (s.base_url) $("#llm-base-url").value = s.base_url;
    }
    $("#llm-temperature").value = s.temperature ?? 0.3;
    if (s.api_key_set) {
      $("#llm-api-key").value = "";
      $("#llm-api-key").placeholder = s.api_key_masked || "****";
      hide($("#api-key-warning"));
    } else {
      show($("#api-key-warning"));
    }
  } catch (e) {
    console.warn("Could not load LLM settings:", e);
    updateProviderUI(true);
    show($("#api-key-warning"));
  }
}

export function initSettings() {
  $("#btn-save-llm").addEventListener("click", async () => {
    try {
      const payload = {
        provider: $("#llm-provider").value, base_url: $("#llm-base-url").value,
        model: getModelValue(), translation_model: getTranslationModelValue(),
        temperature: parseFloat($("#llm-temperature").value),
        api_key: $("#llm-api-key").value.trim() || "__KEEP__",
      };
      await apiJson("/api/settings/llm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      alert(t("settings_saved"));
      await loadLLMSettings();
    } catch (e) { alert(t("save_failed") + ": " + e.message); }
  });
  $("#llm-provider").addEventListener("change", () => updateProviderUI(true));
}
