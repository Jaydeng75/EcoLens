import { getSettings } from "../common/storage.js";
import { scoreHeuristic } from "./scoring.js";
import { buildAlternatives } from "./alternatives.js";
import { analyzeWithGemini } from "./gemini.js";
import { clamp, normalizeWeights, nowIso } from "../common/utils.js";

function gradeFromOverall(overall) {
  return overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : overall >= 40 ? "D" : "F";
}

function recomputeSignals(metrics) {
  const m = metrics || {};
  return {
    recyclable: Number(m?.recyclability?.score || 0) >= 70,
    toxicRisk: Number(m?.toxicMaterials?.score || 0) <= 45,
    renewable: Number(m?.renewableContent?.score || 0) >= 70
  };
}

function mergeGeminiIntoHeuristic(heuristic, gemini, weights) {
  const merged = { ...heuristic };
  if (typeof gemini?.overall === "number") merged.overall = clamp(Math.round(gemini.overall), 0, 100);
  merged.grade = gradeFromOverall(merged.overall);
  merged.confidence = gemini?.confidence || merged.confidence || "medium";

  if (gemini?.metrics && typeof gemini.metrics === "object") {
    const nextMetrics = { ...merged.metrics };
    for (const k of Object.keys(weights)) {
      const g = gemini.metrics[k];
      if (g && typeof g.score === "number") {
        nextMetrics[k] = {
          score: clamp(Math.round(g.score), 0, 100),
          note: typeof g.note === "string" ? g.note : (nextMetrics[k]?.note || "")
        };
      }
    }
    merged.metrics = nextMetrics;
  }

  // Keep heuristic drivers/greenwashing unless Gemini explicitly adds extra notes
  if (Array.isArray(gemini?.notes)) merged.notes = [...(merged.notes || []), ...gemini.notes].slice(0, 10);

  merged.signals = recomputeSignals(merged.metrics);
  return merged;
}

export async function analyzeProduct(product) {
  const settings = await getSettings();
  const weights = normalizeWeights(settings.weights);

  // Always compute heuristic first (fallback + explanation)
  let analysis = scoreHeuristic(product, settings);

  // Optional Gemini enrichment
  if (settings.useGemini && settings.geminiApiKey) {
    try {
      const gem = await analyzeWithGemini({
        apiKey: settings.geminiApiKey,
        model: settings.geminiModel,
        product,
        weights
      });
      analysis = mergeGeminiIntoHeuristic(analysis, gem, weights);
      analysis.engine = "gemini+heuristic";
    } catch (e) {
      analysis.engine = "heuristic";
      analysis.notes = [...(analysis.notes || []), `Gemini unavailable: ${String(e?.message || e)}`].slice(0, 10);
    }
  } else {
    analysis.engine = "heuristic";
  }

  analysis.alternatives = buildAlternatives(product, analysis, settings);
  analysis.meta = {
    analyzedAt: nowIso(),
    extension: "Ecolens",
    creator: "Jayden Jeswin Raj"
  };

  return analysis;
}
