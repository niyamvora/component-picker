/**
 * What a component does when you touch it (#104).
 *
 * The States section forces `:hover` with the debugger and reads the result. That is deliberately
 * *not* this: `CSS.forcePseudoState` sets an end state without running a transition (see
 * `snapshot.ts` on why reading mid-transition is a lie). This runs the interaction for real and
 * watches what happens — which is the only way to see a popup mount, slide, and settle.
 *
 * Two sources, ranked. `getAnimations()` is authoritative: it reports resolved keyframes and
 * timing for CSS transitions, CSS animations and anything on the Web Animations API (which is what
 * Framer Motion compiles to), and reading it costs nothing the animation can feel. The samples are
 * the observed path — useful when the motion is driven by a script setting inline styles frame by
 * frame, where there is no animation object to find. Sampling forces style and layout, so it is the
 * fallback and it is labelled as such rather than being presented as ground truth.
 *
 * The service worker drives the pointer through the debugger (`Input.dispatchMouseEvent`) because
 * a synthetic `mouseover` does not set `:hover` in Chrome — it would open a JS-driven menu but
 * leave every CSS hover rule unapplied, which is a subtly wrong answer rather than a missing one.
 */

import { UI } from "./const";
import { animationLabel, keyframeBody, timingLine } from "./animations";

/**
 * `scroll` is here rather than in its own runner (#108): scrolling an element into view and
 * diffing what changes is the same observation problem as hovering it, and a reveal is exactly
 * the opacity-and-transform path this already records.
 */
export type Action = "hover" | "click" | "focus" | "leave" | "scroll";
export interface Step { trigger: string; action: Action }

const MAX_WATCH = 12;      // elements followed through one step
const MAX_SAMPLES = 40;    // per step, so a 600ms sequence stays readable
const SCAN_CAP = 4000;     // elements considered when looking for what appeared

interface Sample { t: number; values: Map<Element, string> }

/** The handful of properties that carry a reveal: what moved, what faded, what state flipped. */
function styleOf(el: Element): string {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const data = [...(el as HTMLElement).attributes]
    .filter((a) => a.name.startsWith("data-") && a.name !== "data-cp" && a.value.length < 40)
    .map((a) => `${a.name}=${a.value || "true"}`).join(" ");
  return [
    `opacity: ${cs.opacity}`,
    cs.transform !== "none" ? `transform: ${cs.transform}` : "",
    cs.visibility !== "visible" ? `visibility: ${cs.visibility}` : "",
    `box: ${Math.round(r.width)}×${Math.round(r.height)} at (${Math.round(r.x)}, ${Math.round(r.y)})`,
    data,
  ].filter(Boolean).join(" · ");
}

const named = (el: Element) => {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = typeof el.className === "string" && el.className.trim()
    ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
  return `${tag}${id}${cls}`;
};

const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/**
 * One interaction, observed.
 *
 * Kept as an object rather than one call because the pointer is driven from the service worker:
 * `begin` records the baseline and hands back where to aim, the worker dispatches the real event,
 * and `collect` watches what follows. A single page-side call could only ever send synthetic
 * events, which is the wrong answer for anything CSS-driven.
 */
class Run {
  private before = new Set<Element>();
  private watched: Element[] = [];
  private samples: Sample[] = [];
  private anims = new Map<string, Animation>();
  private t0 = 0;
  private appeared: Element[] = [];
  readonly log: string[] = [];

  /** Record what the page looks like before the action, and return where to aim the pointer. */
  begin(trigger: Element, watch?: string): { x: number; y: number } {
    this.before = new Set([...document.body.querySelectorAll("*")].slice(0, SCAN_CAP));
    this.watched = watch
      ? [...document.querySelectorAll(watch)].slice(0, MAX_WATCH)
      : [trigger, ...trigger.querySelectorAll("*")].slice(0, MAX_WATCH);
    this.samples = [];
    this.anims.clear();
    this.appeared = [];
    this.t0 = performance.now();
    const r = trigger.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }

  /**
   * Anything that entered the document since `begin` — a portal-mounted popup is the whole point,
   * and it is never inside the trigger's subtree, so watching only the trigger would miss it.
   */
  private findAppeared() {
    if (this.appeared.length) return;
    for (const el of [...document.body.querySelectorAll("*")].slice(0, SCAN_CAP)) {
      if (this.before.has(el) || el.closest(`[${UI}]`) || !isVisible(el)) continue;
      // The mounted root is enough; its children come along in the report.
      if (this.appeared.some((a) => a.contains(el))) continue;
      this.appeared.push(el);
      if (this.appeared.length >= 4) break;
    }
    if (this.appeared.length) this.watched = [...this.watched, ...this.appeared].slice(0, MAX_WATCH);
  }

