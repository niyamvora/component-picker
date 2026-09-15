/**
 * `export_page`: the page as a folder another agent can rebuild it from, code first (#120).
 *
 * The Markdown bundle suits one component and a clipboard. A page fits neither: resend.com is
 * 12,320px tall and a bundle caps at 180 KB. So the export writes files, and runs as one debugger
 * session in the service worker, calling into the page one step at a time:
 *
 *   1. motion  — record script-driven motion while jumping top to bottom (which also loads lazy
 *                media and fires reveals), then idle
 *   2. states  — open every tab, disclosure and menu with the real pointer, record, put it back
 *   3. styles  — the used CSS, with any stylesheet the page could not read fetched and folded in
 *   4. media   — the manifest, SVG files and stand-ins; binary bytes only when asked for
 *   5. markup  — index.html, its URLs pointed at whatever was written locally
 *   6. layout  — a fingerprint per width, for verify_rebuild
 *   7. README  — written last, from what actually ran
 *
 * Nothing is screenshotted (#122).
 */

import { buildManifest, type AssetRef, type ManifestEntry } from "../core/assets-inventory";
import { filename } from "../core/assets";
import { exportReadme } from "../core/export-readme";
import type { OutlineItem, PageInfo, ScrollInfo } from "../core/export-page";
import type { Fingerprint } from "../core/fingerprint";
import { slug, substitute, type SvgFile, type VideoFacts } from "../core/media-code";
import type { MotionRecording } from "../core/motion-rec";
import type { StateRecord, Trigger, Undo } from "../core/state-sweep";
import type { SheetText, UsedCss } from "../core/used-css";
import { paletteFromBytes } from "./decode";
import { recordNetwork, type NetworkLog } from "./network";
import { callPage } from "./page-call";
import { ensurePicker, runInActiveTab } from "./tab";

export interface ExportOptions {
  media?: "manifest" | "download";
  states?: boolean;
  motion?: boolean;
  /** Reload first, so the network log sees every file from the start. Off by default: it discards the tab's state. */
  reload?: boolean;
  widths?: number[];
}
/** One file of the export, relative to the output folder. */
export interface ExportFile { path: string; text?: string; base64?: string }

type Target = chrome.debugger.Debuggee;
type PageCall = <T>(path: string, ...args: unknown[]) => Promise<T>;

const DEFAULT_WIDTHS = [1440, 768, 390];
const HEIGHTS: Record<number, number> = { 1440: 900, 768: 1024, 390: 844 };
const IDLE_MS = 3000;
const SCROLL_STEP_MS = 250;
const MAX_SCROLL_STEPS = 200;
const SETTLE_MIN_MS = 150;
const SETTLE_MAX_MS = 1500;
const MAX_BODY_BYTES = 50_000_000;
/** Roles whose stand-in is built from the image's colours. */
const COLOUR_ROLES = new Set(["decorative-background", "texture", "avatar", "content-image", "poster", "social-image"]);

const send = <T = unknown>(target: Target, method: string, params?: object) => chrome.debugger.sendCommand(target, method, params) as Promise<T>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The device metrics `verify_rebuild` uses too, so the two fingerprints are comparable. */
export async function emulateWidth(target: Target, width: number) {
  await send(target, "Emulation.setDeviceMetricsOverride", { width, height: HEIGHTS[width] ?? 900, deviceScaleFactor: 1, mobile: width <= 768 });
}

