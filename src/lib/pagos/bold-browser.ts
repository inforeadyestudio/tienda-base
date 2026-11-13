import type { BoldCheckoutConfig } from "./bold";

type BoldWindow = Window & { BoldCheckout?: new (config: BoldCheckoutConfig) => { open: () => void } };

export async function openBoldCheckout(config: BoldCheckoutConfig) {
  const boldWindow = window as BoldWindow;
  if (!boldWindow.BoldCheckout) {
    await new Promise<void>((resolve, reject) => {
      const src = "https://checkout.bold.co/library/boldPaymentButton.js";
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
      const script = existing ?? document.createElement("script");
      const timeout = setTimeout(() => { script.remove(); reject(new Error("Bold tardó en responder. Retoma el mismo pago")); }, 15_000);
      script.addEventListener("load", () => { clearTimeout(timeout); resolve(); }, { once: true });
      script.addEventListener("error", () => { clearTimeout(timeout); script.remove(); reject(new Error("No pudimos abrir Bold. Retoma el mismo pago")); }, { once: true });
      if (!existing) { script.src = src; script.async = true; document.head.appendChild(script); }
    });
  }
  if (!boldWindow.BoldCheckout) throw new Error("No pudimos abrir Bold");
  new boldWindow.BoldCheckout(config).open();
}