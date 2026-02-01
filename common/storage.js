import { deepMerge } from "./utils.js";

export const DEFAULT_WEIGHTS = {
  carbonFootprint: 20,
  ecoCertifications: 20,
  energyEfficiency: 15,
  recyclability: 15,
  waterUsage: 10,
  biodegradability: 20,
  toxicMaterials: 20,
  lifespan: 10,
  repairability: 10,
  packagingWaste: 10,
  transportDistance: 10,
  resourceEfficiency: 10,
  chemicalUse: 10,
  renewableContent: 30,
  workingConditions: 10,
  vocEmissions: 10
};

// Presets (normalized later)
export const WEIGHT_PRESETS = {
  balanced: DEFAULT_WEIGHTS,
  climateFirst: {
    ...DEFAULT_WEIGHTS,
    carbonFootprint: 40,
    transportDistance: 18,
    energyEfficiency: 18,
    packagingWaste: 12,
    renewableContent: 16
  },
  lowToxicity: {
    ...DEFAULT_WEIGHTS,
    toxicMaterials: 45,
    chemicalUse: 28,
    vocEmissions: 18,
    waterUsage: 12,
    carbonFootprint: 14
  },
  ethicalLabor: {
    ...DEFAULT_WEIGHTS,
    workingConditions: 45,
    ecoCertifications: 28,
    lifespan: 14,
    repairability: 14,
    carbonFootprint: 14
  }
};

export const DEFAULT_SETTINGS = {
  useGemini: false,
  geminiApiKey: "",
  geminiModel: "gemini-1.5-flash",

  // Opt-in: let users ask free-form questions about a product (uses Gemini)
  enableDeepAnalysis: false,

  // Subjective weighting
  weights: DEFAULT_WEIGHTS,
  weightPreset: "balanced",

  // Seed suggestions for alternatives
  verifiedBrands: [
    { category: "personal care", title: "Ethique (plastic-free bars)", query: "Ethique shampoo bar plastic free", reason: "Concentrated, plastic-free alternatives." },
    { category: "cleaning", title: "Blueland (refillable cleaners)", query: "Blueland refill tablets cleaner", reason: "Refill tablets reduce packaging waste." },
    { category: "fashion", title: "Patagonia (repair & longevity)", query: "Patagonia Worn Wear", reason: "Durable products + repair culture." },
    { category: "electronics", title: "Fairphone (repairable phone)", query: "Fairphone repairable smartphone", reason: "Modular, repair-friendly design." }
  ],

  enabledSites: {
    amazon: true,
    walmart: true,
    ebay: true,
    target: true
  }
};

const SYNC_KEY = "ecolens_settings_v1";
const IMPACT_KEY = "ecolens_impact_v1";
const TIMELINE_KEY = "ecolens_timeline_v1";     // impact timeline events (switches)
const SCANLOG_KEY = "ecolens_scanlog_v1";       // recent analyzed products (for brand profiles)
const ORDERLOG_KEY = "ecolens_orderlog_v1";     // scanned order history items (Amazon)
const REPORTS_KEY = "ecolens_reports_v1";       // local “community” reports (no server)
const CERTVERIFY_KEY = "ecolens_certverify_v1"; // per-product certification verification status
const COMPARE_KEY = "ecolens_compare_v1";       // stored comparison baseline (local)

function getArea(areaName) {
  return areaName === "local" ? chrome.storage.local : chrome.storage.sync;
}

export function storageGet(areaName, keys) {
  const area = getArea(areaName);
  return new Promise((resolve) => area.get(keys, resolve));
}

export function storageSet(areaName, obj) {
  const area = getArea(areaName);
  return new Promise((resolve) => area.set(obj, resolve));
}

export async function getSettings() {
  const data = await storageGet("sync", [SYNC_KEY]);
  const saved = data?.[SYNC_KEY] || {};
  return deepMerge(DEFAULT_SETTINGS, saved);
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const next = deepMerge(current, patch || {});
  await storageSet("sync", { [SYNC_KEY]: next });
  return next;
}

