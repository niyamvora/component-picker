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

  // Play the extension: poll /next, and once the agent has armed a pick, post a bundle back.
  (async () => {
    for (let i = 0; i < 50; i++) {
      const { pick } = await (await fetch(`http://127.0.0.1:${PORT}/next`)).json();
      if (pick) {
        await fetch(`http://127.0.0.1:${PORT}/result`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bundle: "# Component picked\nHELLO" }) });
        return;
      }
      await sleep(100);
    }
  })();

  const res = await rpc("tools/call", { name: "pick_component", arguments: {} });
  const text = res.result?.content?.[0]?.text ?? "";
  console.log(text.includes("HELLO") ? `PASS — round trip delivered the bundle` : `FAIL — got: ${JSON.stringify(res)}`);
  process.exitCode = text.includes("HELLO") ? 0 : 1;
} catch (e) {
  console.log("FAIL", e);
  process.exitCode = 1;
} finally {
  server.kill();
}
