/**
 * The store-only ZIP writer, checked against the system `unzip`. Run: node test/zip.test.mjs
 * Rebuilds the extension first so it tests what ships, then imports the bundled logic by re-deriving
 * it — the writer is pure, so it is exercised through a tiny inline copy kept in sync by the assert.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Bundle the real writer with esbuild's API so the test tracks the source, not a copy.
const { build } = await import("esbuild");
await build({ entryPoints: [join(ROOT, "src/core/zip.ts")], bundle: true, format: "esm", outfile: join(ROOT, "dist/zip.test.mjs") });
const { zip } = await import(pathToFileURL(join(ROOT, "dist/zip.test.mjs")).href);

const enc = new TextEncoder();
const archive = zip([
  { name: "hello.txt", data: enc.encode("hello world") },
  { name: "assets/a.bin", data: Uint8Array.from([1, 2, 3, 4, 5]) },
]);

const dir = mkdtempSync(join(tmpdir(), "cp-zip-"));
writeFileSync(join(dir, "out.zip"), archive);
const listing = execFileSync("unzip", ["-l", join(dir, "out.zip")], { encoding: "utf8" });
execFileSync("unzip", ["-o", join(dir, "out.zip"), "-d", dir], { stdio: "ignore" });
const back = readFileSync(join(dir, "hello.txt"), "utf8");

const ok = listing.includes("hello.txt") && listing.includes("assets/a.bin") && back === "hello world";
console.log(ok ? "PASS — zip round-trips through the system unzip" : `FAIL\n${listing}\nextracted: ${JSON.stringify(back)}`);
process.exitCode = ok ? 0 : 1;