async function click(target: Target, { x, y }: { x: number; y: number }) {
  await send(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
  const button = { x, y, button: "left", clickCount: 1 };
  await send(target, "Input.dispatchMouseEvent", { type: "mousePressed", ...button, buttons: 1 });
  await send(target, "Input.dispatchMouseEvent", { type: "mouseReleased", ...button, buttons: 0 });
}

async function pressEscape(target: Target) {
  const key = { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 };
  await send(target, "Input.dispatchKeyEvent", { type: "keyDown", ...key });
  await send(target, "Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

export async function waitForLoad(tabId: number) {
  for (let i = 0; i < 300; i++) {
    if ((await chrome.tabs.get(tabId)).status === "complete") return;
    await sleep(100);
  }
  throw new Error("the tab did not finish loading within 30s");
}

const samePage = (a = "", b = "") => {
  try {
    const [x, y] = [new URL(a), new URL(b)];
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch { return a === b; }
};

async function recordMotion(page: PageCall): Promise<MotionRecording | null> {
  await page("rebuild.motion.start");
  let info = await page<ScrollInfo>("rebuild.scrollTo", 0);
  const step = Math.max(200, Math.round(info.viewport * 0.8));
  for (let y = step, n = 0; y < info.height && n < MAX_SCROLL_STEPS; y += step, n++) {
    info = await page<ScrollInfo>("rebuild.scrollTo", y);
    await sleep(SCROLL_STEP_MS);
  }
  await page("rebuild.scrollTo", 0);
  await sleep(IDLE_MS);
  return page<MotionRecording | null>("rebuild.motion.stop");
}

async function sweepStates(tabId: number, target: Target, page: PageCall, notes: string[]): Promise<StateRecord[]> {
  const records: StateRecord[] = [];
  const home = (await chrome.tabs.get(tabId)).url;
  const settle = async () => {
    const start = Date.now();
    await sleep(SETTLE_MIN_MS);
    while (Date.now() - start < SETTLE_MAX_MS && await page<boolean>("rebuild.sweep.busy")) await sleep(50);
  };
  const triggers = await page<Trigger[]>("rebuild.sweep.discover");
  try {
    for (const t of triggers) {
      try {
        await click(target, await page<{ x: number; y: number }>("rebuild.sweep.begin", t.index));
        await settle();
        if (!samePage((await chrome.tabs.get(tabId)).url, home)) {
          notes.push(`Clicking "${t.label}" (${t.selector}) left the page, so the state sweep stopped there.`);
          await chrome.tabs.goBack(tabId);
          await sleep(300);
          await waitForLoad(tabId);
          await ensurePicker(tabId);
          return records;
        }
        const record = await page<StateRecord | null>("rebuild.sweep.end");
        if (record) records.push(record);
        const undo = await page<Undo>("rebuild.sweep.restore");
        if (undo === "escape") await pressEscape(target);
        else if (undo) await click(target, undo);
        await settle();
      } catch (e) {
        notes.push(`The state behind "${t.label}" was skipped: ${message(e)}`);
      }
    }
  } finally {
    await page("rebuild.sweep.clear").catch(() => {});
    // Park the pointer, or the last trigger stays hovered for every later step.
    await send(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 }).catch(() => {});
  }
  return records;
}

/** A readable local name. Next.js serves images as `/_next/image?url=/static/x.png`, so unwrap that. */
const localName = (url: string, taken: Set<string>) => {
  const inner = new URL(url).searchParams.get("url");
  return filename(inner ? new URL(inner, url).href : url, taken);
};

async function writeMedia(manifest: ManifestEntry[], ctx: {
  svgs: SvgFile[]; videos: Record<string, VideoFacts>; origin: string; media: "manifest" | "download";
  net: NetworkLog; put: (f: ExportFile) => Promise<void>; notes: string[];
}): Promise<Record<string, string>> {
  const urlMap: Record<string, string> = {};
  const svgNames = new Set(ctx.svgs.map((s) => s.name));
  const mediaNames = new Set<string>();
  const failed: string[] = [];
  for (const e of manifest) {
    const isSvg = /svg/.test(e.mime ?? "") || /\.svg([?#]|$)/i.test(e.url);
    // SVG is code, so it is written whatever the media mode; a colour stand-in needs the pixels.
    const wanted = isSvg || ctx.media === "download" || COLOUR_ROLES.has(e.role);
    const bytes = wanted && (e.bytes ?? 0) <= MAX_BODY_BYTES ? await ctx.net.body(e.url) : null;
    if (!bytes && (isSvg || ctx.media === "download")) failed.push(e.url);
    if (bytes && isSvg) {
      const base = slug(e.alt || decodeURIComponent(new URL(e.url).pathname.split("/").pop() ?? "").replace(/\.svg$/i, "")) || "image";
      let name = base;
      for (let n = 2; svgNames.has(name); n++) name = `${base}-${n}`;
      svgNames.add(name);
      e.local = `assets/svg/${name}.svg`;
      await ctx.put({ path: e.local, text: new TextDecoder().decode(bytes) });
    } else if (bytes && ctx.media === "download") {
      e.local = `assets/media/${localName(e.url, mediaNames)}`;
      await ctx.put({ path: e.local, base64: toBase64(bytes) });
    }
    if (bytes && e.bytes === undefined) e.bytes = bytes.length;
    const palette = bytes && !isSvg && COLOUR_ROLES.has(e.role) ? await paletteFromBytes(bytes) : null;
    e.replaceWith = substitute(e, { palette, video: ctx.videos[e.url], svgs: ctx.svgs, origin: ctx.origin });
    if (e.local) for (const u of [e.url, ...(e.variants ?? [])]) urlMap[u] = e.local;
  }
  if (failed.length) {
    ctx.notes.push(`${failed.length} file(s) could not be fetched, so the manifest lists them without a local copy: ` +
      `${failed.slice(0, 5).join(", ")}${failed.length > 5 ? `, and ${failed.length - 5} more` : ""}.`);
  }
  return urlMap;
}

/**
 * Export the active tab. Every file goes through `emit` as soon as it exists, prefixed with the
 * site's host, so the MCP server can write the folder as it arrives rather than holding a page's
 * worth of media in one message. Returns the README.
 */
export async function exportPage(opts: ExportOptions, emit: (file: ExportFile) => Promise<void>): Promise<string> {
  return runInActiveTab(async (tabId) => {
    const target = { tabId };
    const tab = await chrome.tabs.get(tabId);
    const host = (new URL(tab.url ?? "about:blank").hostname || "page").replace(/[^\w.-]/g, "_");
    try { await chrome.debugger.attach(target, "1.3"); }
    catch (e) { throw new Error(`could not attach the debugger to this tab — close DevTools on it and try again (${message(e)})`); }
    const net = await recordNetwork(target);
    const written: string[] = [];
    const put = async (file: ExportFile) => { written.push(file.path); await emit({ ...file, path: `${host}/${file.path}` }); };
    const page: PageCall = (path, ...args) => callPage(tabId, path, args);
    const notes: string[] = [];
    const widths = opts.widths?.length ? opts.widths : DEFAULT_WIDTHS;
    const media = opts.media ?? "manifest";
    try {
      if (opts.reload) {
        await send(target, "Page.reload", { ignoreCache: false });
        await sleep(300);
        await waitForLoad(tabId);
        await ensurePicker(tabId);
        await sleep(1000);
      }
      await emulateWidth(target, widths[0]);
      await sleep(400);

      const motion = opts.motion === false ? null : await recordMotion(page);
      const states = opts.states === false ? null : await sweepStates(tabId, target, page, notes);
      await page("rebuild.scrollTo", 0);

      let css = await page<UsedCss>("rebuild.usedCss");
      if (css.unreadable.length) {
        const extra: SheetText[] = [];
        for (const href of css.unreadable) {
          const bytes = await net.body(href);
          if (bytes) extra.push({ href, text: new TextDecoder().decode(bytes) });
        }
        if (extra.length) css = await page<UsedCss>("rebuild.usedCss", null, extra);
        if (css.unreadable.length) notes.push(`${css.unreadable.length} stylesheet(s) could not be read, even through the debugger: ${css.unreadable.join(", ")}`);
      }

      const info = await page<PageInfo>("rebuild.pageInfo");
      const svgs = await page<SvgFile[]>("rebuild.inlineSvgs");
      const videos = await page<Record<string, VideoFacts>>("rebuild.videoFacts");
      const manifest = buildManifest(await page<AssetRef[]>("rebuild.assetRefs"), net.entries(), info.vw, info.vh);
      const urlMap = await writeMedia(manifest, { svgs, videos, origin: info.origin, media, net, put, notes });
      for (const s of svgs) await put({ path: s.path, text: `${s.markup}\n` });

      const dom = await page<{ html: string; elements: number }>("rebuild.exportDomMapped", urlMap);
      let styles = css.css;
      for (const [url, local] of Object.entries(urlMap)) styles = styles.split(`url("${url}")`).join(`url("${local}")`);
      await put({ path: "index.html", text: dom.html });
      await put({ path: "styles.css", text: styles });
      await put({ path: "breakpoints.json", text: json(css.breakpoints) });
      await put({ path: "tokens.json", text: json(await page("rebuild.tokens")) });
      await put({ path: "assets/manifest.json", text: json(manifest) });
      if (motion) await put({ path: "motion.json", text: json(motion) });

      const stateFiles = states?.map((r, n) => ({ file: `states/${String(n + 1).padStart(2, "0")}-${slug(r.label) || "state"}.json`, label: r.label, kind: r.kind })) ?? null;
      if (states && stateFiles) {
        for (const [n, r] of states.entries()) await put({ path: stateFiles[n].file, text: json(r) });
        await put({ path: "states/index.json", text: json(stateFiles.map((f, n) => ({ ...f, trigger: states[n].trigger, revealed: states[n].revealed.length, added: states[n].added.length }))) });
      }

      for (const width of widths) {
        await emulateWidth(target, width);
        await sleep(500);
        const fp = await page<Fingerprint>("rebuild.fingerprint");
        // Record the device metrics that were emulated, which verify_rebuild must re-create. The page's
        // own innerWidth can differ: on a mobile viewport, content wider than the device widens the
        // layout viewport (a 400px image at 390 reads as 408), and emulating that would test a different device.
        await put({ path: `fingerprint.${width}.json`, text: json({ ...fp, width, height: HEIGHTS[width] ?? 900, layoutWidth: fp.width }) });
      }
      await send(target, "Emulation.clearDeviceMetricsOverride");

      const readme = exportReadme({
        title: info.title, url: info.url, at: new Date().toISOString(), widths, media, elements: dom.elements,
        css: { kept: css.kept, total: css.total, breakpoints: css.breakpoints }, manifest, svgs: svgs.length,
        states: stateFiles, motion: motion && { tracks: motion.tracks.length, streams: motion.streams.length, animations: motion.animations.length },
        outline: await page<OutlineItem[]>("rebuild.outline"), notes, files: written,
      });
      await put({ path: "README.md", text: readme });
      return readme;
    } finally {
      net.stop();
      await send(target, "Emulation.clearDeviceMetricsOverride").catch(() => {});
      await chrome.debugger.detach(target).catch(() => {});
    }
  });
}
