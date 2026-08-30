/**
 * Build `src/icons.json`: a hash of every icon's path geometry → its name.
 *
 * Dev-time only, run by hand when the icon sets move (`node scripts/gen-icons.mjs`). The packages
 * are fetched into a scratch directory rather than added as dependencies — the extension ships the
 * generated JSON, not the sets.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The geometry only: what makes two SVGs the same picture regardless of formatting. */
export function iconHash(shapes) {
  const text = shapes.map((s) => s.replace(/\s+/g, " ").trim()).join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const shapesOf = (svg) => [
  ...[...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]),
  ...[...svg.matchAll(/\spoints="([^"]+)"/g)].map((m) => m[1]),
  ...[...svg.matchAll(/<circle[^>]*\scx="([^"]+)"[^>]*\scy="([^"]+)"[^>]*\sr="([^"]+)"/g)].map((m) => `c${m[1]},${m[2]},${m[3]}`),
];

const SETS = [
  { pkg: "lucide-static", prefix: "lucide", dir: "icons", filter: (f) => f.endsWith(".svg") },
  { pkg: "@radix-ui/react-icons", prefix: "radix", dir: "dist", filter: () => false }, // JSX, not SVG files
];

const scratch = mkdtempSync(join(tmpdir(), "cp-icons-"));
writeFileSync(join(scratch, "package.json"), '{"name":"scratch","private":true}');
const out = {};
let count = 0;

for (const set of SETS) {
  try {
    execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund", set.pkg], { cwd: scratch, stdio: "ignore" });
  } catch {
    console.warn(`skipped ${set.pkg} (install failed)`);
    continue;
  }
  const dir = join(scratch, "node_modules", set.pkg, set.dir);
  let files;
  try { files = readdirSync(dir).filter(set.filter); } catch { continue; }
  for (const file of files) {
    const hash = iconHash(shapesOf(readFileSync(join(dir, file), "utf8")));
    // First name wins: aliases of the same picture are the same icon, and the shorter file name
    // sorts first, which is usually the canonical one.
    out[hash] ??= `${set.prefix}:${basename(file, ".svg")}`;
    count++;
  }
}

writeFileSync(join(ROOT, "src", "icons.json"), JSON.stringify(out));
console.log(`${Object.keys(out).length} distinct icons from ${count} files → src/icons.json`);
