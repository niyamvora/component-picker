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

  const ok = httpOk && wsOk && selOk && errOk;
  console.log(ok
    ? `PASS — pick over HTTP and WebSocket, capture_selector, and error propagation`
    : `FAIL — http=${httpOk} ws=${wsOk} selector=${selOk} error=${errOk}`);
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.log("FAIL", e);
  process.exitCode = 1;
} finally {
  server.kill();
}
