import { stripCodeFences } from "../common/utils.js";

export async function analyzeWithGemini({ apiKey, model, product, weights }) {
  // NOTE: Endpoint/model names can change over time. This is intentionally optional.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = `
You are an environmental product analyst.

Given this product info, return ONLY valid JSON (no markdown).
Compute metric scores 0-100 for each field listed in "metricsWanted".
Also include "overall" (0-100) and short "notes" (array of strings).

Product:
- title: ${product?.title || ""}
- brand: ${product?.brand || ""}
- price: ${product?.price || ""}
- site: ${product?.site || ""}
- url: ${product?.url || ""}
- bullets: ${(product?.bullets || []).slice(0, 8).join(" | ")}

metricsWanted:
${JSON.stringify(Object.keys(weights || {}))}

JSON shape:
{
  "overall": number,
  "metrics": { "carbonFootprint": {"score": number, "note": string}, ... },
  "notes": [string, ...],
  "confidence": "low"|"medium"|"high"
}
`.trim();

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini request failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n") || "";
  const cleaned = stripCodeFences(text);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Gemini response was not valid JSON.");
  }

  return parsed;
}
