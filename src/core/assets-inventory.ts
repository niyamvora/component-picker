/**
 * Every media file the page uses, described before anything is downloaded (#118).
 *
 * `assetUrls` in `assets.ts` serves the side panel's zip: a DOM walk capped at 40. A rebuild needs
 * the complete list, and needs it as *information* first — what the file is for, where it is used,
 * how big it renders — because the point of the export is that an agent can build the page without
 * the binary, and fetch the binary only when it has to (#119).
 *
 * Two sources, joined: the DOM (what references a file, and at what size) and the network (what
 * the tab actually loaded, which catches files nothing in the DOM names any more). Resource Timing
 * is not a third source: sites clear its buffer — resend.com keeps 17 entries, none of them media.
 */

import { UI } from "./const";
import { cssPath } from "./selector";
import { walk } from "./walk";

export type AssetRole = "icon" | "logo" | "avatar" | "decorative-background" | "content-image" | "texture"
  | "video" | "poster" | "font" | "favicon" | "social-image";
export type UseKind = "img" | "video" | "poster" | "background" | "mask" | "favicon" | "og" | "font";

export interface AssetUse {
  kind: UseKind;
  selector: string;
  alt?: string;
  /** Rendered size in CSS px. */
  box?: [number, number];
  natural?: [number, number];
  round?: boolean;
}
export interface AssetRef { url: string; uses: AssetUse[]; variants?: string[] }

/** What the network saw — filled by `src/bg/network.ts`. */
export interface NetEntry { url: string; type: string; mime: string; bytes: number }

export interface ManifestEntry {
  url: string;
  role: AssetRole;
  mime?: string;
  bytes?: number;
  width?: number;
  height?: number;
  alt?: string;
  usedBy: string[];
  /** Other candidates of the same image (srcset, `<source>`), which are not downloaded. */
  variants?: string[];
  source: "dom" | "network" | "dom+network";
  /** Path inside the export when the file was downloaded. */
  local?: string;
  note?: string;
}

