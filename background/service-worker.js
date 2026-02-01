import { analyzeProduct } from "./analyze.js";
import { scoreHeuristic } from "./scoring.js";
import {
  addImpactSwitch,
  addTimelineEvent,
  addScanLogEntry,
  clearTabAnalysis,
  clearTabProduct,
  getTabAnalysis,
  getTabProduct,
  setTabAnalysis,
  setTabProduct,
  getSettings,
  setCompareBase,
  getCompareBase,
  clearCompareBase,
  addReport,
  getReports,
  setReports,
  setCertVerification,
  getCertVerifications,
  setCertVerifications,
  getScanLog,
  setOrderHistory,
  getOrderHistory
} from "../common/storage.js";

chrome.runtime.onInstalled.addListener(async () => {
  // Ensure defaults exist
  await getSettings();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await clearTabAnalysis(tabId);
  await clearTabProduct(tabId);
});

async function handleExtractedProduct(sender, product) {
  const tabId = sender?.tab?.id;
  if (!Number.isInteger(tabId) || !product?.title) return null;

  await setTabProduct(tabId, product);
  const analysis = await analyzeProduct(product);
  await setTabAnalysis(tabId, analysis);

  // Log a lightweight scan entry for brand profiles/history
  await addScanLogEntry({
    ts: new Date().toISOString(),
    url: product.url || sender?.tab?.url || "",
    title: product.title || "",
    brand: product.brand || "",
    site: product.site || "",
    overall: analysis.overall,
    grade: analysis.grade,
    estimatedExtraCo2Kg: analysis?.estimates?.estimatedExtraCo2Kg || 0,
    estimatedExtraWaterL: analysis?.estimates?.estimatedExtraWaterL || 0,
    category: analysis.category || "general"
  });

  return analysis;
}

async function computeBrandProfile(brand) {
  const b = String(brand || "").trim().toLowerCase();
  if (!b) return { brand: "", count: 0, avgOverall: null, lastSeenAt: null };
  const log = await getScanLog();
  const rows = (log || []).filter((r) => String(r.brand || "").trim().toLowerCase() === b);
  if (!rows.length) return { brand: brand || "", count: 0, avgOverall: null, lastSeenAt: null };

  const avgOverall = rows.reduce((s, r) => s + Number(r.overall || 0), 0) / rows.length;
  const avgExtraCo2 = rows.reduce((s, r) => s + Number(r.estimatedExtraCo2Kg || 0), 0) / rows.length;
  const avgExtraWater = rows.reduce((s, r) => s + Number(r.estimatedExtraWaterL || 0), 0) / rows.length;
  const lastSeenAt = rows[0]?.ts || null;

  return {
    brand: brand || "",
    count: rows.length,
    avgOverall: Math.round(avgOverall),
    avgEstimatedExtraCo2Kg: Math.round(avgExtraCo2 * 10) / 10,
    avgEstimatedExtraWaterL: Math.round(avgExtraWater * 10) / 10,
    lastSeenAt
  };
}

async function deepAsk({ question, product, analysis }) {
  const settings = await getSettings();
  if (!settings.enableDeepAnalysis) throw new Error("Deep analysis is disabled. Enable it in Options.");
  if (!settings.geminiApiKey) throw new Error("No Gemini API key set in Options.");
  const model = settings.geminiModel || "gemini-1.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.geminiApiKey)}`;

  const prompt = `
You are EcoLens, a consumer-facing sustainability analyst.

User question:
${question}

Product context:
- title: ${product?.title || ""}
- brand: ${product?.brand || ""}
- price: ${product?.price || ""}
- site: ${product?.site || ""}
- url: ${product?.url || ""}

Current EcoLens scores:
- overall: ${analysis?.overall ?? ""}
- grade: ${analysis?.grade ?? ""}
- confidence: ${analysis?.confidence ?? ""}

Explain your answer in plain language.
If the page data is insufficient, say what would be needed (certification code, full ingredients, materials, etc.).
Avoid making up certifications.
Keep it under 120 words.
`.trim();

  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }] };

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
  return text.trim();
}

