// End-to-end: load the real extension in headless Chrome, inject the picker via
// its service worker (same path the toolbar click takes), extract a component
// and assert the mobile/tablet snapshots came back through chrome.debugger.
// Run: node test/e2e.mjs   (no deps — Node ≥ 22 for fetch + WebSocket)
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdtempSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");  // repo root; the http server serves from here
// Branded Chrome ≥137 ignores --load-extension; use Chrome for Testing / Chromium (override with CHROME=...).
const CHROME = process.env.CHROME ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const PORT = 8765, CDP = 9333;
// Test what actually ships, never a stale bundle.
execFileSync(process.execPath, [join(ROOT, "build.mjs")], { cwd: ROOT, stdio: "ignore" });

// No toolbar click here, so no activeTab grant: load a temp copy of the extension with a localhost host permission.
const EXT = mkdtempSync(join(tmpdir(), "cp-ext-"));
// The whole build, not a file list: a manifest that names a page the copy is missing (a side
// panel, a popup) makes Chrome reject the extension outright.
cpSync(join(ROOT, "dist"), EXT, { recursive: true });
const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
// Strip the all_urls content script so the test drives injection manually (no double-inject).
delete manifest.content_scripts;
writeFileSync(join(EXT, "manifest.json"), JSON.stringify({ ...manifest, host_permissions: [`http://localhost:${PORT}/*`] }));


