import {
  getImpactStats,
  getTimelineEvents,
  saveSettings,
  WEIGHT_PRESETS,
  getOrderHistory
} from "../common/storage.js";

const el = (id) => document.getElementById(id);

function setText(id, v) {
  const e = el(id);
  if (e) e.textContent = String(v ?? "");
}

function show(id) {
  el(id)?.classList.remove("hidden");
}
function hide(id) {
  el(id)?.classList.add("hidden");
}

function pct(n) {
  const x = Math.max(0, Math.min(100, Number(n) || 0));
  return `${x}%`;
}

function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function monthKey(iso) {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function scoreBand(overall) {
  const n = Number(overall) || 0;
  if (n >= 80) return { cls: "excellent", label: "Excellent", meaning: "Excellent" };
  if (n >= 60) return { cls: "okay", label: "Okay", meaning: "Okay" };
  return { cls: "concerning", label: "Concerning", meaning: "Concerning" };
}

function metricLabel(key) {
  const map = {
    carbonFootprint: "Carbon footprint",
    ecoCertifications: "Eco certifications",
    energyEfficiency: "Energy efficiency",
    recyclability: "Recyclability",
    waterUsage: "Water usage",
    biodegradability: "Biodegradability",
    toxicMaterials: "Toxic materials",
    lifespan: "Lifespan",
    repairability: "Repairability",
    packagingWaste: "Packaging waste",
    transportDistance: "Transport distance",
    resourceEfficiency: "Resource efficiency",
    chemicalUse: "Chemical use",
    renewableContent: "Renewable content",
    workingConditions: "Working conditions",
    vocEmissions: "VOC emissions"
  };
  return map[key] || key;
}

function renderList(rootEl, items, emptyText = "—") {
  rootEl.innerHTML = "";
  const arr = (items || []).filter(Boolean);
  if (!arr.length) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    rootEl.appendChild(li);
    return;
  }
  for (const t of arr) {
    const li = document.createElement("li");
    li.textContent = t;
    rootEl.appendChild(li);
  }
}

function renderMetrics(metrics) {
  const root = el("metrics");
  root.innerHTML = "";
  const entries = Object.entries(metrics || {});

  for (const [k, v] of entries) {
    const wrap = document.createElement("div");
    wrap.className = "metric";

    const left = document.createElement("div");
    left.textContent = metricLabel(k);

    const right = document.createElement("div");
    right.textContent = `${Math.round(Number(v.score) || 0)} / 100`;
    right.className = "muted";

    const bar = document.createElement("div");
    bar.className = "bar";

    const fill = document.createElement("div");
    fill.className = "fill";
    fill.style.width = pct(v.score);

    bar.appendChild(fill);

    const note = document.createElement("div");
    note.className = "metric-note";
    note.textContent = v.note || "";

    wrap.appendChild(left);
    wrap.appendChild(right);
    wrap.appendChild(bar);
    wrap.appendChild(note);

    wrap.addEventListener("click", () => wrap.classList.toggle("open"));
    root.appendChild(wrap);
  }
}

