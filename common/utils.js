export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function safeNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

export function normalizeWeights(weightsObj) {
  const entries = Object.entries(weightsObj || {}).filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0);
  const total = entries.reduce((s, [, v]) => s + Number(v), 0);
  if (!entries.length || total <= 0) return {};
  const out = {};
  for (const [k, v] of entries) out[k] = Number(v) / total;
  return out;
}

export function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && base && typeof base[k] === "object" && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function stripCodeFences(s) {
  if (typeof s !== "string") return "";
  return s.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
}

export function nowIso() {
  return new Date().toISOString();
}
