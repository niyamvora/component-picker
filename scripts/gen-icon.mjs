/**
 * Render `src/icon.svg` into the PNGs the manifest needs (`node scripts/gen-icon.mjs`).
 *
 * Headless Chrome is the renderer, because it is already a dependency of the test suite and the
 * alternative is pulling in an image library to draw four squares and a circle.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME ||
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const svg = readFileSync(join(ROOT, "src", "assets", "icon.svg"), "utf8");
const scratch = mkdtempSync(join(tmpdir(), "cp-icon-"));
mkdirSync(join(ROOT, "src", "assets", "icons"), { recursive: true });

for (const size of [16, 48, 128]) {
  const page = join(scratch, `${size}.html`);
  writeFileSync(page, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--default-background-color=00000000",
    `--window-size=${size},${size}`, `--screenshot=${join(ROOT, "src", "icons", `${size}.png`)}`, `file://${page}`,
  ], { stdio: "ignore" });
  console.log(`src/assets/icons/${size}.png`);
}
