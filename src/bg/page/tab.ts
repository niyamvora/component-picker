/**
 * Running a capture in the active tab without a click (#103, #104, #105).
 *
 * Every automatic capture needs the same two things first: a tab that can actually be scripted,
 * and `picker.js` already injected so `window.__cp` exists. Doing that once here is what keeps the
 * three bridge handlers down to the part that differs.
 */

/** `chrome://` and the Web Store reject injection; saying so beats a stack trace from executeScript. */
const INJECTABLE = /^(https?|file):/;

export async function runInActiveTab<T>(fn: (tabId: number) => Promise<T>): Promise<T> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("no active tab");
  if (!INJECTABLE.test(tab.url || "")) {
    throw new Error(`cannot capture ${tab.url ? new URL(tab.url).protocol : "this"} pages — open the site you want to capture in the active tab`);
  }
  await ensurePicker(tab.id);
  return fn(tab.id);
}

/**
 * `picker.js` in the tab, injected only when absent — injecting it a second time toggles the picker
 * off. Also called after the page export reloads or navigates back, which discards `window.__cp`.
 */
export async function ensurePicker(tabId: number) {
  const [present] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!(window as { __cp?: unknown }).__cp });
  if (!present.result) await chrome.scripting.executeScript({ target: { tabId }, files: ["picker.js"] });
}