async function renderCertifications(analysis) {
  const root = el("certs");
  root.innerHTML = "";

  const resp = await chrome.runtime.sendMessage({ type: "ECOLENS_GET_CERT_STATUS" });
  const byUrl = resp?.certs?.byUrl || {};
  const url = analysis?.product?.url || "";
  const stored = (url && byUrl[url]) ? byUrl[url] : {};

  const certs = Array.isArray(analysis?.certifications) ? analysis.certifications : [];

  if (!certs.length) {
    root.textContent = "No certifications detected on-page.";
    return;
  }

  for (const c of certs) {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto";
    row.style.gap = "8px";
    row.style.padding = "8px 0";
    row.style.borderBottom = "1px solid rgba(255,255,255,0.06)";

    const name = document.createElement("div");
    name.style.fontWeight = "900";
    name.style.fontSize = "12px";
    name.textContent = c.name.toUpperCase() + (c.code ? ` (${c.code})` : "");

    const statusObj = stored?.[c.name] || null;
    const status = (statusObj?.status || c.status || "claimed").toLowerCase();

    const statusLabel = document.createElement("div");
    statusLabel.className = "muted";
    statusLabel.style.textAlign = "right";
    statusLabel.textContent =
      status === "verified" ? "✅ Verified" :
      status === "verifiable" ? "🔎 Verifiable" :
      "⚠️ Claimed";

    const actions = document.createElement("div");
    actions.style.gridColumn = "1 / -1";
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.flexWrap = "wrap";

    const verifyBtn = document.createElement("button");
    verifyBtn.className = "btn secondary";
    verifyBtn.style.padding = "6px 10px";
    verifyBtn.textContent = "Open registry";
    verifyBtn.disabled = !c.verifyUrl;
    verifyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (c.verifyUrl) await chrome.tabs.create({ url: c.verifyUrl });
    });

    const markVerified = document.createElement("button");
    markVerified.className = "btn secondary";
    markVerified.style.padding = "6px 10px";
    markVerified.textContent = "Mark verified";
    markVerified.addEventListener("click", async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({
        type: "ECOLENS_SET_CERT_STATUS",
        payload: { url, certName: c.name, status: "verified", sourceUrl: c.verifyUrl || "" }
      });
      await renderCertifications(analysis);
    });

    const markClaimed = document.createElement("button");
    markClaimed.className = "btn secondary";
    markClaimed.style.padding = "6px 10px";
    markClaimed.textContent = "Reset";
    markClaimed.addEventListener("click", async (e) => {
      e.stopPropagation();
      await chrome.runtime.sendMessage({
        type: "ECOLENS_SET_CERT_STATUS",
        payload: { url, certName: c.name, status: "claimed", sourceUrl: "" }
      });
      await renderCertifications(analysis);
    });

    actions.appendChild(verifyBtn);
    actions.appendChild(markVerified);
    actions.appendChild(markClaimed);

    row.appendChild(name);
    row.appendChild(statusLabel);
    row.appendChild(actions);
    root.appendChild(row);
  }
}

function estimateSavingsFromAnalysis(analysis) {
  const co2 = Math.max(0, Number(analysis?.estimates?.estimatedExtraCo2Kg || 0));
  const water = Math.max(0, Number(analysis?.estimates?.estimatedExtraWaterL || 0));
  // Toy assumption: switching to a “better” option saves some portion of “extra”
  return { co2SavedKg: Math.round(co2 * 0.6), waterSavedL: Math.round(water * 0.6) };
}

function computeDelta(base, current) {
  const baseScore = Number(base?.overall || 0);
  const curScore = Number(current?.overall || 0);
  const deltaScore = Math.round(curScore - baseScore);

  const baseCo2 = Number(base?.estimates?.estimatedExtraCo2Kg || 0);
  const curCo2 = Number(current?.estimates?.estimatedExtraCo2Kg || 0);
  const baseWater = Number(base?.estimates?.estimatedExtraWaterL || 0);
  const curWater = Number(current?.estimates?.estimatedExtraWaterL || 0);

  const co2SavedKg = Math.max(0, Math.round((baseCo2 - curCo2) * 10) / 10);
  const waterSavedL = Math.max(0, Math.round(baseWater - curWater));

  return { baseScore, curScore, deltaScore, co2SavedKg, waterSavedL };
}

