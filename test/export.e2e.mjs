// End-to-end for export_page (#120) and verify_rebuild (#121): the real extension, the real MCP server,
// a real browser. Opens test/fixture-rebuild.html in export mode — a page that uses every technique the
// resend.com analysis found (#123) — calls export_page over MCP stdio exactly as an agent would, checks
// the folder it writes, then verifies the exported page against its own source. Needs mcp/node_modules
// (cd mcp && npm install). Runs its own server on BRIDGE_PORT, so a real component-picker-mcp on 8787
// can keep running.
// Run: node test/export.e2e.mjs
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { launch, ROOT } from "./chrome.mjs";
import { enableBridge, startMcp } from "./mcp-client.mjs";

const PORT = 8766, CDP = 9334, BRIDGE_PORT = 8797;
// Its own subfolder: clearing all of .export-tmp would delete a smoke run's export mid-investigation.
const OUT = join(ROOT, "test", ".export-tmp", "e2e");
rmSync(OUT, { recursive: true, force: true });

const walkFiles = (dir) => readdirSync(dir).flatMap((f) => statSync(join(dir, f)).isDirectory() ? walkFiles(join(dir, f)) : [join(dir, f)]);
const fails = [];
const expect = (ok, message) => { if (!ok) fails.push(message); };

const browser = await launch({ port: PORT, cdp: CDP, url: `http://localhost:${PORT}/test/fixture-rebuild.html?export` });
let mcp;
try {
  mcp = await startMcp({ port: BRIDGE_PORT });
  await enableBridge(browser, BRIDGE_PORT);

  const exported = await mcp.call("export_page", { out_dir: OUT });
  const dir = join(OUT, "localhost");
  expect(exported.startsWith(`Wrote `) && exported.includes(dir), "export_page did not report writing the folder:\n" + exported.slice(0, 800));

  if (existsSync(dir)) {
    const read = (p) => readFileSync(join(dir, p), "utf8");
    const files = walkFiles(dir).map((f) => relative(dir, f));
    for (const f of ["README.md", "index.html", "styles.css", "tokens.json", "breakpoints.json", "motion.json", "interactions.json", "assets/manifest.json",
      "states/index.json", "fingerprint.1440.json", "fingerprint.768.json", "fingerprint.390.json", "assets/svg/acme.svg"]) {
      expect(files.includes(f), `missing ${f} (have: ${files.join(", ")})`);
    }
    expect(!files.some((f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f)), "a raster image was written in manifest mode: " + files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)));

    const html = read("index.html");
    expect((html.match(/class="many-item"/g) || []).length === 400 && html.includes("Second panel secret text") && !html.includes("<script"),
      "index.html is missing elements or closed-panel text, or kept a script");
    const css = read("styles.css");
    expect(css.includes("@property --angle") && css.includes("@keyframes turn") && css.includes("@keyframes used-spin"),
      "styles.css is missing the registered property that turns the border, or its keyframes");
    expect(css.includes("@keyframes marquee-x") && css.includes(".marquee:hover ul { animation-play-state: paused; }"), "styles.css lost the marquee or its pause on hover");
    expect(css.includes(".menu-item { color: rgb(9, 9, 9); }"), "styles.css lost the rule only the open menu matches — the real-pointer sweep did not open it");

    const states = JSON.parse(read("states/index.json"));
    expect(states.map((s) => s.label).sort().join() === "Beta,Gamma,Menu,Question?,Three,Two", "states/index.json: " + JSON.stringify(states));
    const state = (label) => { const s = states.find((x) => x.label === label); return s ? JSON.parse(read(s.file)) : null; };
    expect(state("Menu")?.added.some((h) => h.includes("Item A")), "the menu state has no popup markup");
    expect(state("Three")?.revealed.some((r) => r.text.includes("const client = create('key');")), "the third tab's code sample was not revealed");

    const motion = JSON.parse(read("motion.json"));
    expect(motion.streams.some((s) => s.selector === "#log" && s.position === "prepend"), "motion.json has no #log stream: " + JSON.stringify(motion.streams));
    expect(motion.tracks.some((t) => t.selector === "#rafbox" && t.property === "opacity"), "motion.json has no #rafbox opacity track");
    expect(['"marquee-x"', '"turn"'].every((n) => motion.animations.some((a) => a.name === n)), "motion.json is missing the marquee or the turning border: " + JSON.stringify(motion.animations.map((a) => a.name)));

    // #125 — real hovers, forced focus and real presses, recorded with what they change and how fast
    const interactions = JSON.parse(read("interactions.json"));
    const effect = (label, action) => interactions.records.find((r) => r.label.startsWith(label) && r.action === action);
    const lift = effect("Lift", "hover");
    expect(lift?.changes.some((c) => c.property === "box-shadow" && c.to.includes("24px")) && lift.changes.some((c) => c.property === "transform")
      && lift.changes.some((c) => c.at === "> span" && c.property === "opacity") && lift.timing.some((t) => t.property === "box-shadow" && t.duration === "0.2s")
      && lift.script.length === 0, "interactions.json: the lift hover lost its shadow, lift, group-hover child or timing: " + JSON.stringify(lift));
    expect(effect("Ring", "focus")?.changes.some((c) => c.property === "outline-style" && c.to === "solid"), "interactions.json: the focus ring is missing: " + JSON.stringify(effect("Ring", "focus")));
    expect(effect("Press", "press")?.changes.some((c) => c.property === "transform"), "interactions.json: the press scale is missing: " + JSON.stringify(effect("Press", "press")));
    expect(effect("Script hover", "hover")?.script.length > 0, "interactions.json: the script-driven hover was not flagged: " + JSON.stringify(effect("Script hover", "hover")));

    const manifest = JSON.parse(read("assets/manifest.json"));
    const entry = (suffix) => manifest.find((e) => e.url.endsWith(suffix));
    expect(entry("/img/hero.jpg")?.role === "decorative-background" && entry("/img/avatars/jane.jpg")?.replaceWith?.initials === "JD"
      && entry("/img/logo-acme.png")?.replaceWith?.svg === "assets/svg/acme.svg" && entry("/media/clip.mp4")?.replaceWith?.autoplay === true,
      "manifest roles or stand-ins wrong: " + JSON.stringify(manifest.map((e) => [e.url.split("/").pop(), e.role])));

    expect(JSON.parse(read("tokens.json")).color?.brand?.$value === "rgb(10, 20, 30)", "tokens.json lost --brand");
    expect(JSON.parse(read("breakpoints.json")).includes("@media (min-width: 768px)"), "breakpoints.json lost the 768px breakpoint");
    expect(JSON.parse(read("fingerprint.1440.json")).width === 1440 && JSON.parse(read("fingerprint.390.json")).width === 390, "fingerprints were not taken at their widths");
    const readme = read("README.md");
    expect(readme.includes("6 states opened by clicking") && readme.includes("there are no screenshots") && readme.includes("**interactions.json**")
      && readme.includes("driven by script, not CSS"), "README.md does not reflect the run");
    expect(readme.includes("#scene (a <canvas>") && readme.includes("fallback_screenshots: true"), "README.md does not name the region with no code, or how to picture it");
  }

  // #122 — the one exception: asked for, a region with no code gets a picture, and nothing else does.
  const FALLBACK = join(OUT, "fallback");
  await mcp.call("export_page", { out_dir: FALLBACK, states: false, motion: false, interactions: false, fallback_screenshots: true });
  const fallbackDir = join(FALLBACK, "localhost");
  const fallbackFiles = existsSync(fallbackDir) ? walkFiles(fallbackDir).map((f) => relative(fallbackDir, f)) : [];
  const pictures = fallbackFiles.filter((f) => f.endsWith(".png"));
  expect(pictures.length === 1 && pictures[0].startsWith("assets/fallback/01-"), "fallback_screenshots did not write exactly one picture of the canvas: " + JSON.stringify(fallbackFiles));
  expect(existsSync(join(fallbackDir, "README.md")) && readFileSync(join(fallbackDir, "README.md"), "utf8").includes("1 fallback picture"),
    "the fallback export's README does not account for its picture");

  // #121 — verify_rebuild: the exported index.html, served, against its own export's fingerprints.
  // index.html + styles.css are all an agent is given, so a clean match is the export's proof of fidelity.
  const verified = await mcp.call("verify_rebuild", { url: `http://localhost:${PORT}/test/.export-tmp/e2e/localhost/index.html`, fingerprint_dir: dir });
  // The export carries every CSS interaction; the script-driven hover cannot be in a static export, so it
  // must be the one thing listed, under the heading that tells the agent to build it in code.
  expect(verified.includes("Layout and CSS interactions match at every width.") && verified.includes("### Driven by script in the original")
    && verified.includes('"Script hover"'), "verify_rebuild did not match layout and CSS interactions, or did not isolate the script-driven hover:\n" + verified.slice(0, 3000));

  // #104 — capture_interaction still drives the real pointer after moving onto the shared page-call helper.
  const interaction = await mcp.call("capture_interaction", { steps: [{ trigger: "#menu", action: "click" }] });
  expect(interaction.includes("### click `#menu`"), "capture_interaction failed: " + interaction.slice(0, 400));

  console.log(fails.length ? `FAIL\n${fails.join("\n")}` : "PASS — export_page wrote a code-first folder over MCP; verify_rebuild matched it to its source; capture_interaction still runs");
  process.exitCode = fails.length ? 1 : 0;
} catch (e) {
  console.error("FAIL", e);
  process.exitCode = 1;
} finally {
  mcp?.close();
  browser.close();
}
