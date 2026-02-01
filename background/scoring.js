import { clamp, normalizeWeights } from "../common/utils.js";

const CERTS = [
  "fair trade",
  "fsc",
  "energy star",
  "gots",
  "oeko-tex",
  "rainforest alliance",
  "b corp",
  "leaping bunny",
  "cradle to cradle",
  "usda organic"
];

const POSITIVE = [
  "recycled",
  "post-consumer",
  "bamboo",
  "organic",
  "refill",
  "refillable",
  "compostable",
  "biodegradable",
  "plastic-free",
  "low voc",
  "voc-free",
  "repairable",
  "modular",
  "replaceable",
  "warranty",
  "durable",
  "energy star",
  "fsc",
  "fair trade",
  "recyclable",
  "glass",
  "aluminum",
  "paper",
  "plant-based"
];

const NEGATIVE = [
  "single-use",
  "disposable",
  "pvc",
  "vinyl",
  "pfas",
  "ptfe",
  "bpa",
  "phthalate",
  "microplastic",
  "fast fashion",
  "polyester",
  "glitter",
  "blister pack",
  "individually wrapped"
];

const MARKETING_CLAIMS = [
  "eco-friendly",
  "environmentally friendly",
  "green",
  "natural",
  "sustainable",
  "planet friendly",
  "earth friendly",
  "clean",
  "conscious"
];

const CERT_VERIFY_LINKS = {
  "fsc": "https://search.fsc.org/",
  "energy star": "https://www.energystar.gov/productfinder/product/certified-products",
  "fair trade": "https://www.fairtrade.net/",
  "gots": "https://global-standard.org/",
  "oeko-tex": "https://www.oeko-tex.com/en/label-check",
  "rainforest alliance": "https://www.rainforest-alliance.org/",
  "b corp": "https://www.bcorporation.net/en-us/find-a-b-corp/",
  "leaping bunny": "https://www.leapingbunny.org/shopping-guide",
  "cradle to cradle": "https://www.c2ccertified.org/",
  "usda organic": "https://organic.ams.usda.gov/integrity/"
};

function textBlob(product) {
  const parts = [
    product?.title,
    product?.brand,
    ...(product?.bullets || []),
    product?.description
  ].filter(Boolean);
  return parts.join(" ").toLowerCase();
}

