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
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const PORT = Number(process.env.CP_MCP_PORT ?? 8787);
const PICK_TIMEOUT = 120_000; // a human has to click
const AUTO_TIMEOUT = 90_000;  // no human in the loop, but the debugger work is still slow

/**
 * One pending request at a time; the extension long-polls /next and posts to /result.
 *
 * The envelope carries a `req` object rather than the old boolean, because every tool past
 * `pick_component` needs parameters (which selector, which trigger, which capture id). `pick`
 * is still sent alongside it so an extension built before this change keeps working.
 */
let pending = null;   // { resolve, reject, req }
let lastCapture = ""; // so last_capture works without any interaction

/** A result from the extension, over either transport. `error` fails the waiting tool call. */
function settle(payload) {
  if (!pending) return;
  const { bundle, error } = payload;
  if (error) { pending.reject(new Error(error)); pending = null; return; }
  if (bundle === undefined) return;
  lastCapture = bundle;
  pending.resolve(bundle);
  pending = null;
}

const bridge = createServer((req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  if (req.method === "GET" && req.url === "/next") {
    const body = { req: pending?.req ?? null, pick: pending?.req?.type === "pick" };
    return res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify(body));
  }
  if (req.method === "POST" && req.url === "/result") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { settle(JSON.parse(body || "{}")); } catch { /* ignore a malformed post */ }
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
    try { settle(JSON.parse(data.toString())); } catch { /* ignore */ }
  });
  ws.on("close", () => { if (socket === ws) socket = null; });
});

/**
 * Send one request to the extension and wait for its result.
 *
 * The timeout is the only thing that separates a slow capture from a browser that is not
 * listening, so it is generous for the automatic tools and generous again for `pick`, which
 * is waiting on a person.
 */
function request(req, timeoutMs = AUTO_TIMEOUT) {
  return new Promise((resolve, reject) => {
    if (pending) return reject(new Error("a capture is already in progress"));
    const timer = setTimeout(() => {
      pending = null;
      reject(new Error(req.type === "pick"
        ? "timed out waiting for a click"
        : "timed out — is the Component Picker extension running with its MCP bridge turned on?"));
    }, timeoutMs);
    const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
    pending = { resolve: done(resolve), reject: done(reject), req };
    if (socket) try { socket.send(JSON.stringify(req)); } catch { /* extension will poll instead */ }
  });
}

const text = (t) => ({ content: [{ type: "text", text: t }] });
const server = new McpServer({ name: "component-picker", version: "1.3.0" });

server.tool("pick_component",
  "Arm the Component Picker in the user's browser and wait for them to click a component. Returns the captured bundle (HTML, resolved CSS, states, tokens, and more). Requires the Component Picker extension with its MCP bridge turned on.",
  {},
  async () => text(await request({ type: "pick" }, PICK_TIMEOUT)));

server.tool("capture_selector",
  "Capture one or more components by CSS selector on the browser's active tab — the same bundle pick_component returns, with no click and no human in the loop. Pass several selectors to get one bundle per selector in a single call. Requires the MCP bridge to be on.",
  { selectors: z.array(z.string()).min(1).describe("CSS selectors, e.g. ['header nav', '.pricing-card']"),
    all: z.boolean().optional().describe("Capture every match of each selector rather than only the first") },
  async ({ selectors, all }) => text(await request({ type: "selector", selectors, all: !!all })));

server.tool("list_captures",
  "List the captures already stored in the browser — the last ten picks plus anything saved to the library — as id, where, and a one-line description. Lets an agent consume picks the user made at the browser without re-arming anything. Pair with get_capture.",
  {},
  async () => text(await request({ type: "captures" }, 15_000)));

server.tool("get_capture",
  "Return one stored capture in full, by an id from list_captures.",
  { id: z.string().describe("An id from list_captures") },
  async ({ id }) => text(await request({ type: "capture", id }, 15_000)));

server.tool("last_capture",
  "Return the most recent capture from this session without picking again. For picks made before this session started, use list_captures.",
  {},
  async () => text(lastCapture || "No capture yet in this session — call pick_component, capture_selector, or list_captures."));

await server.connect(new StdioServerTransport());
