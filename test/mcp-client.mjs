// The agent's side of the bridge, for the suites that drive the extension through MCP: spawn the
// server on its own port, speak JSON-RPC over stdio, and turn the extension's bridge on to meet it.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { ROOT, sleep } from "./chrome.mjs";

/** A component-picker-mcp on `port`, initialized. `call` returns a tool's text, or the raw response when there is none. */
export async function startMcp({ port, timeout = 600_000 }) {
  if (await fetch(`http://127.0.0.1:${port}/next`).then(() => true, () => false)) {
    throw new Error(`port ${port} is already in use — a previous run may still be alive`);
  }
  const child = spawn(process.execPath, [join(ROOT, "mcp", "server.mjs")], {
    env: { ...process.env, CP_MCP_PORT: String(port) },
    stdio: ["pipe", "pipe", "inherit"],
  });
  let id = 0;
  const rpc = (method, params) => {
    const msg = { jsonrpc: "2.0", id: ++id, method, params };
    child.stdin.write(JSON.stringify(msg) + "\n");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} ${params?.name ?? ""} timed out`)), timeout);
      let buffer = "";
      const onData = (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const m = JSON.parse(line);
          if (m.id === msg.id) { clearTimeout(timer); child.stdout.off("data", onData); resolve(m); }
        }
      };
      child.stdout.on("data", onData);
    });
  };
  await sleep(500);
  await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "component-picker-tests", version: "0" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const call = async (name, args) => {
    const res = await rpc("tools/call", { name, arguments: args });
    return res.result?.content?.[0]?.text ?? JSON.stringify(res);
  };
  return { call, close: () => child.kill() };
}

/**
 * Point the extension's bridge at `port` and turn it on, with the dock hidden — it could sit over a
 * trigger the state sweep clicks. Sent from a page context: a service worker does not receive its
 * own runtime messages.
 */
export async function enableBridge(browser, port) {
  const sw = await browser.serviceWorker();
  await browser.evalIn(sw, `(async () => {
    await chrome.storage.local.set({ options: { dockEverywhere: false }, bridgePort: ${port} });
    const [tab] = await chrome.tabs.query({});
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => chrome.runtime.sendMessage({ type: "bridge", on: true }) });
  })()`);
  await sleep(1500);
}
