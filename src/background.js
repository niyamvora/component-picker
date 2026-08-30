// Toolbar click → inject picker.js into the active tab. picker.js is
// idempotent: injecting it again toggles the picker off.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^(https?|file):/.test(tab.url || "")) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
});

// Viewports we re-measure the picked subtree at. Same tab, same DOM state —
// CDP device emulation reflows the live page instead of reloading it.
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, dpr: 3, mobile: true },
  { name: "tablet", width: 768, height: 1024, dpr: 2, mobile: true },
];

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const job = msg.type === "responsive" ? responsive(sender.tab.id)
    : msg.type === "probe" ? probe(sender.tab.id) : null;
  if (!job) return;
  job.then(reply, (e) => reply({ error: String(e.message || e) }));
  return true;
});

// Runs in the page's MAIN world, where React's __reactFiber$ expandos are visible.
// Self-contained: executeScript serializes it. Elements arrive tagged data-cp-tmp="<index>".
function pageProbe() {
  const fiberOf = (el) => { const k = Object.keys(el).find((k) => k.startsWith("__reactFiber$")); return k ? el[k] : null; };
  const typeName = (t) => t && typeof t !== "string" &&
    (t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && (t.type.displayName || t.type.name)));
  const els = [...document.querySelectorAll("[data-cp-tmp]")].sort((a, b) => a.dataset.cpTmp - b.dataset.cpTmp);
  const root = els[0];
  const out = { framework: "not detected", chain: [], handlers: [] };
  if (!root) return out;
  if (fiberOf(root)) {
    const next = window.__NEXT_DATA__ || document.getElementById("__next") || document.querySelector('script[src*="/_next/"]');
    out.framework = next ? "React (Next.js)" : "React";
    for (let f = fiberOf(root); f && out.chain.length < 8; f = f.return) { const n = typeName(f.type); if (n) out.chain.push(n); }
    for (const el of els) {
      const p = fiberOf(el)?.memoizedProps;
      if (!p || typeof p !== "object") continue;
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === "function" && out.handlers.length < 25) out.handlers.push(`[data-cp="${+el.dataset.cpTmp + 1}"] ${k}: ${v.toString().replace(/\s+/g, " ").slice(0, 300)}`);
      }
    }
  } else if (root.__vueParentComponent || root.__vue__) {
    const vue = root.__vueParentComponent || root.__vue__;
    out.framework = `Vue (${vue.type?.name || vue.$options?.name || "component"})`;
  }
  return out;
}

async function probe(tabId) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: pageProbe });
  return r.result;
}

async function responsive(tabId) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  const out = [];
  try {
    for (const v of VIEWPORTS) {
      await chrome.debugger.sendCommand(target, "Emulation.setDeviceMetricsOverride", {
        width: v.width, height: v.height, deviceScaleFactor: v.dpr, mobile: v.mobile,
      });
      const snap = await chrome.tabs.sendMessage(tabId, { type: "snapshot" });
      out.push({ ...v, ...snap });
    }
  } finally {
    await chrome.debugger.sendCommand(target, "Emulation.clearDeviceMetricsOverride").catch(() => {});
    await chrome.debugger.detach(target).catch(() => {});
  }
  return { viewports: out };
}
