import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useLocale } from "@/lib/locale";
import { translateTexts } from "@/lib/page-translate.functions";

const PRIVATE = ["/admin", "/pos", "/b2b"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA", "SVG", "INPUT", "SELECT", "OPTION"]);
const ATTRS = ["placeholder", "aria-label", "title", "alt"] as const;
const CACHE_KEY = "tb-en-cache-v1";

type Entry = { orig: string; shown: string };

function loadCache(): Map<string, string> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, string>));
  } catch {
    return new Map();
  }
}

/** Necesita traducción: tiene letras y no es solo un precio, talla o código. */
function translatable(text: string) {
  const t = text.trim();
  if (t.length < 2 || t.length > 4000 || !/\p{L}{2,}/u.test(t)) return false;
  if (/^[A-Z0-9\-_.·/ ]{1,12}$/.test(t)) return false;
  return true;
}

/** Traduce al inglés todo el texto visible de la tienda pública cuando el idioma es EN. */
export function PageTranslator() {
  const { lang } = useLocale();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = lang === "en" && !PRIVATE.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!active) return;
    const cache = loadCache();
    const texts = new Map<Text, Entry>();
    const attrs = new Map<Element, Map<string, Entry>>();
    const pending = new Set<string>();
    let timer: number | undefined;
    let inflight = false;
    let stopped = false;

    const skip = (el: Element | null) => {
      for (let n = el; n; n = n.parentElement) {
        if (SKIP_TAGS.has(n.tagName.toUpperCase()) || n.hasAttribute("data-no-translate") || (n as HTMLElement).isContentEditable) return true;
      }
      return false;
    };

    const applyText = (node: Text) => {
      const value = node.nodeValue ?? "";
      let entry = texts.get(node);
      if (!entry || value !== entry.shown) {
        entry = { orig: value, shown: value };
        texts.set(node, entry);
      }
      const key = entry.orig.trim();
      if (!translatable(key)) return;
      const en = cache.get(key);
      if (en) {
        const next = entry.orig.replace(key, en);
        if (node.nodeValue !== next) {
          entry.shown = next;
          node.nodeValue = next;
        }
      } else pending.add(key);
    };

    const applyAttrs = (el: Element) => {
      for (const name of ATTRS) {
        const value = el.getAttribute(name);
        if (!value) continue;
        let map = attrs.get(el);
        if (!map) attrs.set(el, (map = new Map()));
        let entry = map.get(name);
        if (!entry || value !== entry.shown) {
          entry = { orig: value, shown: value };
          map.set(name, entry);
        }
        const key = entry.orig.trim();
        if (!translatable(key)) continue;
        const en = cache.get(key);
        if (en) {
          if (value !== en) {
            entry.shown = en;
            el.setAttribute(name, en);
          }
        } else pending.add(key);
      }
    };

    const scan = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        if (!skip(root.parentElement)) applyText(root as Text);
        return;
      }
      if (!(root instanceof Element) || skip(root)) return;
      applyAttrs(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n = walker.nextNode();
      while (n) {
        if (n.nodeType === Node.TEXT_NODE) {
          if (!skip(n.parentElement)) applyText(n as Text);
        } else if (!skip(n as Element)) applyAttrs(n as Element);
        n = walker.nextNode();
      }
    };

    const flush = async () => {
      if (inflight || !pending.size || stopped) return;
      inflight = true;
      const batch = Array.from(pending).slice(0, 80);
      batch.forEach((t) => pending.delete(t));
      try {
        const result = await translateTexts({ data: { texts: batch } });
        for (const [src, en] of Object.entries(result)) cache.set(src, en);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(Array.from(cache).slice(-3000))));
        } catch { /* lleno */ }
        if (!stopped) scan(document.body);
      } catch { /* sin conexión: se queda en español */ }
      inflight = false;
      if (pending.size) schedule();
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 120);
    };

    scan(document.body);
    document.documentElement.lang = "en";
    schedule();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData") scan(m.target);
        else if (m.type === "attributes") scan(m.target);
        else m.addedNodes.forEach((node) => scan(node));
      }
      if (pending.size) schedule();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });

    return () => {
      stopped = true;
      observer.disconnect();
      window.clearTimeout(timer);
      texts.forEach((entry, node) => {
        if (node.isConnected && node.nodeValue === entry.shown) node.nodeValue = entry.orig;
      });
      attrs.forEach((map, el) => map.forEach((entry, name) => {
        if (el.getAttribute(name) === entry.shown) el.setAttribute(name, entry.orig);
      }));
      document.documentElement.lang = "es";
    };
  }, [active, pathname]);

  return null;
}