  /** One observation: the cheap sample, plus any animation object that has appeared. */
  tick() {
    this.findAppeared();
    const values = new Map<Element, string>();
    for (const el of this.watched) {
      try { values.set(el, styleOf(el)); } catch { /* detached mid-flight */ }
      let live: Animation[] = [];
      try { live = el.getAnimations(); } catch { /* detached */ }
      for (const a of live) {
        const key = `${named(el)}|${animationLabel(a)}`;
        if (!this.anims.has(key)) this.anims.set(key, a);
      }
    }
    if (this.samples.length < MAX_SAMPLES) this.samples.push({ t: Math.round(performance.now() - this.t0), values });
  }

  /** Fold this step into the log, keeping only the samples where something actually changed. */
  end(step: Step) {
    this.findAppeared();
    const lines: string[] = [`### ${step.action} \`${step.trigger}\``];
    if (this.appeared.length) {
      lines.push(`Appeared: ${this.appeared.map((a) => `\`${named(a)}\``).join(", ")} — mounted outside the trigger's subtree (a portal).`);
    }
    const changes: string[] = [];
    const last = new Map<Element, string>();
    for (const s of this.samples) {
      for (const [el, v] of s.values) {
        if (last.get(el) === v) continue;
        // The first value for an element is its state at that moment, not a change; both are worth
        // printing, because "opacity 0 at t=0" is exactly what the rebuild has to start from.
        changes.push(`t=${String(s.t).padStart(4)}ms  ${named(el)}  ${v}`);
        last.set(el, v);
      }
    }
    lines.push(changes.length
      ? `\`\`\`\n${changes.slice(0, 60).join("\n")}\n\`\`\`` +
        (changes.length > 60 ? `\n_${changes.length - 60} further sample line(s) omitted._` : "")
      : "_Nothing observable changed. If the effect is a pure CSS `:hover` style with no transition, the States section of a normal capture already carries it._");
    if (this.anims.size) {
      lines.push(`**Animations that ran** (from \`getAnimations()\` — resolved timing, not sampled):`);
      lines.push([...this.anims].slice(0, 12).map(([key, a]) =>
        `\`\`\`\n${key.split("|")[0]} — ${animationLabel(a)} · ${timingLine(a)}\n${keyframeBody(a)}\n\`\`\``).join("\n"));
    }
    this.log.push(lines.join("\n"));
  }
}

/** The page-side handle the service worker drives, one step at a time. */
export const interaction = {
  run: null as Run | null,
  /** Resolve the trigger, record the baseline, and return where the real pointer should go. */
  begin(triggerSel: string, watch?: string) {
    const trigger = document.querySelector(triggerSel);
    if (!trigger) throw new Error(`no element matched the trigger: ${triggerSel}`);
    if (!this.run) this.run = new Run();
    return this.run.begin(trigger, watch);
  },
  /** Focus, leave and scroll have no pointer to dispatch, so they act from here. */
  act(triggerSel: string, action: Action) {
    const el = document.querySelector(triggerSel);
    if (!el) return;
    if (action === "focus" && el instanceof HTMLElement) el.focus();
    // An IntersectionObserver reveal only fires on a real scroll, so this must move the viewport
    // rather than fake an event. `instant` keeps the sampling window measuring the reveal instead
    // of the smooth-scroll the site may have asked for.
    if (action === "scroll") el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    if (action === "leave") {
      for (const t of ["pointerleave", "mouseleave", "pointerout", "mouseout"]) {
        el.dispatchEvent(new MouseEvent(t, { bubbles: t.endsWith("out"), cancelable: true }));
      }
    }
  },
  tick() { this.run?.tick(); },
  end(step: Step) { this.run?.end(step); },
  /** The finished timeline. Resets, so the next call starts clean. */
  report(steps: Step[]): string {
    const log = this.run?.log ?? [];
    this.run = null;
    if (!log.length) return "No interaction was recorded.";
    return [
      `# Interaction on ${document.title || location.hostname}`,
      location.href,
      `Sequence: ${steps.map((s) => `${s.action} \`${s.trigger}\``).join(" → ")}.`,
      `Pointer events are dispatched through the debugger, so CSS \`:hover\` applies for real. ` +
      `Sample lines are observed values and force a style recalculation to read; the animation ` +
      `blocks below each step are resolved timing straight from the animation objects and are the ` +
      `authoritative record of what ran.`,
      ...log,
    ].join("\n\n");
  },
};
