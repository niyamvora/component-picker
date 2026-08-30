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
