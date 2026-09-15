/**
 * The bridge round trip, without a browser: start the server, play the extension's polling side
 * with a plain fetch loop, and confirm a `pick_component` call comes back with the bundle the
 * "extension" posts. Run: node mcp/test.mjs
 */
import { spawn } from "node:child_process";

const PORT = 8799;
const server = spawn(process.execPath, [new URL("server.mjs", import.meta.url).pathname], {
  env: { ...process.env, CP_MCP_PORT: String(PORT) },
  stdio: ["pipe", "pipe", "inherit"],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let id = 0;
const rpc = (method, params) => {
  const msg = { jsonrpc: "2.0", id: ++id, method, params };
  server.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((resolve) => {
    const onData = (buf) => {
      for (const line of buf.toString().split("\n")) {
        if (!line.trim()) continue;
        const m = JSON.parse(line);
        if (m.id === msg.id) { server.stdout.off("data", onData); resolve(m); }
      }
    };
    server.stdout.on("data", onData);
  });
};

try {
  await sleep(500);
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  /** Play the extension: poll /next, and answer whatever request is waiting. */
  const respond = (reply) => (async () => {
    for (let i = 0; i < 50; i++) {
      const { req } = await (await fetch(`http://127.0.0.1:${PORT}/next`)).json();
      if (req) {
        await fetch(`http://127.0.0.1:${PORT}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reply(req)) });
        return;
      }
      await sleep(100);
    }
  })();

  respond(() => ({ bundle: "# Component picked\nHELLO" }));
  const res = await rpc("tools/call", { name: "pick_component", arguments: {} });
  const text = res.result?.content?.[0]?.text ?? "";
  const httpOk = text.includes("HELLO");

  // #103 — capture_selector carries its selectors through the envelope, and needs no click.
  let sawReq = null;
  respond((req) => { sawReq = req; return { bundle: `# Captured ${req.selectors.join(", ")}\nSELOK` }; });
  const selRes = await rpc("tools/call", { name: "capture_selector", arguments: { selectors: ["header", ".card"] } });
  const selOk = (selRes.result?.content?.[0]?.text ?? "").includes("SELOK")
    && sawReq?.type === "selector" && sawReq.selectors.length === 2;

  // An error from the extension must fail the tool call rather than hang until the timeout.
  respond(() => ({ error: "no element matched: .nope" }));
  const errRes = await rpc("tools/call", { name: "capture_selector", arguments: { selectors: [".nope"] } });
  const errOk = JSON.stringify(errRes).includes("no element matched");

  // #67 — the same round trip over the WebSocket transport.
  const { WebSocket } = await import("ws");
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
  // Register the responder BEFORE requesting the pick, or the pushed "pick" message is missed.
  ws.on("message", () => ws.send(JSON.stringify({ bundle: "# via WS\nWSHELLO" })));
  await new Promise((r) => setTimeout(r, 100));
  const wsRes = await rpc("tools/call", { name: "pick_component", arguments: {} });
  ws.close();
  const wsOk = (wsRes.result?.content?.[0]?.text ?? "").includes("WSHELLO");

  // #120 — export_page: streamed files land under out_dir as they arrive, bytes intact, and a path
  // that would escape out_dir fails the call without writing anything.
  const { mkdtempSync, readFileSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  /** Play the extension for a streaming request: post each payload in order. */
  const stream = (payloads) => (async () => {
    for (let i = 0; i < 50; i++) {
      const { req } = await (await fetch(`http://127.0.0.1:${PORT}/next`)).json();
      if (req) {
        for (const p of payloads(req)) {
          await fetch(`http://127.0.0.1:${PORT}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
        }
        return;
      }
      await sleep(100);
    }
  })();
  const out = mkdtempSync(join(tmpdir(), "cp-export-"));
  let exportReq = null;
  stream((req) => { exportReq = req; return [
    { part: { path: "demo.example/index.html", text: "<!doctype html>" } },
    { part: { path: "demo.example/assets/media/a.bin", base64: Buffer.from([1, 2, 3]).toString("base64") } },
    { bundle: "# Rebuild export: Demo" },
  ]; });
  const exp = await rpc("tools/call", { name: "export_page", arguments: { out_dir: out, media: "download", states: false } });
  const expText = exp.result?.content?.[0]?.text ?? "";
  const exportOk = expText.startsWith(`Wrote 2 files to ${join(out, "demo.example")}`) && expText.includes("# Rebuild export: Demo")
    && readFileSync(join(out, "demo.example/index.html"), "utf8") === "<!doctype html>"
    && readFileSync(join(out, "demo.example/assets/media/a.bin")).equals(Buffer.from([1, 2, 3]))
    && exportReq?.type === "export" && exportReq.media === "download" && exportReq.states === false && !("out_dir" in exportReq);
  const jail = mkdtempSync(join(tmpdir(), "cp-jail-"));
  stream(() => [{ part: { path: "../escaped.txt", text: "x" } }, { bundle: "done" }]);
  const bad = await rpc("tools/call", { name: "export_page", arguments: { out_dir: join(jail, "inner") } });
  const jailOk = JSON.stringify(bad).includes("refusing to write outside") && !existsSync(join(jail, "escaped.txt"));

  // #121 — verify_rebuild hands every fingerprint.<width>.json in the folder to the extension, and
  // a folder without any fails with a message that says what to pass instead.
  const { writeFileSync } = await import("node:fs");
  const fpDir = mkdtempSync(join(tmpdir(), "cp-fp-"));
  writeFileSync(join(fpDir, "fingerprint.1440.json"), JSON.stringify({ url: "x", width: 1440, height: 900, nodes: [] }));
  writeFileSync(join(fpDir, "fingerprint.390.json"), JSON.stringify({ url: "x", width: 390, height: 844, nodes: [] }));
  writeFileSync(join(fpDir, "README.md"), "not a fingerprint");
  let verifyReq = null;
  respond((req) => { verifyReq = req; return { bundle: "# Rebuild check: http://localhost:3000/\n\nThe rebuild matches the original at every width." }; });
  const ver = await rpc("tools/call", { name: "verify_rebuild", arguments: { url: "http://localhost:3000/", fingerprint_dir: fpDir } });
  const verifyOk = (ver.result?.content?.[0]?.text ?? "").includes("# Rebuild check") && verifyReq?.type === "verify"
    && verifyReq.url === "http://localhost:3000/" && verifyReq.fingerprints.map((f) => f.width).sort((a, b) => a - b).join() === "390,1440";
  const none = await rpc("tools/call", { name: "verify_rebuild", arguments: { url: "http://localhost:3000/", fingerprint_dir: mkdtempSync(join(tmpdir(), "cp-nofp-")) } });
  const noneOk = JSON.stringify(none).includes("no fingerprint.<width>.json");

  const ok = httpOk && wsOk && selOk && errOk && exportOk && jailOk && verifyOk && noneOk;
  console.log(ok
    ? `PASS — pick over HTTP and WebSocket, capture_selector, error propagation, export_page streaming and its path guard, verify_rebuild`
    : `FAIL — http=${httpOk} ws=${wsOk} selector=${selOk} error=${errOk} export=${exportOk} jail=${jailOk} verify=${verifyOk} none=${noneOk}\n${expText.slice(0, 300)}\n${JSON.stringify(bad).slice(0, 300)}`);
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.log("FAIL", e);
  process.exitCode = 1;
} finally {
  server.kill();
}
