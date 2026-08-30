// Bundles the TypeScript sources into dist/ — the folder you load unpacked.
// Each entry is a self-contained IIFE: picker.js is injected by name, so it must not
// expect a module loader, and background.js is a service worker with no imports at runtime.
import { build, context } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const watch = process.argv.includes("--watch");
const version = readFileSync("VERSION", "utf8").trim();

const options = {
  entryPoints: ["src/picker.ts", "src/background.ts"],
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
cpSync("README.md", "dist/README.md");

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching…");
} else {
  await build(options);
}
