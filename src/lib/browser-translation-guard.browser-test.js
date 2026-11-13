import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { installBrowserTranslationGuard } from "./browser-translation-guard";

/** Run through Vite in a real browser: no mocked DOM or production orders. */
export async function runTranslationRegression() {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  installBrowserTranslationGuard();
  const guardedRemove = Node.prototype.removeChild;
  installBrowserTranslationGuard();
  assert(Node.prototype.removeChild === guardedRemove, "Installation must be idempotent");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (value, prefix = false) => flushSync(() => root.render(
    React.createElement("div", null,
      prefix ? React.createElement("strong", { key: "prefix" }, "Total: ") : null,
      value,
      React.createElement("span", { key: "end" }, " COP")),
  ));
  const translate = (separate = false) => {
    const parent = host.firstChild;
    const original = [...parent.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    assert(original, "React text must exist");
    const font = document.createElement("font");
    font.textContent = "Translated amount";
    if (separate) {
      parent.insertBefore(font, original);
      parent.removeChild(original);
    } else parent.replaceChild(font, original);
    return { parent, original, font };
  };
  try {
    render("100");
    const first = translate();
    // Commit immediately, before MutationObserver's microtask callback.
    render("200", true);
    assert(first.font.textContent === "200", "Updated values must remain visible");
    assert(first.parent.firstChild.tagName === "STRONG", "Insertion must preserve order");
    render(null, true);
    assert(!first.font.isConnected && host.textContent === "Total:  COP", "Removal must clean translated wrapper");
    render("300");
    const second = translate(true);
    await Promise.resolve();
    render("400");
    assert(second.font.textContent === "400", "Updates after observer delivery must work");
    const retranslated = document.createElement("font");
    retranslated.textContent = "Retranslated";
    second.parent.replaceChild(retranslated, second.font);
    render("500");
    assert(retranslated.textContent === "500", "Repeated translation must remain connected to React updates");
    flushSync(() => root.render(React.createElement("p", null, "Nueva página")));
    assert(host.textContent === "Nueva página", "Navigation must remove old translated content");

    const parent = document.createElement("div");
    const text = document.createTextNode("normal");
    parent.appendChild(text);
    assert(parent.removeChild(text) === text, "Native remove return value must be preserved");
    let invalidRemove = false;
    try { parent.removeChild(text); } catch (error) { invalidRemove = error.name === "NotFoundError"; }
    assert(invalidRemove, "Unrelated missing nodes must still throw");
    let invalidInsert = false;
    try { parent.insertBefore(document.createElement("i"), text); } catch (error) { invalidInsert = error.name === "NotFoundError"; }
    assert(invalidInsert, "Unrelated insertion failures must still throw");
    parent.appendChild(text);
    let hierarchy = false;
    try { parent.insertBefore(parent, text); } catch (error) { hierarchy = error.name === "HierarchyRequestError"; }
    assert(hierarchy, "Other DOM exceptions must propagate");
    return "PASS: translated React text updates, inserts, removes, navigation, native errors and idempotency";
  } finally {
    flushSync(() => root.unmount());
    host.remove();
  }
}