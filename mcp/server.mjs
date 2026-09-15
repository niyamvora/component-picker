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
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const PORT = Number(process.env.CP_MCP_PORT ?? 8787);
const PICK_TIMEOUT = 120_000; // a human has to click
const AUTO_TIMEOUT = 90_000;  // no human in the loop, but the debugger work is still slow
const PAGE_TIMEOUT = 600_000; // a full-page capture is a dozen of those, one after another

/**
 * One pending request at a time; the extension long-polls /next and posts to /result.
 *
 * The envelope carries a `req` object rather than the old boolean, because every tool past
 * `pick_component` needs parameters (which selector, which trigger, which capture id). `pick`
 * is still sent alongside it so an extension built before this change keeps working.
 */
let pending = null;   // { resolve, reject, req, onPart? }
let lastCapture = ""; // so last_capture works without any interaction

/**
 * A result from the extension, over either transport. `error` fails the waiting tool call; `part`
 * is one file of a page export (#120), handed to the waiting tool as it arrives.
 */
function settle(payload) {
  if (!pending) return;
  if (payload.part) { pending.onPart?.(payload.part); return; }
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
function request(req, timeoutMs = AUTO_TIMEOUT, onPart) {
  return new Promise((resolve, reject) => {
    if (pending) return reject(new Error("a capture is already in progress"));
    let timer;
    // Re-armed by every streamed file: a long export is making progress, not hanging.
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        pending = null;
        reject(new Error(req.type === "pick"
          ? "timed out waiting for a click"
          : "timed out — is the Component Picker extension running with its MCP bridge turned on?"));
      }, timeoutMs);
    };
    arm();
    const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
    pending = { resolve: done(resolve), reject: done(reject), req, onPart: onPart && ((part) => { arm(); onPart(part); }) };
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

server.tool("capture_interaction",
  "Run a real interaction on the active tab and return a timeline of what happened. The `scroll` action scrolls an element into view and records the reveal, which is how to see what a hero captured as opacity:0 actually becomes — what appeared (including popups mounted in a portal), what moved, and the resolved timing of every transition and animation that ran. Pass several steps to capture a sequence such as hover A then hover B, which is the only way to see panel-to-panel motion. Pointer events go through the debugger, so CSS :hover applies for real. Requires the MCP bridge to be on.",
  { steps: z.array(z.object({
      trigger: z.string().describe("CSS selector for the element to act on"),
      action: z.enum(["hover", "click", "focus", "leave", "scroll"]),
    })).min(1).max(6),
    watch: z.string().optional().describe("CSS selector for what to observe; defaults to the trigger's subtree plus anything that appears") },
  async ({ steps, watch }) => text(await request({ type: "interaction", steps, watch }, PAGE_TIMEOUT)));

server.tool("capture_page",
  "Capture the whole active tab section by section — one capped bundle per top-level section, behind a table of contents. Use this to read a page you intend to rebuild; use capture_selector when you already know which element you want. Requires the MCP bridge to be on.",
  { limit: z.number().int().min(1).max(12).optional().describe("Maximum sections to capture (default 12)") },
  async ({ limit }) => text(await request({ type: "page", limit }, PAGE_TIMEOUT)));

/** Write one exported file under `root`, refusing any path that would land outside it. */
async function writePart(root, part) {
  const target = resolve(root, String(part.path ?? ""));
  if (!target.startsWith(root + sep)) throw new Error(`refusing to write outside ${root}: ${part.path}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, part.base64 !== undefined ? Buffer.from(part.base64, "base64") : (part.text ?? ""));
  return relative(root, target);
}

server.tool("export_page",
  "Export the browser's active tab as a folder another agent can rebuild the page from, code first: index.html (the whole page, uncapped), styles.css (the page's own CSS rules, verbatim), tokens.json, states/ (what every tab, disclosure and menu reveals when clicked), motion.json, assets/manifest.json (every media file with a code stand-in), assets/svg/ and a layout fingerprint per width for verify_rebuild, plus a README saying what to read first. No screenshots; binary media is written only with media: \"download\". Takes a minute or two, and changes the tab's viewport while it runs. Requires the MCP bridge to be on.",
  { out_dir: z.string().describe("Folder to write into; the export lands in <out_dir>/<host>/"),
    media: z.enum(["manifest", "download"]).optional().describe("\"manifest\" (default) describes media with stand-ins; \"download\" also writes the files"),
    states: z.boolean().optional().describe("Open tabs, disclosures and menus to record what they reveal (default true)"),
    motion: z.boolean().optional().describe("Record animation, including script-driven motion (default true)"),
    reload: z.boolean().optional().describe("Reload the tab first so every file is seen loading (default false; discards the tab's state)"),
    fallback_screenshots: z.boolean().optional().describe("Picture each <canvas> and cross-origin <iframe>, which have no code to export (default false)") },
  async ({ out_dir, fallback_screenshots, ...opts }) => {
    const root = resolve(out_dir);
    const written = [];
    let chain = Promise.resolve();
    let failure = null;
    const onPart = (part) => { chain = chain.then(() => writePart(root, part)).then((p) => { written.push(p); }, (e) => { failure ??= e; }); };
    const readme = await request({ type: "export", ...opts, fallbackScreenshots: fallback_screenshots }, PAGE_TIMEOUT, onPart);
    await chain;
    if (failure) throw failure;
    const folder = written[0] ? resolve(root, written[0].split(sep)[0]) : root;
    return text(`Wrote ${written.length} files to ${folder}\n\n${readme}`);
  });

server.tool("verify_rebuild",
  "Check a rebuilt page against an export_page folder in numbers rather than by eye: opens the rebuild's URL in a background tab, fingerprints its layout at every width the export recorded, and lists what differs — missing elements, boxes that moved or resized, and changed styles such as `h2 \"Pricing\": font-size: 48px, original 56px` — largest first. Serve the rebuild over http(s), e.g. your dev server. Requires the MCP bridge to be on.",
  { url: z.string().describe("Where the rebuild is served, e.g. http://localhost:3000/"),
    fingerprint_dir: z.string().describe("The export folder holding fingerprint.<width>.json — the <out_dir>/<host> export_page wrote") },
  async ({ url, fingerprint_dir }) => {
    const dir = resolve(fingerprint_dir);
    const names = (await readdir(dir).catch(() => [])).filter((f) => /^fingerprint\.\d+\.json$/.test(f));
    if (!names.length) throw new Error(`no fingerprint.<width>.json in ${dir} — pass the folder export_page wrote`);
    const fingerprints = await Promise.all(names.map(async (f) => JSON.parse(await readFile(resolve(dir, f), "utf8"))));
    return text(await request({ type: "verify", url, fingerprints }, PAGE_TIMEOUT));
  });

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
