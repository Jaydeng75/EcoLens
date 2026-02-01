(function () {
  const MIN_INTERVAL_MS = 2500;
  let lastSentAt = 0;
  let lastUrl = location.href;

  function shouldRunOnThisSite() {
    const h = location.hostname.toLowerCase();
    return h.includes("amazon") || h.includes("walmart") || h.includes("ebay") || h.includes("target");
  }

  function scanAndSend(reason) {
    if (!shouldRunOnThisSite()) return;
    const now = Date.now();
    if (now - lastSentAt < MIN_INTERVAL_MS) return;

    const extractor = window.EcolensExtractors && window.EcolensExtractors.extractProductFromPage;
    if (typeof extractor !== "function") return;

    const product = extractor();
    if (!product) return;

    lastSentAt = now;
    chrome.runtime.sendMessage({ type: "ECOLENS_EXTRACTED_PRODUCT", product, reason }, () => {
      // ignore response; background caches analysis per tab
    });
  }

  // Initial run
  setTimeout(() => scanAndSend("initial"), 900);

  // SPA navigation hooks
  const _pushState = history.pushState;
  history.pushState = function () {
    _pushState.apply(this, arguments);
    setTimeout(() => scanAndSend("pushState"), 700);
  };

  const _replaceState = history.replaceState;
  history.replaceState = function () {
    _replaceState.apply(this, arguments);
    setTimeout(() => scanAndSend("replaceState"), 700);
  };

  window.addEventListener("popstate", () => setTimeout(() => scanAndSend("popstate"), 700));

  // DOM mutation watcher
  const mo = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(() => scanAndSend("urlChange"), 700);
      return;
    }
    scanAndSend("mutation");
  });

  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Popup-triggered actions
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      if (msg?.type === "ECOLENS_SCAN_ORDERS") {
        const res = window.EcolensExtractors?.extractOrdersFromPage?.();
        sendResponse({ ok: true, items: res?.items || [] });
        return;
      }
      sendResponse({ ok: false });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  });

})();
