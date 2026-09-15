// End-to-end for export_page (#120): the real extension, the real MCP server, a real browser.
// Opens test/fixture-rebuild.html in export mode, turns the bridge on, calls export_page over MCP
// stdio exactly as an agent would, and checks the folder it writes. Needs mcp/node_modules
// (cd mcp && npm install). Runs its own server on BRIDGE_PORT, so a real component-picker-mcp on
// 8787 can keep running.
// Run: node test/export.e2e.mjs
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { launch, ROOT, sleep } from "./chrome.mjs";

const PORT = 8766, CDP = 9334, BRIDGE_PORT = 8797;
const OUT = join(ROOT, "test", ".export-tmp");
const CALL_TIMEOUT = 300_000;

if (await fetch(`http://127.0.0.1:${BRIDGE_PORT}/next`).then(() => true, () => false)) {
  console.error(`FAIL port ${BRIDGE_PORT} is already in use — a previous run may still be alive`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });

const browser = await launch({ port: PORT, cdp: CDP, url: `http://localhost:${PORT}/test/fixture-rebuild.html?export` });
const mcp = spawn(process.execPath, [join(ROOT, "mcp", "server.mjs")], {
  env: { ...process.env, CP_MCP_PORT: String(BRIDGE_PORT) },
  stdio: ["pipe", "pipe", "inherit"],
});