const server = createServer(async (req, res) => {
  try {
    const body = await readFile(join(ROOT, req.url.split("?")[0]));
    res.writeHead(200, { "content-type": extname(req.url) === ".js" ? "text/javascript" : "text/html" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(PORT);

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${CDP}`,
  // Chrome/Chromium ≥137 ignore --load-extension unless this feature is switched back off.
  // Harmless on builds that never had it.
  "--disable-features=DisableLoadExtensionCommandLineSwitch",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "cp-e2e-"))}`,
  `--load-extension=${EXT}`, `--disable-extensions-except=${EXT}`,
  `http://localhost:${PORT}/test/fixture.html`,
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
  if (!ws) {
    const seen = (await targets()).map((t) => `${t.type} ${t.url}`).join("\n  ");
    throw new Error(`extension service worker not found. Targets:\n  ${seen}`);
  }
  const evaluate = (e) => evalIn(ws, e);

  // Put a real pointer on the animated button and leave it there. Everything the picker measures
  // afterwards must be the RESTING state — this is the regression test for the :hover leak.
  const page = (await targets()).find((t) => t.type === "page" && t.url.includes("fixture.html"));
  const pws = await connect(page);
  const [hx, hy] = JSON.parse(await evalIn(pws, `(() => { const r = document.querySelector(".btn").getBoundingClientRect(); return JSON.stringify([Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]); })()`));
  await cmd(pws, "Input.dispatchMouseEvent", { type: "mouseMoved", x: hx, y: hy });
  await sleep(400);
  if (!/rgb\(255, 0, 0\)/.test(await evalIn(pws, `getComputedStyle(document.querySelector(".btn")).backgroundColor`)))
    throw new Error("test setup: the synthetic hover did not take, so the leak cannot be detected");
  pws.close();

  // Plant the things the MAIN-world probe reads: Framer Motion props on the card's fiber (#30),
  // a GSAP stub whose one tween targets the card (#31), and Webflow's page marker (#33).
  await evaluate(`(async () => {
    const [tab] = await chrome.tabs.query({});
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: () => {
      document.getElementById("card").__reactFiber$test.memoizedProps.initial = { opacity: 0, y: 20 };
      document.getElementById("card").__reactFiber$test.memoizedProps.animate = { opacity: 1, y: 0 };
      document.getElementById("card").__reactFiber$test.memoizedProps.transition = { duration: 0.4 };
      document.getElementById("card").__reactFiber$test.memoizedProps.variant = "primary";
      document.getElementById("card").__reactFiber$test.memoizedProps.size = "sm";
      document.getElementById("card").__reactFiber$test.memoizedProps.disabled = false;
      document.getElementById("card").__reactFiber$test._debugSource = { fileName: "/project/src/components/Card.tsx", lineNumber: 12, columnNumber: 4 };
      document.documentElement.setAttribute("data-wf-page", "x");
      const card = document.getElementById("card");
      window.gsap = { globalTimeline: { getChildren: () => [{
        targets: () => [card], vars: { y: 40, opacity: 1, duration: 0.6, ease: "power2.out" },
        duration: () => 0.6, startTime: () => 0, paused: () => true,
      }] } };
    } });
  })()`);

  const md = await evaluate(`(async () => {
    const [tab] = await chrome.tabs.query({});
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["picker.js"] });
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.__cp.stop(); return window.__cp.extract(document.querySelector("#card")); } });
    return r.result;
  })()`);

  // #14 — store that pick as the reference, change the card, pick again: only the difference shows.
  // #16 — and drive the viewport list from stored options, the way the popup does.
  const compared = await evaluate(`(async () => {
    const [tab] = await chrome.tabs.query({});
    const [snap] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => window.__cp.lastBlocks() });
    await chrome.storage.session.set({ reference: { blocks: snap.result, label: "div#card.card", url: "https://reference.example/x", at: Date.now() } });
    await chrome.storage.local.set({
      // #38 — a two-line inventory the capture should map onto
      inventory: ["Card  .card", "Button  button, [role=button]  variant"].join(String.fromCharCode(10)),
      options: { screenshots: false, fontFace: false, js: true, states: false, themes: false,
                 tokensJson: false, tailwind: false, jsx: false, a11y: true, fast: false, extraMedia: true, vue: false, svelte: false, htmlCss: false,
                 viewports: [{ name: "phone", width: 320, height: 600, dpr: 2, mobile: true }] },
    });
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      document.getElementById("card").style.borderRadius = "2px";
      return window.__cp.extract(document.querySelector("#card"));
    } });
    return r.result;
  })()`);
  ws.close();

  const section = (name, next) => md.slice(md.indexOf(name), next ? md.indexOf(next) : undefined);
  const mobile = section("## Responsive: mobile", "## Responsive: tablet");
  const resting = section("## CSS (desktop, resting state)", "## State:");
  const hover = section("## State: hover", "## State: focus-visible");
  const active = section("## State: active", "## Source rules");
  const must = ["## Responsive: mobile 390×844 (DPR 3)", "## Responsive: tablet 768×1024 (DPR 2)", "data-cp=\"1\"",
    "Framework: React.", "Component chain: Card › Page.", '[data-cp="1"] onClick: function handleCard() { return 1; }',
    // #13 — the other theme, reached by flipping the class the page uses
    "## Theme: dark (diff vs light) — via html.dark", "background-color: rgb(20, 20, 20);",
    // #15 — a PNG of the element at each viewport
    "## Screenshots", "desktop ", "![desktop](data:image/png;base64,iVBOR", "![mobile](data:image/png;base64,iVBOR",
    // #30 — Framer Motion props off the fiber
    "## Framer Motion", '[data-cp="1"] <motion.Card>', 'initial: {"opacity":0,"y":20}', 'transition: {"duration":0.4}',
    // #31 — the GSAP tween that targets the card
    "## GSAP", '[data-cp="1"]', '"power2.out"', "0.6s", "(paused — likely scroll-driven)",
    // #33 — the builder behind the page, named in the header and detailed in Platform notes
    "Platform: Webflow.", "## Platform notes", "Webflow grid/util classes to replace: w-container",
    // #60 source locations from the (fake) dev-build fiber
    "Source: src/components/Card.tsx:12:4", "## Source locations", "src/components/Card.tsx:12:4",
    // #62 inferred prop shape
    "## Props (inferred from the React fiber)", "<Card>", 'variant: "primary" (string)', "disabled: false (boolean)"];
  const fails = must.filter((s) => !md.includes(s));
  // #14 — the second capture must report only what changed against the stored reference.
  if (!/## Compared with reference \(div#card\.card — reference\.example/.test(compared))
    fails.push("second capture is missing the comparison against the stored reference");
  if (!/border-radius: 2px;\s+\/\* reference: 8px \*\//.test(compared))
    fails.push("comparison does not carry the reference value for a changed property");
  // #16 — stored options drive the capture: one custom viewport, no screenshots, no states.
  if (!compared.includes("## Responsive: phone 320×600 (DPR 2)")) fails.push("stored viewport list was ignored");
  if (compared.includes("## Screenshots")) fails.push("screenshots were captured with the option off");
  if (compared.includes("## State: hover")) fails.push("states were captured with the option off");
  // #45 — forced-colors is captured as a diff (deterministic in headless; it inverts the palette).
  if (!/## Media: forced-colors: active \(diff vs default\)/.test(compared)) fails.push("#45 forced-colors media section missing");
  if (!/(background-)?color: rgb\(/.test(compared.slice(compared.indexOf("## Media: forced-colors")))) fails.push("#45 forced-colors diff is empty");
  // #38 — the inventory maps the card and the button, and lists what it could not place.
  if (!/## Mapping to your components/.test(compared)) fails.push("#38 mapping section missing");
  if (!/\[data-cp="1"\] → <Card/.test(compared)) fails.push("#38 card did not map to <Card>");
  if (!/→ <Button variant=/.test(compared)) fails.push("#38 button did not map to <Button>");
  // #1 — the pointer is on .btn while the capture runs; the resting block must not show its hover colour.
  if (/background-color: rgb\(255, 0, 0\)/.test(resting)) fails.push("hover colour leaked into the resting desktop CSS");
  // #2 — forced states, measured on the child that owns the rule, not just the picked root.
  if (!/background-color: rgb\(255, 0, 0\)/.test(hover)) fails.push("State: hover is missing the forced :hover colour");
  if (!/background-color: rgb\(0, 128, 0\)/.test(active)) fails.push("State: active is missing the forced :active colour");
  // Settle must outlast the page's own transition, or a state is read part-way through the fade.
  if (!/color: rgb\(0, 0, 255\);/.test(hover)) fails.push("State: hover colour was measured mid-transition");
  // #5 — a responsive change caused by a breakpoint must say so, not read as a reflow.
  if (!/flex-direction: row;\s*\/\* @media \(max-width: 600px\) \.card applies \*\//.test(mobile))
    fails.push("mobile diff does not name the @media rule that caused it");
  if (!/\[data-cp="1"\][^}]*flex-direction: row;/.test(mobile)) fails.push("mobile diff lacks flex-direction: row on root");
  if (/transform: matrix/.test(md)) fails.push("animated transform leaked into CSS");
  if (/transform-origin/.test(md)) fails.push("default transform-origin leaked into CSS");
  const shown = (process.env.SHOW === "compared" ? compared : md);
  console.log(fails.length ? `FAIL\n${fails.map((s) => "MISSING " + s).join("\n")}\n\n${md}` : `PASS ${md.length} chars\n` + shown.slice(shown.indexOf(process.env.SHOW === "compared" ? "## Compared" : (process.env.SHOW || "## Responsive"))));
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error("FAIL", e);
  process.exitCode = 1;
} finally {
  chrome.kill();
  server.close();
}
