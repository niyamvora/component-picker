/**
 * The side panel: what the capture would look like if you rebuilt it from the bundle alone.
 *
 * The HTML and CSS are rendered in a sandboxed iframe with nothing else on the page — so what you
 * see is exactly what the bundle carries. Anything that only looks right because the real site's
 * stylesheet was still loaded shows up here as wrong, which is the entire point.
 */

import type { Preview } from "./types";

const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;

let preview: Preview | null = null;

function render() {
  const stage = $("#stage");
  stage.textContent = "";
  if (!preview) return;
  const width = Number($<HTMLSelectElement>("#width").value);
  const frame = document.createElement("iframe");
  // Same-origin is never granted: the captured markup is a stranger's, and it renders with no
  // script execution at all.
  frame.setAttribute("sandbox", "");
  frame.style.width = width ? `${width}px` : "100%";
  frame.style.height = `${Math.min(Math.max(preview.height + 40, 120), 900)}px`;
  frame.srcdoc = `<!doctype html><meta charset="utf-8">${preview.fontLinks.map((h) => `<link rel="stylesheet" href="${h}">`).join("")}` +
    `<style>body{margin:8px;font:14px/1.4 system-ui}\n${preview.css}</style>${preview.html}`;
  stage.append(frame);

  const shot = $<HTMLImageElement>("#shot");
  shot.hidden = !preview.shot;
  if (preview.shot) shot.src = `data:image/png;base64,${preview.shot}`;
}

$("#width").addEventListener("change", render);
$("#copy").addEventListener("click", async () => {
  if (!preview) return;
  await navigator.clipboard.writeText(preview.bundle);
  $("#copy").textContent = "Copied";
  setTimeout(() => ($("#copy").textContent = "Copy bundle"), 1500);
});

chrome.runtime.onMessage.addListener((msg: { type: string; preview?: Preview }) => {
  if (msg.type !== "preview" || !msg.preview) return;
  preview = msg.preview;
  render();
});

// A panel opened after a capture would otherwise be blank until the next one.
void chrome.storage.local.get("preview").then(({ preview: stored }) => {
  if (stored && !preview) { preview = stored as Preview; render(); }
});
