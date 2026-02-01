import { getSettings, saveSettings, resetSettings, DEFAULT_SETTINGS, WEIGHT_PRESETS } from "../common/storage.js";

const el = (id) => document.getElementById(id);

function setStatus(msg) {
  el("status").textContent = msg || "";
}

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

async function load() {
  const s = await getSettings();
  el("useGemini").checked = !!s.useGemini;
  el("enableDeepAnalysis").checked = !!s.enableDeepAnalysis;
  el("geminiApiKey").value = s.geminiApiKey || "";
  el("geminiModel").value = s.geminiModel || "gemini-1.5-flash";
  el("weights").value = pretty(s.weights || {});
  el("brands").value = pretty(s.verifiedBrands || []);
}

function parseJsonSafe(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

async function onSave() {
  setStatus("");
  const patch = {
    useGemini: !!el("useGemini").checked,
    enableDeepAnalysis: !!el("enableDeepAnalysis").checked,
    geminiApiKey: el("geminiApiKey").value.trim(),
    geminiModel: el("geminiModel").value.trim() || "gemini-1.5-flash",
    weights: parseJsonSafe(el("weights").value, DEFAULT_SETTINGS.weights),
    verifiedBrands: parseJsonSafe(el("brands").value, DEFAULT_SETTINGS.verifiedBrands)
  };

  await saveSettings(patch);
  setStatus("Saved ✓");
}

async function onReset() {
  await resetSettings();
  await load();
  setStatus("Reset ✓");
}

el("save").addEventListener("click", () => onSave().catch((e) => setStatus(String(e?.message || e))));
el("reset").addEventListener("click", () => onReset().catch((e) => setStatus(String(e?.message || e))));

for (const btn of Array.from(document.querySelectorAll(".chip[data-preset]"))) {
  btn.addEventListener("click", async () => {
    const key = btn.getAttribute("data-preset");
    const weights = WEIGHT_PRESETS[key];
    if (!weights) return;
    el("weights").value = pretty(weights);
    await saveSettings({ weights, weightPreset: key });
    setStatus(`Preset applied: ${key}`);
  });
}

load().catch((e) => setStatus(String(e?.message || e)));
