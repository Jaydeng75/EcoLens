function categoryFromAnalysis(analysis) {
  return analysis?.category || "general";
}

function makeSearchUrl(q) {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function buildAlternatives(product, analysis, settings) {
  const cat = categoryFromAnalysis(analysis);
  const verified = settings?.verifiedBrands || [];
  const picks = verified.filter((b) => (b.category || "general") === cat).slice(0, 3);

  // Fallback suggestions if none match category
  const fallback = [
    { category: "general", title: "Plastic-free / refill alternative", query: `${product?.title || "product"} plastic-free refill`, reason: "Search for lower-waste options." },
    { category: "general", title: "Recycled materials alternative", query: `${product?.title || "product"} recycled materials`, reason: "Search for recycled/renewable content." },
    { category: "general", title: "Certified eco alternative", query: `${product?.title || "product"} FSC Fair Trade Energy Star`, reason: "Search for credible certifications." }
  ];

  const list = (picks.length ? picks : fallback).map((p) => ({
    title: p.title,
    reason: p.reason,
    url: makeSearchUrl(p.query),
    query: p.query
  }));

  return list;
}
