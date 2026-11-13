/** Google Translate replaces Text nodes with FONT wrappers that React does not own.
 * Repair only observed replacements; unrelated DOM mistakes still throw normally.
 * Install before hydration, never from a late component effect.
 */
const installations = new WeakSet<object>();

export function installBrowserTranslationGuard() {
  if (typeof window === "undefined" || installations.has(window.Node.prototype)) return;
  const prototype = window.Node.prototype;
  const nativeRemove = prototype.removeChild;
  const nativeInsert = prototype.insertBefore;
  const valueDescriptor = Object.getOwnPropertyDescriptor(prototype, "nodeValue");
  const replacements = new WeakMap<Node, Node>();

  const isTranslationWrapper = (node: Node) =>
    node instanceof window.Element &&
    (node.tagName === "FONT" || node.hasAttribute("data-translation"));

  const record = (records: MutationRecord[]) => {
    for (const mutation of records) {
      // Do not guess at reordered elements or unrelated third-party mutations.
      if (mutation.removedNodes.length !== 1) continue;
      const removed = mutation.removedNodes[0];
      const candidates = mutation.addedNodes.length === 1
        ? [mutation.addedNodes[0]]
        : records.flatMap(addition => {
          if (addition.target !== mutation.target || addition.addedNodes.length !== 1) return [];
          const added = addition.addedNodes[0];
          return addition.nextSibling === removed || addition.previousSibling === removed ||
            mutation.previousSibling === added || mutation.nextSibling === added ? [added] : [];
        });
      if (candidates.length !== 1) continue;
      const added = candidates[0];
      if (removed.nodeType === window.Node.TEXT_NODE && isTranslationWrapper(added)) {
        replacements.set(removed, added);
      } else if (isTranslationWrapper(removed) && isTranslationWrapper(added)) {
        replacements.set(removed, added);
      }
    }
  };
  const observer = new window.MutationObserver(record);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const replacementIn = (node: Node, parent: Node) => {
    // Translation and React commits can happen before the observer callback.
    record(observer.takeRecords());
    let current = replacements.get(node);
    const visited = new Set<Node>();
    while (current && !visited.has(current)) {
      if (current.parentNode === parent) return current;
      visited.add(current);
      current = replacements.get(current);
    }
    return undefined;
  };

  prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      const replacement = replacementIn(child, this);
      if (replacement) {
        nativeRemove.call(this, replacement);
        return child;
      }
    }
    return nativeRemove.call(this, child) as T;
  };
  prototype.insertBefore = function <T extends Node>(child: T, reference: Node | null): T {
    const anchor = reference && reference.parentNode !== this
      ? replacementIn(reference, this) ?? reference
      : reference;
    return nativeInsert.call(this, child, anchor) as T;
  };

  if (valueDescriptor?.get && valueDescriptor.set) {
    const nativeSet = valueDescriptor.set;
    Object.defineProperty(prototype, "nodeValue", {
      ...valueDescriptor,
      set(this: Node, value: string | null) {
        nativeSet.call(this, value);
        if (this.nodeType !== window.Node.TEXT_NODE || this.parentNode) return;
        record(observer.takeRecords());
        let translated = replacements.get(this);
        const visited = new Set<Node>();
        while (translated && !visited.has(translated)) {
          visited.add(translated);
          if (translated.isConnected) {
            // Fresh amounts/status must stay visible, not leave an old translation behind.
            translated.textContent = value;
            break;
          }
          translated = replacements.get(translated);
        }
      },
    });
  }
  installations.add(prototype);
}