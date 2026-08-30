// End-to-end: load the real extension in headless Chrome, inject the picker via
// its service worker (same path the toolbar click takes), extract a component
// and assert the mobile/tablet snapshots came back through chrome.debugger.
// Run: node e2e.mjs   (no deps — Node ≥ 22 for fetch + WebSocket)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdtempSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
// Branded Chrome ≥137 ignores --load-extension; use Chrome for Testing / Chromium (override with CHROME=...).
const CHROME = process.env.CHROME ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const PORT = 8765, CDP = 9333;
// No toolbar click here, so no activeTab grant: load a temp copy of the extension with a localhost host permission.
const EXT = mkdtempSync(join(tmpdir(), "cp-ext-"));
for (const f of ["manifest.json", "background.js", "picker.js"]) cpSync(join(ROOT, f), join(EXT, f));
const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
writeFileSync(join(EXT, "manifest.json"), JSON.stringify({ ...manifest, host_permissions: [`http://localhost:${PORT}/*`] }));


const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(ROOT, req.url.split("?")[0]));
    res.writeHead(200, { "content-type": extname(req.url) === ".js" ? "text/javascript" : "text/html" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(PORT);

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${CDP}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "cp-e2e-"))}`,
  `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
  `http://localhost:${PORT}/test.html`,
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  for (let i = 0; i < 50; i++) {
    try { return await (await fetch(`http://localhost:${CDP}/json`)).json(); } catch { await sleep(200); }
  }
  throw new Error("Chrome did not expose CDP");
}

try {
  const connect = async (t) => { const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); return ws; };
  const evalIn = (ws, expression) => new Promise((resolve, reject) => {
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id !== 1) return; d.error || d.result.exceptionDetails ? reject(new Error(JSON.stringify(d))) : resolve(d.result.result.value); };
    ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  // Several extensions ship a service worker; ours is the one whose manifest says so.
  let ws;
  for (let i = 0; i < 50 && !ws; i++) {
    for (const t of (await targets()).filter((t) => t.type === "service_worker")) {
      const w = await connect(t);
      if ((await evalIn(w, "chrome.runtime.getManifest().name").catch(() => "")) === "Component Picker") { ws = w; break; }
      w.close();
    }
    if (!ws) await sleep(200);
  }
  if (!ws) throw new Error("extension service worker not found");
  const evaluate = (e) => evalIn(ws, e);
  const md = await evaluate(`(async () => {
    const [tab] = await chrome.tabs.query({});
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__cp.stop(); return window.__cp.extract(document.querySelector("#card")); } });
    return r.result;
  })()`);
  ws.close();

  const mobile = md.slice(md.indexOf("## Responsive: mobile"), md.indexOf("## Responsive: tablet"));
  const must = ["## Responsive: mobile 390×844 (DPR 3)", "## Responsive: tablet 768×1024 (DPR 2)", "data-cp=\"1\"",
    "Framework: React.", "Component chain: Card › Page.", '[data-cp="1"] onClick: function handleCard() { return 1; }'];
  const fails = must.filter((s) => !md.includes(s));
  if (!/\[data-cp="1"\][^}]*flex-direction: row;/.test(mobile)) fails.push("mobile diff lacks flex-direction: row on root");
  if (/transform: matrix/.test(md)) fails.push("animated transform leaked into CSS");
  if (/transform-origin/.test(md)) fails.push("default transform-origin leaked into CSS");
  console.log(fails.length ? `FAIL\n${fails.map((s) => "MISSING " + s).join("\n")}\n\n${md}` : `PASS ${md.length} chars\n` + md.slice(md.indexOf("## Responsive")));
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error("FAIL", e);
  process.exitCode = 1;
} finally {
  chrome.kill();
  server.close();
}