function unique(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const k = String(x).trim();
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function findHits(haystack, needles) {
  const hits = [];
  for (const n of needles) if (haystack.includes(n)) hits.push(n);
  return unique(hits);
}

function scoreFromSignals(base, posHits, negHits, posStep = 6, negStep = 8) {
  return clamp(base + posHits * posStep - negHits * negStep, 0, 100);
}

function detectCertScore(blob) {
  const hits = findHits(blob, CERTS);
  if (!hits.length) return { score: 20, notes: ["No clear certifications detected on-page."], hits: [] };
  const score = clamp(40 + hits.length * 15, 0, 100);
  return { score, notes: [`Detected: ${hits.slice(0, 4).join(", ")}${hits.length > 4 ? "…" : ""}`], hits };
}

function categoryHint(blob) {
  if (/(shampoo|soap|conditioner|deodorant|toothpaste|lotion|serum|skincare)/.test(blob)) return "personal care";
  if (/(detergent|cleaner|spray|dish|laundry|bleach)/.test(blob)) return "cleaning";
  if (/(t-?shirt|jeans|jacket|hoodie|dress|fashion|sneaker|shoe|polyester)/.test(blob)) return "fashion";
  if (/(phone|laptop|headphone|speaker|electronics|charger|battery|tv|monitor)/.test(blob)) return "electronics";
  if (/(bottle|cup|mug|straw|container|reusable)/.test(blob)) return "reusables";
  return "general";
}

function buildDrivers({ certHits, posHits, negHits, blob }) {
  const boosted = [];
  const dropped = [];

  // Certifications
  for (const c of certHits) {
    if (c === "fsc") boosted.push("FSC certification");
    else if (c === "energy star") boosted.push("Energy Star certification");
    else boosted.push(`${c.toUpperCase()} certification`);
  }

  // Positive signals
  if (posHits.includes("refill") || posHits.includes("refillable")) boosted.push("Refillable / reduced packaging");
  if (posHits.includes("plastic-free")) boosted.push("Plastic-free packaging");
  if (posHits.includes("recycled") || posHits.includes("post-consumer")) boosted.push("Recycled content");
  if (posHits.includes("compostable") || posHits.includes("biodegradable")) boosted.push("Compostable / biodegradable claim");
  if (posHits.includes("bamboo") || posHits.includes("plant-based")) boosted.push("Renewable materials");
  if (posHits.includes("repairable") || posHits.includes("modular") || posHits.includes("replaceable")) boosted.push("Repairability signals");
  if (posHits.includes("durable") || posHits.includes("warranty")) boosted.push("Durability / warranty signals");
  if (posHits.includes("recyclable") || posHits.includes("glass") || posHits.includes("aluminum") || posHits.includes("paper")) boosted.push("Recyclable materials");

  // Negative signals
  if (negHits.includes("pfas")) dropped.push("PFAS mention");
  if (negHits.includes("ptfe")) dropped.push("PTFE / non-stick chemical mention");
  if (negHits.includes("bpa")) dropped.push("BPA mention");
  if (negHits.includes("phthalate")) dropped.push("Phthalate mention");
  if (negHits.includes("microplastic")) dropped.push("Microplastic mention");
  if (negHits.includes("single-use") || negHits.includes("disposable")) dropped.push("Single-use / disposable wording");
  if (negHits.includes("pvc") || negHits.includes("vinyl")) dropped.push("PVC/vinyl materials");
  if (negHits.includes("polyester") || negHits.includes("fast fashion")) dropped.push("Fast-fashion / synthetics");
  if (negHits.includes("blister pack") || negHits.includes("individually wrapped")) dropped.push("High-waste packaging");

  // Extra packaging heuristic
  if ((blob.includes("plastic") && (blob.includes("packaging") || blob.includes("wrapped") || blob.includes("blister")))) {
    dropped.push("Plastic packaging");
  }

  return { boosted: unique(boosted).slice(0, 6), dropped: unique(dropped).slice(0, 6) };
}

function buildCertClaims({ certHits, blob }) {
  const claims = [];
  const fscCode = (blob.match(/fsc\s*[-–]?\s*c\s*\d{6}/i) || [])[0] || "";
  for (const c of certHits) {
    const verifyUrl = CERT_VERIFY_LINKS[c] || "";
    const entry = { name: c, status: "claimed", verifyUrl };
    if (c === "fsc" && fscCode) {
      entry.status = "verifiable";
      entry.code = fscCode.toUpperCase().replace(/\s+/g, "");
    }
    claims.push(entry);
  }
  return claims;
}

function greenwashingWarnings({ blob, certHits, posHits }) {
  const claims = findHits(blob, MARKETING_CLAIMS);
  const evidence = (certHits?.length || 0) > 0 || (posHits?.length || 0) >= 2;
  if (!claims.length) return [];
  if (evidence) return [];
  // Flag only the first few claims to avoid spam
  return claims.slice(0, 3).map((c) => `Marketing claim detected (“${c}”) without clear certification or concrete evidence on-page.`);
}

export function scoreHeuristic(product, settings) {
  const blob = textBlob(product);
  const posHits = findHits(blob, POSITIVE);
  const negHits = findHits(blob, NEGATIVE);
  const cat = categoryHint(blob);

  const baseCarbon = cat === "electronics" ? 35 : 50;
  const baseWater = cat === "fashion" ? 40 : 50;

  const ecoCert = detectCertScore(blob);
  const certHits = ecoCert.hits || [];

  const metrics = {
    carbonFootprint: {
      score: scoreFromSignals(baseCarbon, posHits.length, negHits.length, 5, 8),
      note: "Estimated from materials/keywords and category baseline."
    },
    ecoCertifications: {
      score: ecoCert.score,
      note: ecoCert.notes.join(" ")
    },
    energyEfficiency: {
      score: scoreFromSignals(cat === "electronics" ? 45 : 55, blob.includes("energy star") ? 3 : 0, negHits.length, 10, 6),
      note: cat === "electronics" ? "Electronics baseline; Energy Star boosts score." : "Non-electronics baseline."
    },
    recyclability: {
      score: scoreFromSignals(50, findHits(blob, ["recyclable", "recycled", "aluminum", "glass", "paper"]).length, findHits(blob, ["mixed material", "laminated", "multi-layer"]).length, 10, 10),
      note: "Higher for recyclable/recycled materials; lower for mixed materials."
    },
    waterUsage: {
      score: scoreFromSignals(baseWater, findHits(blob, ["waterless", "low water"]).length, 0, 15, 0),
      note: "Category baseline; boosts for explicit low-water claims."
    },
    biodegradability: {
      score: scoreFromSignals(45, findHits(blob, ["biodegradable", "compostable", "plant-based"]).length, findHits(blob, ["plastic", "polyester", "vinyl", "pvc"]).length, 12, 10),
      note: "Boosted by compostable/plant-based; reduced by plastics/synthetics."
    },
    toxicMaterials: {
      score: scoreFromSignals(55, findHits(blob, ["bpa-free", "phthalate-free", "non-toxic", "pfas-free"]).length, findHits(blob, ["pfas", "ptfe", "bpa", "phthalate", "microplastic"]).length, 12, 15),
      note: "Looks for toxic-chemical indicators on-page."
    },
    lifespan: {
      score: scoreFromSignals(55, findHits(blob, ["durable", "long-lasting", "lifetime", "heavy-duty"]).length, findHits(blob, ["disposable", "single-use"]).length, 10, 20),
      note: "Durability claims improve score; disposable terms reduce it."
    },
    repairability: {
      score: scoreFromSignals(cat === "electronics" ? 40 : 55, findHits(blob, ["repairable", "modular", "replaceable parts"]).length, findHits(blob, ["sealed", "non-repairable"]).length, 18, 12),
      note: "Boosted by repair/modular wording; lower for sealed designs."
    },
    packagingWaste: {
      score: scoreFromSignals(50, findHits(blob, ["plastic-free", "minimal packaging", "recyclable packaging"]).length, findHits(blob, ["individually wrapped", "blister pack"]).length, 14, 10),
      note: "Packaging-related terms affect score."
    },
    transportDistance: {
      score: scoreFromSignals(50, findHits(blob, ["made in usa", "made in uk", "made in eu", "locally made"]).length, 0, 12, 0),
      note: "Boosted by local manufacturing claims when present."
    },
    resourceEfficiency: {
      score: scoreFromSignals(50, findHits(blob, ["refill", "concentrated", "multi-use"]).length, findHits(blob, ["single-use", "disposable"]).length, 12, 16),
      note: "Refills/concentrates/multi-use score higher."
    },
    chemicalUse: {
      score: scoreFromSignals(55, findHits(blob, ["plant-based", "non-toxic", "free of"]).length, findHits(blob, ["pfas", "solvent", "bleach", "ammonia"]).length, 10, 12),
      note: "Proxy from ingredient/chemical keywords."
    },
    renewableContent: {
      score: scoreFromSignals(50, findHits(blob, ["bamboo", "wood", "paper", "hemp", "organic cotton", "cork"]).length, findHits(blob, ["plastic", "petroleum", "polyester", "vinyl", "pvc"]).length, 12, 10),
      note: "Higher for renewable fibers/materials; lower for petroleum-based materials."
    },
    workingConditions: {
      score: scoreFromSignals(45, findHits(blob, ["fair trade", "ethical", "living wage", "responsible sourcing", "b corp"]).length, 0, 14, 0),
      note: "Boosted by ethics claims/certs when present."
    },
    vocEmissions: {
      score: scoreFromSignals(50, findHits(blob, ["low voc", "voc-free", "zero voc"]).length, 0, 18, 0),
      note: "Boosted by explicit VOC claims."
    }
  };

  // Weighted overall
  const weights = normalizeWeights(settings?.weights || {});
  let overall = 0;
  let used = 0;
  for (const [k, v] of Object.entries(metrics)) {
    const w = weights[k];
    if (typeof w === "number" && w > 0) {
      overall += v.score * w;
      used += w;
    }
  }
  if (used > 0 && used !== 1) overall = overall / used;
  overall = clamp(Math.round(overall), 0, 100);

  const grade =
    overall >= 85 ? "A" :
    overall >= 70 ? "B" :
    overall >= 55 ? "C" :
    overall >= 40 ? "D" : "F";

  // Rough “impact” estimates (toy model)
  const estimatedCo2Kg = clamp(Math.round((70 - overall) * 0.25), 0, 25);
  const estimatedWaterL = clamp(Math.round((70 - overall) * 3), 0, 400);

  const drivers = buildDrivers({ certHits, posHits, negHits, blob });
  const greenwashing = greenwashingWarnings({ blob, certHits, posHits });
  const certClaims = buildCertClaims({ certHits, blob });

  // Confidence heuristic
  let confidence = "low";
  const signalCount = (posHits.length + negHits.length + certHits.length);
  if (certHits.length >= 1 || signalCount >= 6) confidence = "medium";

  const signals = {
    recyclable: metrics.recyclability.score >= 70,
    toxicRisk: metrics.toxicMaterials.score <= 45,
    renewable: metrics.renewableContent.score >= 70
  };

  return {
    product,
    category: cat,
    overall,
    grade,
    confidence,
    metrics,
    estimates: {
      estimatedExtraCo2Kg: estimatedCo2Kg,
      estimatedExtraWaterL: estimatedWaterL
    },
    drivers,
    greenwashing,
    certifications: certClaims,
    signals,
    notes: [
      "This score is generated from on-page signals and defaults. For higher accuracy, enable Gemini in Options and/or use verified certification codes."
    ]
  };
}
