#!/usr/bin/env node
/**
 * The MCP side of Component Picker: turn "pick a component" into a tool an agent can call.
 *
 * The extension cannot host a socket, so the direction is reversed — this server runs a localhost
 * HTTP endpoint, and the extension polls it for pending requests and POSTs results back. Nothing
 * opens until the user turns the bridge on in the popup; that is the one place this extension
 * touches the network, and it is opt-in and visible.
 *
 * Run: npx component-picker-mcp   (add it to your agent's MCP config)
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const PORT = Number(process.env.CP_MCP_PORT ?? 8787);
const PICK_TIMEOUT = 120_000; // a human has to click

// One pending pick at a time; the extension long-polls /next and posts to /result.
let pending = null;   // { resolve, reject, timer }
let lastCapture = ""; // so last_capture works without any interaction

const bridge = createServer((req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  if (req.method === "GET" && req.url === "/next") {
    return res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ pick: !!pending }));
  }
  if (req.method === "POST" && req.url === "/result") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { bundle } = JSON.parse(body || "{}");
        if (bundle) { lastCapture = bundle; pending?.resolve(bundle); pending = null; }
      } catch { /* ignore a malformed post */ }
      res.writeHead(204, cors).end();
    });
    return;
  }
  res.writeHead(404, cors).end();
});
bridge.listen(PORT, "127.0.0.1");

// Real-time transport alongside the HTTP poll: the extension connects one socket; a pick request
// is pushed to it, and the bundle comes back on the same socket. Falls back to HTTP if unused.
let socket = null;
const wss = new WebSocketServer({ server: bridge });
wss.on("connection", (ws) => {
  socket = ws;
  ws.on("message", (data) => {
    try { const { bundle } = JSON.parse(data.toString()); if (bundle) { lastCapture = bundle; pending?.resolve(bundle); pending = null; } } catch { /* ignore */ }
  });
  ws.on("close", () => { if (socket === ws) socket = null; });
});

function requestPick() {
  return new Promise((resolve, reject) => {
    if (pending) return reject(new Error("a pick is already in progress"));
    const timer = setTimeout(() => { pending = null; reject(new Error("timed out waiting for a click")); }, PICK_TIMEOUT);
    pending = { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); }, timer };
    if (socket) try { socket.send(JSON.stringify({ type: "pick" })); } catch { /* extension will poll instead */ }
  });
}

const server = new McpServer({ name: "component-picker", version: "1.2.0" });

server.tool("pick_component",
  "Arm the Component Picker in the user's browser and wait for them to click a component. Returns the captured bundle (HTML, resolved CSS, states, tokens, and more). Requires the Component Picker extension with its MCP bridge turned on.",
  {},
  async () => {
    const bundle = await requestPick();
    return { content: [{ type: "text", text: bundle }] };
  });

server.tool("last_capture",
  "Return the most recent capture without picking again.", {},
  async () => ({ content: [{ type: "text", text: lastCapture || "No capture yet — call pick_component first." }] }));

await server.connect(new StdioServerTransport());