async function processOrders({ items }) {
  const now = new Date().toISOString();
  const settings = await getSettings();

  const out = [];
  const max = Math.min(80, Array.isArray(items) ? items.length : 0);
  for (let i = 0; i < max; i++) {
    const it = items[i] || {};
    const pseudoProduct = {
      site: "amazon",
      title: it.title || "",
      brand: it.brand || "",
      bullets: [],
      price: it.price || "",
      image: "",
      url: it.url || ""
    };
    if (!pseudoProduct.title) continue;
    const a = scoreHeuristic(pseudoProduct, settings);
    out.push({
      title: pseudoProduct.title,
      url: pseudoProduct.url,
      orderDate: it.orderDate || "",
      overall: a.overall,
      grade: a.grade,
      category: a.category || "general",
      estimatedExtraCo2Kg: a?.estimates?.estimatedExtraCo2Kg || 0,
      estimatedExtraWaterL: a?.estimates?.estimatedExtraWaterL || 0
    });
  }

  const orderHistory = { items: out, scannedAt: now };
  await setOrderHistory(orderHistory);
  return orderHistory;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || typeof msg.type !== "string") {
        sendResponse({ ok: false, error: "Invalid message." });
        return;
      }

      if (msg.type === "ECOLENS_EXTRACTED_PRODUCT") {
        const analysis = await handleExtractedProduct(sender, msg.product);
        sendResponse({ ok: true, analysis });
        return;
      }

      if (msg.type === "ECOLENS_GET_ANALYSIS") {
        const tabId = msg.tabId;
        const cached = await getTabAnalysis(tabId);
        sendResponse({ ok: true, analysis: cached });
        return;
      }

      if (msg.type === "ECOLENS_REANALYZE") {
        const tabId = msg.tabId;
        const product = await getTabProduct(tabId);
        if (!product) {
          sendResponse({ ok: false, error: "No cached product to re-analyze." });
          return;
        }
        const analysis = await analyzeProduct(product);
        await setTabAnalysis(tabId, analysis);
        sendResponse({ ok: true, analysis });
        return;
      }

      if (msg.type === "ECOLENS_TRACK_SWITCH") {
        const saved = await addImpactSwitch(msg.payload || {});
        sendResponse({ ok: true, impact: saved });
        return;
      }

      if (msg.type === "ECOLENS_LOG_SWITCH_EVENT") {
        const evt = msg.event || null;
        if (evt) await addTimelineEvent(evt);

        // Also keep the simple counters in sync
        if (evt?.co2SavedKg || evt?.waterSavedL) {
          await addImpactSwitch({ co2SavedKg: evt?.co2SavedKg || 0, waterSavedL: evt?.waterSavedL || 0 });
        }

        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "ECOLENS_SET_COMPARE_BASE") {
        await setCompareBase(msg.base || null);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "ECOLENS_GET_COMPARE_BASE") {
        const base = await getCompareBase();
        sendResponse({ ok: true, base });
        return;
      }

      if (msg.type === "ECOLENS_CLEAR_COMPARE_BASE") {
        await clearCompareBase();
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "ECOLENS_ADD_REPORT") {
        const next = await addReport(msg.payload || {});
        sendResponse({ ok: true, reports: next });
        return;
      }

      if (msg.type === "ECOLENS_SET_REPORTS") {
        const next = await setReports(msg.payload || { byUrl: {} });
        sendResponse({ ok: true, reports: next });
        return;
      }

      if (msg.type === "ECOLENS_GET_REPORTS") {
        const reports = await getReports();
        sendResponse({ ok: true, reports });
        return;
      }

      if (msg.type === "ECOLENS_SET_CERT_STATUS") {
        const next = await setCertVerification(msg.payload || {});
        sendResponse({ ok: true, certs: next });
        return;
      }

      if (msg.type === "ECOLENS_SET_CERTS") {
        const next = await setCertVerifications(msg.payload || { byUrl: {} });
        sendResponse({ ok: true, certs: next });
        return;
      }

      if (msg.type === "ECOLENS_GET_CERT_STATUS") {
        const certs = await getCertVerifications();
        sendResponse({ ok: true, certs });
        return;
      }

      if (msg.type === "ECOLENS_GET_BRAND_PROFILE") {
        const profile = await computeBrandProfile(msg.brand || "");
        sendResponse({ ok: true, profile });
        return;
      }

      if (msg.type === "ECOLENS_DEEP_ASK") {
        const answer = await deepAsk(msg.payload || {});
        sendResponse({ ok: true, answer });
        return;
      }

      if (msg.type === "ECOLENS_PROCESS_ORDERS") {
        const history = await processOrders(msg.payload || {});
        sendResponse({ ok: true, orderHistory: history });
        return;
      }

      if (msg.type === "ECOLENS_GET_ORDERS") {
        const history = await getOrderHistory();
        sendResponse({ ok: true, orderHistory: history });
        return;
      }

      sendResponse({ ok: false, error: `Unknown type: ${msg.type}` });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();

  return true;
});
