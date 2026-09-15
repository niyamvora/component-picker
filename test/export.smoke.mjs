// Acceptance run of export_page + verify_rebuild on a live site (#123). Not part of `npm test`: a live
// page changes under you and needs the network. Downloads media, because fonts loaded cross-origin
// from the site would be refused on localhost and throw every text metric off in verify_rebuild.
// Run: node test/export.smoke.mjs https://resend.com/ [--verify-only]
// --verify-only re-checks the export already on disk, so changes to verify_rebuild iterate in seconds.
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { launch, ROOT, sleep } from "./chrome.mjs";
import { enableBridge, startMcp } from "./mcp-client.mjs";

const url = process.argv[2];
const verifyOnly = process.argv.includes("--verify-only");
if (!url) {
  console.error("usage: node test/export.smoke.mjs <url> [--verify-only]");
  process.exit(2);
}
const PORT = 8767, CDP = 9335, BRIDGE_PORT = 8798;
const OUT = join(ROOT, "test", ".export-tmp", "smoke");
const host = new URL(url).hostname;
const dir = join(OUT, host);
if (!verifyOnly) rmSync(OUT, { recursive: true, force: true });

const walk = (d) => readdirSync(d).flatMap((f) => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
const browser = await launch({ port: PORT, cdp: CDP, url, hosts: ["<all_urls>"] });
let mcp;
try {
  mcp = await startMcp({ port: BRIDGE_PORT });
  const page = await browser.connect((await browser.targets()).find((t) => t.type === "page" && t.url.startsWith(new URL(url).origin)));
  for (let i = 0; i < 100 && (await browser.evalIn(page, "document.readyState")) !== "complete"; i++) await sleep(200);
  await sleep(3000); // let the site hydrate and start its own motion
  page.close();
  await enableBridge(browser, BRIDGE_PORT);

  if (!verifyOnly) {
    const started = Date.now();
    const exported = await mcp.call("export_page", { out_dir: OUT, media: "download" });
    console.log(`export_page took ${Math.round((Date.now() - started) / 1000)}s\n${exported.split("\n").slice(0, 40).join("\n")}\n`);
  }
  if (!existsSync(dir)) throw new Error(`nothing was written to ${dir}`);

  const read = (p) => readFileSync(join(dir, p), "utf8");
  const files = walk(dir).map((f) => relative(dir, f));
  const manifest = JSON.parse(read("assets/manifest.json"));
  const states = JSON.parse(read("states/index.json"));
  const motion = JSON.parse(read("motion.json"));
  const css = read("styles.css");
  const roles = manifest.reduce((acc, e) => ({ ...acc, [e.role]: (acc[e.role] ?? 0) + 1 }), {});
  console.log(`files ${files.length} · styles.css ${Math.round(css.length / 1024)} KB · states ${states.length} · ` +
    `motion: ${motion.animations.length} animations, ${motion.tracks.length} tracks, ${motion.streams.length} streams · roles ${JSON.stringify(roles)}`);
  console.log(`states: ${states.map((s) => s.label).join(" | ")}\n`);

  const checks = [
    ["no screenshots or fallback pictures", !files.some((f) => f.startsWith("assets/fallback/"))],
    ["every file the manifest downloaded exists", manifest.filter((e) => e.local).every((e) => files.includes(e.local))],
  ];
  if (host === "resend.com") {
    checks.push(
      ["styles.css has @property --angle and @keyframes rotate", css.includes("@property --angle") && css.includes("@keyframes rotate")],
      ["states include the framework code tabs and the header menus", ["Next.js", "Remix", "Features", "Company"].every((l) => states.some((s) => s.label.includes(l)))],
      ["motion.json has the scroll-x marquee", motion.animations.some((a) => a.name.includes("scroll-x"))],
      ["motion.json has a script-driven stream or track (the API log panel)", motion.streams.length > 0 || motion.tracks.length > 0],
      ["manifest lists 5 videos, including the runtime-only one", (roles.video ?? 0) >= 5 && manifest.some((e) => e.url.includes("3d-integrate-morning"))],
      ["manifest lists 8 fonts", (roles.font ?? 0) >= 8],
      ["assets/svg has customer logos named by aria-label", ["supabase", "raycast"].every((n) => files.some((f) => f.startsWith(`assets/svg/${n}`)))],
    );
  }

  const report = await mcp.call("verify_rebuild", { url: `http://localhost:${PORT}/test/.export-tmp/smoke/${host}/index.html`, fingerprint_dir: dir });
  console.log(report.split("\n").slice(0, 60).join("\n"));
  checks.push(["verify_rebuild: the export matches its source at every width", report.includes("matches the original at every width")]);

  console.log(`\n${checks.map(([name, ok]) => `${ok ? "PASS" : "FAIL"}  ${name}`).join("\n")}`);
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
} catch (e) {
  console.error("FAIL", e);
  process.exitCode = 1;
} finally {
  mcp?.close();
  browser.close();
}
