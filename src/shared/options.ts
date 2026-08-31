/**
 * What a capture includes, shared by the popup (which writes it), the service worker (which reads
 * the viewport list) and the extraction engine (which reads the rest).
 */

import type { Options } from "./types";

export const DEFAULT_OPTIONS: Options = {
  screenshots: true,
  fontFace: false,
  js: true,
  states: true,
  themes: true,
  tokensJson: false,
  tailwind: false,
  jsx: false,
  a11y: true,
  fast: false,
  extraMedia: false,
  vue: false,
  svelte: false,
  htmlCss: false,
  styled: false,
  cssModules: false,
  viewports: [
    { name: "mobile", width: 390, height: 844, dpr: 3, mobile: true },
    { name: "tablet", width: 768, height: 1024, dpr: 2, mobile: true },
  ],
};

/**
 * Stored options, with anything missing filled in — a stored object written by an older version
 * stays valid, it just will not carry keys added since.
 *
 * `null` when there is no extension storage to read: the engine also runs in a plain page, and
 * there the in-memory options are the only ones there are, so they must not be overwritten.
 */
export async function loadOptions(): Promise<Options | null> {
  try {
    const { options } = await chrome.storage.local.get("options");
    return { ...DEFAULT_OPTIONS, ...(options as Partial<Options> | undefined) };
  } catch {
    return null;
  }
}

/**
 * The live options for the current capture. One mutable object so the picker can hand it out as
 * `window.__cp.opts`, the popup can drive it from storage, and a capture can read it without
 * threading it through every function.
 */
export const options: Options = { ...DEFAULT_OPTIONS };

/** Refresh `options` from storage — called before each capture, so the popup takes effect at once. */
export async function refreshOptions() {
  const stored = await loadOptions();
  if (stored) Object.assign(options, stored);
}