function renderMicroSignals(signals) {
  const root = el("microSignals");
  root.innerHTML = "";
  const s = signals || {};
  const add = (emoji, text, title) => {
    const span = document.createElement("span");
    span.className = "sig";
    span.title = title || text;
    span.textContent = `${emoji} ${text}`;
    root.appendChild(span);
  };

  if (s.recyclable) add("♻️", "Recyclable", "High recyclability signals");
  if (s.toxicRisk) add("☣️", "Toxic risk", "Potential toxic-chemical indicators");
  if (s.renewable) add("🌱", "Renewable", "Renewable / plant-based materials");
  if (!s.recyclable && !s.toxicRisk && !s.renewable) {
    const span = document.createElement("span");
    span.className = "sig";
    span.textContent = "ℹ️ Limited signals detected";
    root.appendChild(span);
  }
}

async function renderCommunity(analysis) {
  const url = analysis?.product?.url || "";
  const resp = await chrome.runtime.sendMessage({ type: "ECOLENS_GET_REPORTS" });
  const byUrl = resp?.reports?.byUrl || {};
  const row = url ? byUrl[url] : null;

  const misleading = row?.misleading || 0;
  const verifiedEco = row?.verifiedEco || 0;
  const notes = row?.notes || [];

  setText("communityStats", `Reports for this product: misleading ${misleading} • eco brand ${verifiedEco}${notes.length ? " • notes: " + notes.join(" | ") : ""}`);
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadImpact() {
  const impact = await getImpactStats();
  setText("impactCount", impact.switchedCount || 0);
  setText("impactCo2", Math.round(impact.estimatedCo2SavedKg || 0));
  setText("impactWater", Math.round(impact.estimatedWaterSavedL || 0));
}

async function loadTimeline() {
  const list = await getTimelineEvents();
  const root = el("timelineList");
  root.innerHTML = "";

  const nowKey = monthKey(new Date().toISOString());
  const monthEvents = (list || []).filter((e) => monthKey(e.ts) === nowKey);

  const co2 = monthEvents.reduce((s, e) => s + Number(e.co2SavedKg || 0), 0);
  const water = monthEvents.reduce((s, e) => s + Number(e.waterSavedL || 0), 0);
  const switches = monthEvents.length;

  const acDays = co2 > 0 ? Math.round((co2 / 11) * 10) / 10 : 0; // rough
  setText("monthSummary", switches
    ? `This month: avoided ~${Math.round(co2)}kg CO₂ and ~${Math.round(water)}L water. (~${acDays} days of AC usage, rough estimate)`
    : "No logged switches yet this month.");

  const showN = 6;
  for (const e of (list || []).slice(0, showN)) {
    const row = document.createElement("div");
    row.className = "muted";
    row.style.padding = "6px 0";
    row.style.borderBottom = "1px solid rgba(255,255,255,0.06)";
    row.textContent = `${fmtDate(e.ts)} • +${e.deltaScore >= 0 ? "+" : ""}${e.deltaScore} points • −${e.co2SavedKg || 0}kg CO₂, −${e.waterSavedL || 0}L water`;
    root.appendChild(row);
  }

  return { monthCo2: co2, monthWater: water, monthSwitches: switches };
}

function drawShareCard({ monthCo2, monthWater, monthSwitches }) {
  const c = el("shareCanvas");
  const ctx = c.getContext("2d");
  // background
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = "#22c55e";
  ctx.font = "bold 44px ui-sans-serif, system-ui";
  ctx.fillText("EcoLens", 40, 80);

  ctx.fillStyle = "#e7eefc";
  ctx.font = "bold 40px ui-sans-serif, system-ui";
  ctx.fillText("Shopping impact (this month)", 40, 150);

  ctx.fillStyle = "#a6b3d1";
  ctx.font = "24px ui-sans-serif, system-ui";
  ctx.fillText(`${monthSwitches} switches logged`, 40, 200);

  ctx.fillStyle = "#e7eefc";
  ctx.font = "bold 54px ui-sans-serif, system-ui";
  ctx.fillText(`${Math.round(monthCo2)} kg CO₂`, 40, 290);

  ctx.fillStyle = "#e7eefc";
  ctx.fillText(`${Math.round(monthWater)} L water`, 40, 360);

  ctx.fillStyle = "#a6b3d1";
  ctx.font = "20px ui-sans-serif, system-ui";
  ctx.fillText("Estimates based on EcoLens heuristic deltas.", 40, 420);

  return c.toDataURL("image/png");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isAmazonOrdersUrl(url) {
  return /amazon\./i.test(url || "") && /(\/your-orders\/orders|\/gp\/your-account\/order-history)/i.test(url || "");
}

async function setupOrdersUI(tab) {
  el("openOrdersBtn").addEventListener("click", async () => {
    await chrome.tabs.create({ url: "https://www.amazon.com/gp/your-account/order-history" });
  });

  el("scanOrdersBtn").addEventListener("click", async () => {
    setText("ordersStatus", "");
    if (!tab?.id) return;

    if (!isAmazonOrdersUrl(tab.url || "")) {
      setText("ordersStatus", "Open Amazon Orders page first (or click Open Orders).");
      return;
    }

    setText("ordersStatus", "Scanning orders on this page…");
    const itemsResp = await chrome.tabs.sendMessage(tab.id, { type: "ECOLENS_SCAN_ORDERS" }).catch(() => null);
    const items = itemsResp?.items || [];
    if (!items.length) {
      setText("ordersStatus", "No items found on this page. Try scrolling down and scanning again.");
      return;
    }

    setText("ordersStatus", `Found ${items.length} items. Estimating footprint…`);
    const proc = await chrome.runtime.sendMessage({ type: "ECOLENS_PROCESS_ORDERS", payload: { items } });
    if (!proc?.ok) {
      setText("ordersStatus", `Error: ${proc?.error || "Failed to process orders."}`);
      return;
    }

    setText("ordersStatus", "Saved ✓");
    await loadOrdersSummary();
  });

  await loadOrdersSummary();
}

async function loadOrdersSummary() {
  const history = await getOrderHistory();
  const items = history?.items || [];
  if (!items.length) {
    setText("ordersSummary", "No scanned orders yet.");
    return;
  }
  const totalCo2 = items.reduce((s, r) => s + Number(r.estimatedExtraCo2Kg || 0), 0);
  const totalWater = items.reduce((s, r) => s + Number(r.estimatedExtraWaterL || 0), 0);
  const avgScore = items.reduce((s, r) => s + Number(r.overall || 0), 0) / items.length;
  setText("ordersSummary", `Scanned ${items.length} items • avg score ~${Math.round(avgScore)} • estimated “extra” footprint: ${Math.round(totalCo2)}kg CO₂, ${Math.round(totalWater)}L water`);
}

async function main() {
  await loadImpact();
  const timelineSummary = await loadTimeline();

  el("shareCardBtn").addEventListener("click", async () => {
    const summary = await loadTimeline();
    const dataUrl = drawShareCard(summary);
    const a = el("downloadShare");
    a.href = dataUrl;
    a.classList.remove("hidden");
  });

  el("openOptions").addEventListener("click", async (e) => {
    e.preventDefault();
    await chrome.runtime.openOptionsPage();
  });

  const tab = await getActiveTab();
  if (!tab?.id) {
    setText("statusLine", "No active tab found.");
    return;
  }

  await setupOrdersUI(tab);

  const resp = await chrome.runtime.sendMessage({ type: "ECOLENS_GET_ANALYSIS", tabId: tab.id });
  let analysis = resp?.analysis;

  if (!analysis) {
    setText("statusLine", "No product analysis yet. Open a product page and reopen EcoLens.");
    hide("scoreCard");
    hide("altCard");
    return;
  }

  hide("statusCard");
  show("scoreCard");
  show("altCard");

  // Score band + meaning
  setText("overallScore", analysis.overall);
  const band = scoreBand(analysis.overall);
  const bandEl = el("bandBadge");
  bandEl.classList.remove("excellent", "okay", "concerning");
  bandEl.classList.add(band.cls);
  bandEl.textContent = band.label;
  setText("scoreMeaning", band.meaning);

  renderMicroSignals(analysis.signals);

  const img = el("productImg");
  if (analysis?.product?.image) {
    img.src = analysis.product.image;
    img.alt = analysis.product.title || "";
  } else {
    img.style.display = "none";
  }

  setText("productTitle", analysis?.product?.title || "");
  setText("productMeta", `${(analysis?.product?.site || "").toUpperCase()} • ${analysis.engine || "heuristic"} • ${analysis.meta?.analyzedAt || ""}`);
  setText("engineLine", `Engine: ${analysis.engine || "heuristic"}`);

  // Explainability
  const dropped = analysis?.drivers?.dropped || [];
  const boosted = analysis?.drivers?.boosted || [];
  renderList(el("driversDropped"), dropped, "No clear negative drivers.");
  renderList(el("driversBoosted"), boosted, "No clear positive drivers.");
  renderList(el("analysisNotes"), analysis?.notes || [], "—");

  const conf = String(analysis?.confidence || "low").toLowerCase();
  const confPill = el("confidencePill");
  confPill.classList.remove("low", "medium", "high");
  confPill.classList.add(conf);
  confPill.textContent = `Confidence: ${conf.charAt(0).toUpperCase() + conf.slice(1)}`;

  // Greenwashing warning
  const gw = Array.isArray(analysis?.greenwashing) ? analysis.greenwashing : [];
  if (gw.length) {
    const warn = el("greenwashWarn");
    warn.innerHTML = `⚠️ ${gw.map((x) => `<div>${x}</div>`).join("")}`;
    show("greenwashWarn");
  } else {
    hide("greenwashWarn");
  }

  renderMetrics(analysis.metrics);
  await renderCertifications(analysis);
  await renderCommunity(analysis);

  // Community actions
  el("reportMisleadingBtn").addEventListener("click", async () => {
    const note = el("reportNote").value.trim();
    await chrome.runtime.sendMessage({
      type: "ECOLENS_ADD_REPORT",
      payload: { url: analysis?.product?.url || "", kind: "misleading", note }
    });
    el("reportNote").value = "";
    await renderCommunity(analysis);
  });

  el("reportVerifiedBtn").addEventListener("click", async () => {
    const note = el("reportNote").value.trim();
    await chrome.runtime.sendMessage({
      type: "ECOLENS_ADD_REPORT",
      payload: { url: analysis?.product?.url || "", kind: "verifiedEco", note }
    });
    el("reportNote").value = "";
    await renderCommunity(analysis);
  });

  el("exportReportsBtn").addEventListener("click", async () => {
    const r = await chrome.runtime.sendMessage({ type: "ECOLENS_GET_REPORTS" });
    downloadJson("ecolens-community.json", r?.reports || { byUrl: {} });
  });

  el("importReportsBtn").addEventListener("click", () => el("importReportsFile").click());
  el("importReportsFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      await chrome.runtime.sendMessage({ type: "ECOLENS_SET_REPORTS", payload: parsed });
      setText("communityStats", "Imported ✓");
      await renderCommunity(analysis);
    } catch {
      setText("communityStats", "Import failed (invalid JSON).");
    }
    e.target.value = "";
  });

  // Brand profile
  const brand = analysis?.product?.brand || "";
  if (brand) {
    const prof = await chrome.runtime.sendMessage({ type: "ECOLENS_GET_BRAND_PROFILE", brand });
    const p = prof?.profile;
    if (p?.count) {
      setText("brandProfileLine", `${brand}: avg score ${p.avgOverall}/100 across ${p.count} scanned products (last seen ${fmtDate(p.lastSeenAt)}).`);
    } else {
      setText("brandProfileLine", `${brand}: no history yet. Browse more products from this brand to build a profile.`);
    }
  } else {
    setText("brandProfileLine", "Brand not detected on this page.");
  }

  // Deep analysis
  el("deepAskBtn").addEventListener("click", async () => {
    const q = el("deepQuestion").value.trim();
    if (!q) return;
    setText("deepStatus", "Thinking…");
    setText("deepAnswer", "");
    const res = await chrome.runtime.sendMessage({
      type: "ECOLENS_DEEP_ASK",
      payload: { question: q, product: analysis.product, analysis }
    });
    if (!res?.ok) {
      setText("deepStatus", "");
      setText("deepAnswer", res?.error || "Failed.");
      return;
    }
    setText("deepStatus", "✓");
    setText("deepAnswer", res.answer || "");
  });

  // Presets
  for (const btn of Array.from(document.querySelectorAll(".chip[data-preset]"))) {
    btn.addEventListener("click", async () => {
      const key = btn.getAttribute("data-preset");
      const weights = WEIGHT_PRESETS[key];
      if (!weights) return;
      setText("presetStatus", "Applying…");
      await saveSettings({ weights, weightPreset: key });
      const ra = await chrome.runtime.sendMessage({ type: "ECOLENS_REANALYZE", tabId: tab.id });
      if (!ra?.ok) {
        setText("presetStatus", ra?.error || "Failed to re-analyze.");
        return;
      }
      analysis = ra.analysis;
      setText("presetStatus", "Updated ✓ (reopen popup if needed)");
      // Re-render the key sections quickly
      setText("overallScore", analysis.overall);
      const b2 = scoreBand(analysis.overall);
      bandEl.classList.remove("excellent", "okay", "concerning");
      bandEl.classList.add(b2.cls);
      bandEl.textContent = b2.label;
      setText("scoreMeaning", b2.meaning);
      renderMicroSignals(analysis.signals);

      renderList(el("driversDropped"), analysis?.drivers?.dropped || [], "No clear negative drivers.");
      renderList(el("driversBoosted"), analysis?.drivers?.boosted || [], "No clear positive drivers.");
      renderList(el("analysisNotes"), analysis?.notes || [], "—");

      const conf2 = String(analysis?.confidence || "low").toLowerCase();
      confPill.classList.remove("low", "medium", "high");
      confPill.classList.add(conf2);
      confPill.textContent = `Confidence: ${conf2.charAt(0).toUpperCase() + conf2.slice(1)}`;

      renderMetrics(analysis.metrics);
      await renderCertifications(analysis);
    });
  }

  // Alternatives rendering (with compare workflow)
  function renderAlternatives(alts) {
    const root = el("alternatives");
    root.innerHTML = "";
    (alts || []).forEach((a) => {
      const box = document.createElement("div");
      box.className = "alt";

      const t = document.createElement("div");
      t.className = "alt-title";
      t.textContent = a.title;

      const r = document.createElement("div");
      r.className = "alt-reason";
      r.textContent = a.reason || "";

      const actions = document.createElement("div");
      actions.className = "alt-actions";

      const open = document.createElement("button");
      open.className = "btn secondary";
      open.textContent = "Open";
      open.addEventListener("click", async () => {
        await chrome.tabs.create({ url: a.url });
      });

      const openCompare = document.createElement("button");
      openCompare.className = "btn";
      openCompare.textContent = "Open & compare";
      openCompare.addEventListener("click", async () => {
        const base = {
          ts: new Date().toISOString(),
          overall: analysis.overall,
          estimates: analysis.estimates,
          product: {
            title: analysis?.product?.title || "",
            url: analysis?.product?.url || "",
            brand: analysis?.product?.brand || "",
            site: analysis?.product?.site || ""
          }
        };
        await chrome.runtime.sendMessage({ type: "ECOLENS_SET_COMPARE_BASE", base });
        await chrome.tabs.create({ url: a.url });
      });

      actions.appendChild(openCompare);
      actions.appendChild(open);

      box.appendChild(t);
      box.appendChild(r);
      box.appendChild(actions);

      root.appendChild(box);
    });
  }

  renderAlternatives(analysis.alternatives);

  // Comparison block (if compare base exists)
  const baseResp = await chrome.runtime.sendMessage({ type: "ECOLENS_GET_COMPARE_BASE" });
  const base = baseResp?.base;
  if (base?.product?.url && base.product.url !== analysis?.product?.url) {
    const d = computeDelta(base, analysis);
    show("compareBlock");
    setText("compareBaseScore", `${d.baseScore}/100`);
    setText("compareAltScore", `${d.curScore}/100`);
    setText("compareDeltaScore", `${d.deltaScore >= 0 ? "+" : ""}${d.deltaScore} pts`);
    setText("compareDeltaImpact", `This saves ~${d.co2SavedKg}kg CO₂ & ~${d.waterSavedL}L water vs the previous product.`);
    el("logSwitchFromCompareBtn").addEventListener("click", async () => {
      const evt = {
        ts: new Date().toISOString(),
        baseTitle: base?.product?.title || "",
        baseUrl: base?.product?.url || "",
        altTitle: analysis?.product?.title || "",
        altUrl: analysis?.product?.url || "",
        baseScore: d.baseScore,
        altScore: d.curScore,
        deltaScore: d.deltaScore,
        co2SavedKg: d.co2SavedKg,
        waterSavedL: d.waterSavedL
      };
      await chrome.runtime.sendMessage({ type: "ECOLENS_LOG_SWITCH_EVENT", event: evt });
      await loadImpact();
      await loadTimeline();
      el("logSwitchFromCompareBtn").textContent = "Logged ✓";
      el("logSwitchFromCompareBtn").disabled = true;
    });

    el("clearCompareBtn").addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "ECOLENS_CLEAR_COMPARE_BASE" });
      hide("compareBlock");
    });
  } else {
    hide("compareBlock");
  }

  // Log this switch (top button) — uses compare if available, else heuristic estimate.
  el("trackSwitchBtn").addEventListener("click", async () => {
    const baseResp2 = await chrome.runtime.sendMessage({ type: "ECOLENS_GET_COMPARE_BASE" });
    const base2 = baseResp2?.base;
    let evt = null;

    if (base2?.product?.url && base2.product.url !== analysis?.product?.url) {
      const d = computeDelta(base2, analysis);
      evt = {
        ts: new Date().toISOString(),
        baseTitle: base2?.product?.title || "",
        baseUrl: base2?.product?.url || "",
        altTitle: analysis?.product?.title || "",
        altUrl: analysis?.product?.url || "",
        baseScore: d.baseScore,
        altScore: d.curScore,
        deltaScore: d.deltaScore,
        co2SavedKg: d.co2SavedKg,
        waterSavedL: d.waterSavedL
      };
      await chrome.runtime.sendMessage({ type: "ECOLENS_LOG_SWITCH_EVENT", event: evt });
      await chrome.runtime.sendMessage({ type: "ECOLENS_CLEAR_COMPARE_BASE" });
    } else {
      const payload = estimateSavingsFromAnalysis(analysis);
      evt = {
        ts: new Date().toISOString(),
        baseTitle: analysis?.product?.title || "",
        baseUrl: analysis?.product?.url || "",
        altTitle: "Eco alternative (unlinked)",
        altUrl: "",
        baseScore: analysis.overall,
        altScore: null,
        deltaScore: null,
        co2SavedKg: payload.co2SavedKg,
        waterSavedL: payload.waterSavedL
      };
      await chrome.runtime.sendMessage({ type: "ECOLENS_LOG_SWITCH_EVENT", event: evt });
    }

    await loadImpact();
    await loadTimeline();
    el("trackSwitchBtn").textContent = "Logged ✓";
    el("trackSwitchBtn").disabled = true;
  });
}

main().catch((e) => {
  setText("statusLine", `Error: ${String(e?.message || e)}`);
});