const URL_RE = /url\((['"]?)([^'")]+)\1\)/g;
const px = (v: string) => Math.round(parseFloat(v) || 0);

export function assetRefs(root: Element = document.body): AssetRef[] {
  const refs = new Map<string, AssetRef>();
  const add = (raw: string | null | undefined, use: AssetUse): AssetRef | null => {
    if (!raw || /^(data:|blob:|#)/.test(raw.trim())) return null;
    let url: string;
    try { url = new URL(raw.trim(), document.baseURI).href; } catch { return null; }
    const ref = refs.get(url) ?? { url, uses: [] };
    if (!ref.uses.some((u) => u.kind === use.kind && u.selector === use.selector)) ref.uses.push(use);
    refs.set(url, ref);
    return ref;
  };

  for (const el of walk(root)) {
    if (el.closest(`[${UI}]`)) continue;
    const cs = getComputedStyle(el);
    const pseudos = (["::before", "::after"] as const).map((p) => [p, getComputedStyle(el, p)] as const).filter(([, s]) => s.content !== "none");
    const media = el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof SVGImageElement;
    const styled = [cs, ...pseudos.map(([, s]) => s)].some((s) => s.backgroundImage.includes("url(") || (s.maskImage || s.webkitMaskImage).includes("url("));
    if (!media && !styled) continue;
    const selector = cssPath(el);
    const r = el.getBoundingClientRect();
    const box: [number, number] = [Math.round(r.width), Math.round(r.height)];

    if (el instanceof HTMLImageElement) {
      const radius = cs.borderTopLeftRadius;
      const round = radius.endsWith("%") ? parseFloat(radius) >= 40 : parseFloat(radius) >= r.width * 0.4 && r.width > 0;
      const ref = add(el.currentSrc || el.src, { kind: "img", selector, box, alt: el.alt, natural: [el.naturalWidth, el.naturalHeight], round });
      const candidates = [el.getAttribute("srcset"), ...[...(el.parentElement instanceof HTMLPictureElement ? el.parentElement.querySelectorAll("source") : [])].map((s) => s.getAttribute("srcset"))]
        .filter(Boolean).flatMap((set) => set!.split(",").map((c) => c.trim().split(/\s+/)[0]))
        .map((u) => { try { return new URL(u, document.baseURI).href; } catch { return ""; } })
        .filter((u) => u && u !== ref?.url);
      if (ref && candidates.length) ref.variants = [...new Set([...(ref.variants ?? []), ...candidates])];
    } else if (el instanceof HTMLVideoElement) {
      const primary = el.currentSrc || el.src || el.querySelector("source")?.src;
      const ref = add(primary, { kind: "video", selector, box });
      const others = [...el.querySelectorAll("source")].map((s) => s.src).filter((u) => u && u !== ref?.url);
      if (ref && others.length) ref.variants = others;
      if (el.getAttribute("poster")) add(el.poster, { kind: "poster", selector, box });
    } else if (el instanceof SVGImageElement) {
      add(el.href.baseVal, { kind: "img", selector, box });
    }

    for (const [pseudo, style] of [["", cs] as const, ...pseudos]) {
      const at = selector + pseudo;
      const size: [number, number] = pseudo ? [px(style.width), px(style.height)] : box;
      for (const m of style.backgroundImage.matchAll(URL_RE)) add(m[2], { kind: "background", selector: at, box: size });
      for (const m of (style.maskImage || style.webkitMaskImage).matchAll(URL_RE)) add(m[2], { kind: "mask", selector: at, box: size });
    }
  }

  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]')) {
    add(link.href, { kind: "favicon", selector: `link[rel="${link.rel}"]` });
  }
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[name="twitter:image"]')) {
    add(meta.content, { kind: "og", selector: `meta[${meta.hasAttribute("property") ? "property" : "name"}="${meta.getAttribute("property") ?? meta.name}"]` });
  }
  for (const face of fontFaces()) add(face.url, { kind: "font", selector: face.label });
  return [...refs.values()];
}

/** `@font-face` sources in the readable sheets, labelled `Family 400 normal`. */
function fontFaces(): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [];
  const visit = (rules: CSSRuleList) => {
    for (const r of rules) {
      if (r instanceof CSSFontFaceRule) {
        const family = r.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
        const label = `${family} ${r.style.getPropertyValue("font-weight") || "400"} ${r.style.getPropertyValue("font-style") || "normal"}`;
        const base = r.parentStyleSheet?.href ?? document.baseURI;
        for (const m of r.style.getPropertyValue("src").matchAll(URL_RE)) {
          try { out.push({ url: new URL(m[2], base).href, label }); } catch { /* malformed src */ }
        }
      } else if ("cssRules" in r) visit((r as CSSGroupingRule).cssRules);
    }
  };
  for (const s of document.styleSheets) { try { visit(s.cssRules); } catch { /* cross-origin: the network log has these */ } }
  return out;
}

/**
 * What a file is for, from how it is used.
 * ponytail: size, name and alt-text heuristics. They are right for the common landing-page shapes
 * (full-bleed hero art, 40px avatars, logo strips); a site that breaks them gets a plausible role,
 * and the manifest still carries the sizes and selectors to judge by.
 */
export function classify(ref: AssetRef, vw: number, vh: number, mime = ""): AssetRole {
  const kinds = new Set(ref.uses.map((u) => u.kind));
  const name = ref.url.toLowerCase();
  const alt = ref.uses.map((u) => u.alt ?? "").join(" ");
  if (kinds.has("font") || mime.startsWith("font/")) return "font";
  if (kinds.has("video") || mime.startsWith("video/")) return "video";
  if (kinds.has("poster")) return "poster";
  if (kinds.has("favicon")) return "favicon";
  if (kinds.has("og")) return "social-image";
  if (/texture|noise|grain|pattern/.test(name)) return "texture";
  if (!ref.uses.length) return /logo/.test(name) ? "logo" : "content-image";
  const area = Math.max(...ref.uses.map((u) => (u.box?.[0] ?? 0) * (u.box?.[1] ?? 0)));
  if (/\bbackground\b|\bbg\b/i.test(alt) || (area >= vw * vh * 0.5 && ref.uses.every((u) => !u.alt))) return "decorative-background";
  if (/logo/.test(name) || /\blogo\b/i.test(alt)) return "logo";
  const within = (n: number) => ref.uses.every((u) => (u.box?.[0] ?? 0) <= n && (u.box?.[1] ?? 0) <= n);
  const square = ref.uses.every((u) => u.box && u.box[1] > 0 && Math.abs(u.box[0] / u.box[1] - 1) <= 0.25);
  if (within(96) && square && (ref.uses.some((u) => u.round) || /avatar|profile|headshot|people|team/.test(name))) return "avatar";
  if (kinds.has("mask") || within(48)) return "icon";
  return "content-image";
}

/** The DOM and the network, joined into one entry per file. */
export function buildManifest(refs: AssetRef[], net: NetEntry[], vw: number, vh: number): ManifestEntry[] {
  const byUrl = new Map(net.map((n) => [n.url, n]));
  const out: ManifestEntry[] = refs.map((ref) => {
    const hit = byUrl.get(ref.url) ?? ref.variants?.map((v) => byUrl.get(v)).find(Boolean);
    const sized = ref.uses.find((u) => u.natural?.[0]) ?? ref.uses.find((u) => u.box?.[0]);
    const [width, height] = sized?.natural?.[0] ? sized.natural : sized?.box ?? [undefined, undefined];
    return {
      url: ref.url,
      role: classify(ref, vw, vh, hit?.mime),
      ...(hit ? { mime: hit.mime, bytes: hit.bytes } : {}),
      ...(width ? { width, height } : {}),
      ...(ref.uses.find((u) => u.alt)?.alt ? { alt: ref.uses.find((u) => u.alt)!.alt } : {}),
      usedBy: [...new Set(ref.uses.map((u) => u.selector))],
      ...(ref.variants?.length ? { variants: ref.variants } : {}),
      source: hit ? "dom+network" : "dom",
    };
  });
  const known = new Set(out.flatMap((e) => [e.url, ...(e.variants ?? [])]));
  for (const n of net) {
    if (known.has(n.url) || !/^(Image|Media|Font)$/.test(n.type)) continue;
    known.add(n.url);
    out.push({
      url: n.url, role: n.type === "Font" ? "font" : n.type === "Media" ? "video" : classify({ url: n.url, uses: [] }, vw, vh, n.mime),
      mime: n.mime, bytes: n.bytes, usedBy: [], source: "network",
      note: "loaded, but nothing in the DOM referenced it at export time",
    });
  }
  return out;
}
