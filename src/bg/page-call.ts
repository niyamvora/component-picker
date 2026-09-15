/**
 * One call into the page's `window.__cp`, from the service worker (#104, #120).
 *
 * The interaction runner and the page export both drive the page one step at a time — the worker
 * owns the debugger (the real pointer, device emulation, network bodies) and the page owns the DOM.
 * Each step is a named function on `__cp`, so this is the only place that crosses the boundary.
 * Errors come back as values and are rethrown here, because an exception inside `executeScript`
 * surfaces as an opaque "Error in invocation" rather than the page's own message.
 */
export async function callPage<T>(tabId: number, path: string, args: unknown[] = []): Promise<T> {
  const [r] = await chrome.scripting.executeScript({
    target: { tabId },
    args: [path, args],
    func: (p: string, a: unknown[]) => {
      const cp = (window as { __cp?: unknown }).__cp;
      if (!cp) return { error: "the picker did not load in this tab" };
      let self: unknown = null;
      let fn: unknown = cp;
      for (const key of p.split(".")) { self = fn; fn = (fn as Record<string, unknown> | undefined)?.[key]; }
      if (typeof fn !== "function") return { error: `the picker in this tab has no ${p} (reload the tab after updating the extension)` };
      const fail = (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) });
      try {
        const out = (fn as (...x: unknown[]) => unknown).apply(self, a);
        return out instanceof Promise ? out.then((value) => ({ value }), fail) : { value: out };
      } catch (e) { return fail(e); }
    },
  });
  const out = r.result as { value?: T; error?: string } | undefined;
  if (out?.error) throw new Error(out.error);
  return out?.value as T;
}
