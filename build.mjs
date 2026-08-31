// Bundles the TypeScript sources into dist/ — the folder you load unpacked.
// Each entry is a self-contained IIFE: picker.js is injected by name, so it must not
// expect a module loader, and background.js is a service worker with no imports at runtime.
import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const version = readFileSync("VERSION", "utf8").trim();

const options = {
  // Explicit in/out: the sources live in folders, but dist stays flat because the manifest and
  // chrome.scripting.executeScript({ files: [...] }) address these by bare filename.
  entryPoints: [
    { in: "src/ui/picker.ts", out: "picker" },
    { in: "src/bg/service-worker.ts", out: "background" },
    { in: "src/ui/panel.ts", out: "panel" },
  ],
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: watch ? "inline" : false,
  minify: false, // a reviewer (and the Web Store) should be able to read what ships
  logLevel: "info",
};

mkdirSync("dist", { recursive: true });
const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
manifest.version = version; // VERSION is the single source of truth; release.sh bumps it
writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
cpSync("src/ui/panel.html", "dist/panel.html");
cpSync("src/assets/icons", "dist/icons", { recursive: true });

// Firefox build: same code, a manifest without the Chrome-only pieces. The debugger API does not
// exist there, so viewport, state, theme and screenshot sections are absent — the picker already
// degrades to "unavailable" with the reason, and the source rules still carry the media queries.
const firefox = {
  ...manifest,
  permissions: manifest.permissions.filter((p) => p !== "debugger" && p !== "sidePanel"),
  background: { scripts: ["background.js"] },
  browser_specific_settings: { gecko: { id: "component-picker@niyamvora", strict_min_version: "121.0" } },
};
delete firefox.side_panel;
mkdirSync("dist-firefox", { recursive: true });
cpSync("dist", "dist-firefox", { recursive: true });
writeFileSync("dist-firefox/manifest.json", JSON.stringify(firefox, null, 2) + "\n");
cpSync("README.md", "dist/README.md");

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching…");
} else {
  await build(options);
}
