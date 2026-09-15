/**
 * What the tab actually downloaded while the export's debugger session watched (#118).
 *
 * The DOM says what references a file; this says what loaded — including a stylesheet the page
 * cannot read (cross-origin, no CORS) and media a script requested without leaving a trace in the
 * markup. `Network.getResponseBody` hands back the exact bytes the page received, which also
 * sidesteps CORS; the extension's own `fetch` (it holds `<all_urls>`) covers anything that loaded
 * before recording began.
 */

import type { NetEntry } from "../core/assets-inventory";

const KEEP = new Set(["Image", "Media", "Font", "Stylesheet"]);

interface Recorded extends NetEntry { requestId: string; status: number }

export interface NetworkLog {
  entries: () => NetEntry[];
  /** The file's bytes, from the debugger's buffer or a fresh fetch; `null` when neither works. */
  body: (url: string) => Promise<Uint8Array | null>;
  stop: () => void;
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function recordNetwork(target: chrome.debugger.Debuggee): Promise<NetworkLog> {
  const byId = new Map<string, Recorded>();
  const listener = (source: chrome.debugger.Debuggee, method: string, params?: object) => {
    if (source.tabId !== target.tabId) return;
    const p = params as { requestId: string; type?: string; encodedDataLength?: number; response?: { url: string; mimeType: string; status: number } };
    if (method === "Network.responseReceived" && p.type && KEEP.has(p.type) && p.response) {
      byId.set(p.requestId, { requestId: p.requestId, url: p.response.url, type: p.type, mime: p.response.mimeType, bytes: 0, status: p.response.status });
    } else if (method === "Network.loadingFinished") {
      const e = byId.get(p.requestId);
      if (e) e.bytes = p.encodedDataLength ?? 0;
    }
  };
  chrome.debugger.onEvent.addListener(listener);
  // Generous buffers so a hero video's body is still there when the export asks for it.
  await chrome.debugger.sendCommand(target, "Network.enable", { maxTotalBufferSize: 200_000_000, maxResourceBufferSize: 50_000_000 });

  return {
    entries: () => [...byId.values()].filter((e) => e.status < 400).map(({ url, type, mime, bytes }) => ({ url, type, mime, bytes })),
    body: async (url) => {
      const e = [...byId.values()].find((x) => x.url === url && x.status < 400);
      if (e) {
        try {
          const r = await chrome.debugger.sendCommand(target, "Network.getResponseBody", { requestId: e.requestId }) as { body: string; base64Encoded: boolean };
          return r.base64Encoded ? fromBase64(r.body) : new TextEncoder().encode(r.body);
        } catch { /* evicted, or a ranged media response the buffer never held */ }
      }
      try {
        const res = await fetch(url, { credentials: "include" });
        if (res.ok) return new Uint8Array(await res.arrayBuffer());
      } catch { /* offline or refused */ }
      return null;
    },
    stop: () => chrome.debugger.onEvent.removeListener(listener),
  };
}