export async function resetSettings() {
  await storageSet("sync", { [SYNC_KEY]: DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}

export async function getImpactStats() {
  const data = await storageGet("sync", [IMPACT_KEY]);
  return (
    data?.[IMPACT_KEY] || {
      switchedCount: 0,
      estimatedCo2SavedKg: 0,
      estimatedWaterSavedL: 0,
      updatedAt: null
    }
  );
}

export async function addImpactSwitch({ co2SavedKg = 0, waterSavedL = 0 } = {}) {
  const stats = await getImpactStats();
  const next = {
    switchedCount: (stats.switchedCount || 0) + 1,
    estimatedCo2SavedKg: Number(stats.estimatedCo2SavedKg || 0) + Number(co2SavedKg || 0),
    estimatedWaterSavedL: Number(stats.estimatedWaterSavedL || 0) + Number(waterSavedL || 0),
    updatedAt: new Date().toISOString()
  };
  await storageSet("sync", { [IMPACT_KEY]: next });
  return next;
}

export async function getTimelineEvents() {
  const data = await storageGet("sync", [TIMELINE_KEY]);
  return data?.[TIMELINE_KEY] || [];
}

export async function addTimelineEvent(evt) {
  const cur = await getTimelineEvents();
  const next = [evt, ...(cur || [])].slice(0, 250);
  await storageSet("sync", { [TIMELINE_KEY]: next });
  return next;
}

export async function getScanLog() {
  const data = await storageGet("sync", [SCANLOG_KEY]);
  return data?.[SCANLOG_KEY] || [];
}

export async function addScanLogEntry(entry) {
  const cur = await getScanLog();
  const next = [entry, ...(cur || [])].slice(0, 400);
  await storageSet("sync", { [SCANLOG_KEY]: next });
  return next;
}

export async function getOrderHistory() {
  const data = await storageGet("sync", [ORDERLOG_KEY]);
  return data?.[ORDERLOG_KEY] || { items: [], scannedAt: null };
}

export async function setOrderHistory(orderHistory) {
  await storageSet("sync", { [ORDERLOG_KEY]: orderHistory || { items: [], scannedAt: null } });
  return orderHistory;
}

export async function getReports() {
  const data = await storageGet("sync", [REPORTS_KEY]);
  return data?.[REPORTS_KEY] || { byUrl: {} };
}

export async function setReports(reports) {
  await storageSet("sync", { [REPORTS_KEY]: reports || { byUrl: {} } });
  return reports;
}

export async function addReport({ url, kind, note }) {
  if (!url) return null;
  const cur = await getReports();
  const byUrl = cur.byUrl || {};
  const row = byUrl[url] || { misleading: 0, verifiedEco: 0, notes: [] };
  if (kind === "misleading") row.misleading = (row.misleading || 0) + 1;
  if (kind === "verifiedEco") row.verifiedEco = (row.verifiedEco || 0) + 1;
  if (note) row.notes = [String(note).slice(0, 180), ...(row.notes || [])].slice(0, 5);
  byUrl[url] = row;
  const next = { byUrl };
  await storageSet("sync", { [REPORTS_KEY]: next });
  return next;
}

export async function getCertVerifications() {
  const data = await storageGet("sync", [CERTVERIFY_KEY]);
  return data?.[CERTVERIFY_KEY] || { byUrl: {} };
}

export async function setCertVerifications(certs) {
  await storageSet("sync", { [CERTVERIFY_KEY]: certs || { byUrl: {} } });
  return certs;
}

export async function setCertVerification({ url, certName, status, sourceUrl }) {
  if (!url || !certName) return null;
  const cur = await getCertVerifications();
  const byUrl = cur.byUrl || {};
  const row = byUrl[url] || {};
  row[certName] = {
    status: status || "claimed",
    sourceUrl: sourceUrl || "",
    updatedAt: new Date().toISOString()
  };
  byUrl[url] = row;
  const next = { byUrl };
  await storageSet("sync", { [CERTVERIFY_KEY]: next });
  return next;
}

export async function getCompareBase() {
  const data = await storageGet("local", [COMPARE_KEY]);
  return data?.[COMPARE_KEY] || null;
}

export async function setCompareBase(base) {
  await storageSet("local", { [COMPARE_KEY]: base || null });
}

export async function clearCompareBase() {
  await storageSet("local", { [COMPARE_KEY]: null });
}

// Per-tab caches
function analysisKey(tabId) {
  return `ecolens_analysis_tab_${tabId}`;
}
function productKey(tabId) {
  return `ecolens_product_tab_${tabId}`;
}

export async function setTabAnalysis(tabId, analysis) {
  if (!Number.isInteger(tabId)) return;
  await storageSet("local", { [analysisKey(tabId)]: analysis });
}

export async function getTabAnalysis(tabId) {
  if (!Number.isInteger(tabId)) return null;
  const data = await storageGet("local", [analysisKey(tabId)]);
  return data?.[analysisKey(tabId)] || null;
}

export async function clearTabAnalysis(tabId) {
  if (!Number.isInteger(tabId)) return;
  await new Promise((resolve) => chrome.storage.local.remove([analysisKey(tabId)], resolve));
}

export async function setTabProduct(tabId, product) {
  if (!Number.isInteger(tabId)) return;
  await storageSet("local", { [productKey(tabId)]: product });
}

export async function getTabProduct(tabId) {
  if (!Number.isInteger(tabId)) return null;
  const data = await storageGet("local", [productKey(tabId)]);
  return data?.[productKey(tabId)] || null;
}

export async function clearTabProduct(tabId) {
  if (!Number.isInteger(tabId)) return;
  await new Promise((resolve) => chrome.storage.local.remove([productKey(tabId)], resolve));
}