let id = 0;
const rpc = (method, params) => {
  const msg = { jsonrpc: "2.0", id: ++id, method, params };
  mcp.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${method} ${params?.name ?? ""} timed out`)), CALL_TIMEOUT);
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const m = JSON.parse(line);
        if (m.id === msg.id) { clearTimeout(timer); mcp.stdout.off("data", onData); resolve(m); }
      }
    };
    mcp.stdout.on("data", onData);
  });
};
const textOf = (res) => res.result?.content?.[0]?.text ?? JSON.stringify(res);
const walkFiles = (dir) => readdirSync(dir).flatMap((f) => statSync(join(dir, f)).isDirectory() ? walkFiles(join(dir, f)) : [join(dir, f)]);

const fails = [];
const expect = (ok, message) => { if (!ok) fails.push(message); };

try {
  await sleep(500);
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "export-e2e", version: "0" } });
  mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  // Hide the dock, which could sit over a trigger the sweep clicks, and turn the bridge on from a
  // page context: a service worker does not receive its own runtime messages.
  const sw = await browser.serviceWorker();
  await browser.evalIn(sw, `(async () => {
    await chrome.storage.local.set({ options: { dockEverywhere: false }, bridgePort: ${BRIDGE_PORT} });
    const [tab] = await chrome.tabs.query({});
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => chrome.runtime.sendMessage({ type: "bridge", on: true }) });
  })()`);
  await sleep(1500);

  const exported = textOf(await rpc("tools/call", { name: "export_page", arguments: { out_dir: OUT } }));
  const dir = join(OUT, "localhost");
  expect(exported.startsWith(`Wrote `) && exported.includes(dir), "export_page did not report writing the folder:\n" + exported.slice(0, 800));

  if (existsSync(dir)) {
    const read = (p) => readFileSync(join(dir, p), "utf8");
    const files = walkFiles(dir).map((f) => relative(dir, f));
    for (const f of ["README.md", "index.html", "styles.css", "tokens.json", "breakpoints.json", "motion.json", "assets/manifest.json",
      "states/index.json", "fingerprint.1440.json", "fingerprint.768.json", "fingerprint.390.json", "assets/svg/acme.svg"]) {
      expect(files.includes(f), `missing ${f} (have: ${files.join(", ")})`);
    }
    expect(!files.some((f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f)), "a raster image was written in manifest mode: " + files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)));

    const html = read("index.html");
    expect((html.match(/class="many-item"/g) || []).length === 400 && html.includes("Second panel secret text") && !html.includes("<script"),
      "index.html is missing elements or closed-panel text, or kept a script");
    const css = read("styles.css");
    expect(css.includes("@property --angle") && css.includes("@keyframes used-spin"), "styles.css is missing the registered property or the used keyframes");
    expect(css.includes(".menu-item { color: rgb(9, 9, 9); }"), "styles.css lost the rule only the open menu matches — the real-pointer sweep did not open it");

    const states = JSON.parse(read("states/index.json"));
    expect(states.map((s) => s.label).sort().join() === "Menu,Question?,Two", "states/index.json: " + JSON.stringify(states));
    const menu = states.find((s) => s.label === "Menu");
    expect(menu && JSON.parse(read(menu.file)).added.some((h) => h.includes("Item A")), "the menu state has no popup markup");

    const motion = JSON.parse(read("motion.json"));
    expect(motion.streams.some((s) => s.selector === "#log" && s.position === "prepend"), "motion.json has no #log stream: " + JSON.stringify(motion.streams));
    expect(motion.tracks.some((t) => t.selector === "#rafbox" && t.property === "opacity"), "motion.json has no #rafbox opacity track");

    const manifest = JSON.parse(read("assets/manifest.json"));
    const entry = (suffix) => manifest.find((e) => e.url.endsWith(suffix));
    expect(entry("/img/hero.jpg")?.role === "decorative-background" && entry("/img/avatars/jane.jpg")?.replaceWith?.initials === "JD"
      && entry("/img/logo-acme.png")?.replaceWith?.svg === "assets/svg/acme.svg", "manifest roles or stand-ins wrong: " + JSON.stringify(manifest.map((e) => [e.url.split("/").pop(), e.role])));

    expect(JSON.parse(read("tokens.json")).color?.brand?.$value === "rgb(10, 20, 30)", "tokens.json lost --brand");
    expect(JSON.parse(read("breakpoints.json")).includes("@media (min-width: 768px)"), "breakpoints.json lost the 768px breakpoint");
    expect(JSON.parse(read("fingerprint.1440.json")).width === 1440 && JSON.parse(read("fingerprint.390.json")).width === 390, "fingerprints were not taken at their widths");
    expect(read("README.md").includes("3 states opened by clicking") && read("README.md").includes("there are no screenshots"), "README.md does not reflect the run");
    expect(read("README.md").includes("#scene (a <canvas>") && read("README.md").includes("fallback_screenshots: true"),
      "README.md does not name the region with no code, or how to picture it");
  }

  // #122 — the one exception: asked for, a region with no code gets a picture, and nothing else does.
  const FALLBACK = join(OUT, "fallback");
  textOf(await rpc("tools/call", { name: "export_page", arguments: { out_dir: FALLBACK, states: false, motion: false, fallback_screenshots: true } }));
  const fallbackFiles = existsSync(join(FALLBACK, "localhost")) ? walkFiles(join(FALLBACK, "localhost")).map((f) => relative(join(FALLBACK, "localhost"), f)) : [];
  const pictures = fallbackFiles.filter((f) => f.endsWith(".png"));
  expect(pictures.length === 1 && pictures[0].startsWith("assets/fallback/01-"), "fallback_screenshots did not write exactly one picture of the canvas: " + JSON.stringify(fallbackFiles));
  expect(existsSync(join(FALLBACK, "localhost", "README.md")) && readFileSync(join(FALLBACK, "localhost", "README.md"), "utf8").includes("1 fallback picture"),
    "the fallback export's README does not account for its picture");

  // #121 — verify_rebuild: the exported index.html, served, against its own export's fingerprints.
  // index.html + styles.css are all an agent is given, so a clean match is the export's proof of fidelity.
  const verified = textOf(await rpc("tools/call", { name: "verify_rebuild", arguments: {
    url: `http://localhost:${PORT}/test/.export-tmp/localhost/index.html`, fingerprint_dir: join(OUT, "localhost") } }));
  expect(verified.includes("The rebuild matches the original at every width."),
    "verify_rebuild found differences between the export and the page it came from:\n" + verified.slice(0, 3000));

  // #104 — capture_interaction still drives the real pointer after moving onto the shared page-call helper.
  const interaction = textOf(await rpc("tools/call", { name: "capture_interaction", arguments: { steps: [{ trigger: "#menu", action: "click" }] } }));
  expect(interaction.includes("### click `#menu`"), "capture_interaction failed: " + interaction.slice(0, 400));

  console.log(fails.length ? `FAIL\n${fails.join("\n")}` : "PASS — export_page wrote a code-first folder over MCP; verify_rebuild matched it to its source; capture_interaction still runs");
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error("FAIL", e);
  process.exitCode = 1;
} finally {
  mcp.kill();
  browser.close();
}
