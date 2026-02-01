(function () {
  function text(el) {
    return (el && el.textContent ? el.textContent : "").trim();
  }

  function first(sel) {
    return document.querySelector(sel);
  }

  function allText(sel, limit = 8) {
    return Array.from(document.querySelectorAll(sel))
      .map((el) => text(el))
      .filter(Boolean)
      .slice(0, limit);
  }

  function parsePrice(raw) {
    if (!raw) return "";
    return raw.replace(/\s+/g, " ").trim();
  }

  function siteFromHost() {
    const h = location.hostname.toLowerCase();
    if (h.includes("amazon")) return "amazon";
    if (h.includes("walmart")) return "walmart";
    if (h.includes("ebay")) return "ebay";
    if (h.includes("target")) return "target";
    return "unknown";
  }

  function extractAmazon() {
    const title = text(first("#productTitle")) || text(first("h1"));
    const brand =
      text(first("#bylineInfo")) ||
      text(first("#brand")) ||
      text(first("a#bylineInfo")) ||
      "";
    const bullets = allText("#feature-bullets li span", 10);

    const price1 = text(first("#priceblock_ourprice")) || text(first("#priceblock_dealprice"));
    const price2 =
      text(first("span.a-price.aok-align-center span.a-offscreen")) ||
      text(first("span.a-price span.a-offscreen"));
    const price = parsePrice(price1 || price2);

    const img = first("#imgTagWrapperId img") || first("#landingImage");
    const image = img ? (img.getAttribute("src") || img.getAttribute("data-old-hires") || "") : "";

    return { title, brand, bullets, price, image };
  }

  function extractWalmart() {
    const title =
      text(first('[data-testid="product-title"]')) ||
      text(first("h1")) ||
      "";
    const price =
      text(first('[data-testid="price-wrap"]')) ||
      text(first("span[itemprop='price']")) ||
      "";
    const brand = "";
    const bullets = allText("ul li span", 10);
    const img = first("img[loading='eager']") || first("img");
    const image = img ? img.src : "";
    return { title, brand, bullets, price: parsePrice(price), image };
  }

  function extractEbay() {
    let title = text(first("#itemTitle")) || text(first("h1"));
    title = title.replace(/^details about\s*/i, "").trim();
    const price = text(first("#prcIsum")) || text(first(".display-price")) || "";
    const brand = "";
    const bullets = allText("#viTabs_0_is ul li", 10);
    const img = first("#icImg") || first("img");
    const image = img ? img.src : "";
    return { title, brand, bullets, price: parsePrice(price), image };
  }

  function extractTarget() {
    const title =
      text(first('[data-test="product-title"]')) ||
      text(first("h1")) ||
      "";
    const price =
      text(first('[data-test="product-price"]')) ||
      text(first("div[data-test='product-price']")) ||
      "";
    const bullets = allText("ul li", 10);
    const img = first("img[alt]") || first("img");
    const image = img ? img.src : "";
    return { title, brand: "", bullets, price: parsePrice(price), image };
  }

  function extractGeneric() {
    const title = text(first("h1")) || document.title || "";
    const price = "";
    const bullets = [];
    const img = first("img");
    const image = img ? img.src : "";
    return { title, brand: "", bullets, price, image };
  }


  function isAmazonOrdersPage() {
    const site = siteFromHost();
    if (site !== "amazon") return false;
    const p = location.pathname || "";
    return /(\/your-orders\/orders|\/gp\/your-account\/order-history)/i.test(p);
  }

  function extractOrdersFromPage() {
    if (!isAmazonOrdersPage()) return null;

    const anchors = Array.from(document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]'));
    const items = [];
    const seen = new Set();

    for (const a of anchors) {
      const title = text(a);
      if (!title || title.length < 8) continue;

      // Skip action links that are not product titles
      if (/\b(return|track|invoice|details|buy again|write a product review|view order)\b/i.test(title)) continue;

      let url = "";
      try {
        url = new URL(a.getAttribute("href") || a.href, location.origin).toString();
        url = url.split("?")[0];
      } catch {
        continue;
      }

      // Prefer /dp/ URLs (reduce noise)
      if (!/\/dp\//.test(url) && !/\/gp\/product\//.test(url)) continue;

      if (seen.has(url)) continue;
      seen.add(url);

      // Best-effort date extraction from nearest order container
      let orderDate = "";
      const container = a.closest("div.a-box-group") || a.closest("div.a-box") || document.body;
      const raw = (container && container.innerText) ? container.innerText : "";
      const m = raw.match(/Order\s+placed\s*\n?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
      if (m && m[1]) orderDate = m[1].trim();

      items.push({ title, url, orderDate });
      if (items.length >= 40) break;
    }

    return { items };
  }


  function extractProductFromPage() {
    const site = siteFromHost();
    // Avoid treating order-history pages as products
    if (site === "amazon" && isAmazonOrdersPage()) return null;
    let core;
    if (site === "amazon") core = extractAmazon();
    else if (site === "walmart") core = extractWalmart();
    else if (site === "ebay") core = extractEbay();
    else if (site === "target") core = extractTarget();
    else core = extractGeneric();

    const title = (core.title || "").trim();
    if (!title || title.length < 6) return null;

    return {
      site,
      title,
      brand: core.brand || "",
      bullets: core.bullets || [],
      price: core.price || "",
      image: core.image || "",
      url: location.href
    };
  }

  window.EcolensExtractors = { extractProductFromPage, extractOrdersFromPage, isAmazonOrdersPage };
})();
