// Shared by the extension end-to-end suites: build, load the real extension into Chrome for Testing,
// serve the repo over HTTP, and speak CDP to its pages and its service worker.
// Node ≥ 22 (fetch + WebSocket), no dependencies.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdtempSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");  // repo root; the http server serves from here
// Branded Chrome ≥137 ignores --load-extension; use Chrome for Testing / Chromium (override with CHROME=...).
const CHROME = process.env.CHROME ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
// Real types, not just JS-or-HTML: a stylesheet served as text/html is refused, so an exported page would render unstyled.
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Chrome with the freshly built extension loaded and `url` open, plus the CDP helpers the suites use.
 * No toolbar click happens, so there is no activeTab grant: the extension copy gets a localhost host
 * permission instead, and its all_urls content script is stripped so each suite injects on its own terms.
 */
export async function launch({ port, cdp, url, hosts = [] }) {
  // Test what actually ships, never a stale bundle.
  execFileSync(process.execPath, [join(ROOT, "build.mjs")], { cwd: ROOT, stdio: "ignore" });
  const ext = mkdtempSync(join(tmpdir(), "cp-ext-"));
  // The whole build, not a file list: a manifest that names a page the copy is missing (a side
  // panel, a popup) makes Chrome reject the extension outright.
  cpSync(join(ROOT, "dist"), ext, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
  delete manifest.content_scripts;
  // `hosts` adds permissions beyond localhost — a live-site smoke run needs the site itself.
  writeFileSync(join(ext, "manifest.json"), JSON.stringify({ ...manifest, host_permissions: [`http://localhost:${port}/*`, ...hosts] }));

  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(req.url.split("?")[0]);
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "text/html" }).end(body);
    } catch { res.writeHead(404).end(); }
  }).listen(port);

  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${cdp}`,
    // Chrome/Chromium ≥137 ignore --load-extension unless this feature is switched back off.
    // Harmless on builds that never had it.
    "--disable-features=DisableLoadExtensionCommandLineSwitch",
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "cp-e2e-"))}`,
    `--load-extension=${ext}`, `--disable-extensions-except=${ext}`,
    url,
  ], { stdio: "ignore" });

  async function targets() {
    for (let i = 0; i < 50; i++) {
      try { return await (await fetch(`http://localhost:${cdp}/json`)).json(); } catch { await sleep(200); }
    }
    throw new Error("Chrome did not expose CDP");
  }
  const connect = async (t) => { const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); return ws; };
  let msgId = 0;
  const cmd = (ws, method, params) => new Promise((resolve, reject) => {
    const id = ++msgId;
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id !== id) return; d.error ? reject(new Error(JSON.stringify(d))) : resolve(d.result); };
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalIn = async (ws, expression) => {
    const r = await cmd(ws, "Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  /** The extension's service worker. Several extensions ship one; ours is the one whose manifest says so. */
  async function serviceWorker() {
    for (let i = 0; i < 50; i++) {
      for (const t of (await targets()).filter((t) => t.type === "service_worker")) {
        const w = await connect(t);
        if ((await evalIn(w, "chrome.runtime.getManifest().name").catch(() => "")) === "Component Picker") return w;
        w.close();
      }
      await sleep(200);
    }
    const seen = (await targets()).map((t) => `${t.type} ${t.url}`).join("\n  ");
    throw new Error(`extension service worker not found. Targets:\n  ${seen}`);
  }
  const close = () => { chrome.kill(); server.close(); };
  return { targets, connect, cmd, evalIn, serviceWorker, close };
}
