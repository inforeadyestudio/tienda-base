import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createPagueloPayment } from "@/lib/international.functions";
import { addiLimits, createAddiPayment, createPaypalPayment, createWompiPayment, hostedPaymentStatus } from "@/lib/payments.functions";
import type { PaymentDraft } from "@/lib/checkout/payment-draft";
import type { PreparedPayment } from "@/lib/checkout/prepared-payment";
import { createBoldPayment } from "@/lib/pagos/bold.functions";
import { openBoldCheckout } from "@/lib/pagos/bold-browser";
import { holdToken } from "@/lib/checkout/stock-hold";

type Provider = "wompi" | "paypal" | "paguelofacil" | "addi" | "bold";

export type HostedCustomer = {
  phone?: string;
  firstName?: string;
  lastName?: string;
  documentId?: string;
  address?: string;
  city?: string;
};

export type HostedItem = { sku: string; name: string; quantity: number; unitPrice: number; pictureUrl?: string };

const cop = (value: number) => `$${Math.round(value).toLocaleString("es-CO")}`;

/** Abre la pasarela en una ventana nueva y confirma el pedido cuando el pago queda aprobado. */
export function HostedPaymentButton({
  provider, amountCop, amountUsd, email, label, onPaid, onStart, customer, items, shippingCop, prepareDraft,
}: {
  provider: Provider;
  amountCop: number;
  amountUsd: number;
  email?: string;
  label: string;
  onPaid: (reference: string) => void;
  onStart?: (reference: string) => void | Promise<void>;
  prepareDraft: (reference: string) => Promise<PaymentDraft | PreparedPayment>;
  customer?: HostedCustomer;
  items?: HostedItem[];
  shippingCop?: number;
}) {
  const wompi = useServerFn(createWompiPayment);
  const paypal = useServerFn(createPaypalPayment);
  const paguelo = useServerFn(createPagueloPayment);
  const addi = useServerFn(createAddiPayment);
  const bold = useServerFn(createBoldPayment);
  const limitsFn = useServerFn(addiLimits);
  const status = useServerFn(hostedPaymentStatus);
  const [busy, setBusy] = useState(false);
  const [limits, setLimits] = useState<{ minAmount: number; maxAmount: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const starting = useRef(false);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  useEffect(() => {
    if (provider !== "addi" || amountCop <= 0) return;
    limitsFn({ data: { amountCop: Math.round(amountCop) } }).then(setLimits).catch(() => setLimits(null));
  }, [provider, amountCop, limitsFn]);

  const outOfRange = provider === "addi" && !!limits && limits.maxAmount > 0 && (amountCop < limits.minAmount || amountCop > limits.maxAmount);

  const start = async () => {
    if (starting.current) return;
    starting.current = true;
    if (timer.current) clearInterval(timer.current);
    setBusy(true);
    let reference: string = crypto.randomUUID();
    const origin = window.location.origin;
    try {
      if (provider === "bold") {
        const token = holdToken();
        if (!token) throw new Error("Vuelve a apartar tus prendas antes de pagar");
        const key = `tb-bold-reference-${token}`;
        const previous = localStorage.getItem(key);
        if (previous && /^[0-9a-f-]{36}$/i.test(previous)) reference = previous;
        else localStorage.setItem(key, reference);
      }
      const prepared = await prepareDraft(reference);
      const draft = "draft" in prepared ? prepared.draft : prepared;
      if ("draft" in prepared) reference = prepared.reference;
      let url = "";
      if (provider === "bold") {
        const currency = draft.currency;
        const config = await bold({ data: { amount: currency === "COP" ? Math.round(amountCop) : amountUsd, currency, reference, origin, draft } });
        await openBoldCheckout(config);
      } else if ("draft" in prepared && prepared.url) {
        url = prepared.url;
      } else if (provider === "wompi") {
        ({ url } = await wompi({ data: { amountCop: Math.round(amountCop), reference, origin, draft, ...(email ? { email } : {}) } }));
      } else if (provider === "addi") {
        if (!email || !customer?.phone || !customer.firstName || !customer.lastName || !customer.documentId) {
          throw new Error("Addi necesita tu nombre, cédula, correo y celular.");
        }
        ({ url } = await addi({
          data: {
            amountCop: Math.round(amountCop),
            shippingCop: Math.round(shippingCop ?? 0),
            reference,
            draft,
            origin,
            email,
            phone: customer.phone,
            firstName: customer.firstName,
            lastName: customer.lastName,
            documentId: customer.documentId,
            address: customer.address ?? "",
            city: customer.city ?? "",
            items: (items?.length ? items : [{ sku: "TU MARCA", name: "Pedido Tu Marca", quantity: 1, unitPrice: Math.round(amountCop) }]).map((item) => ({
              ...item,
              ...(item.pictureUrl && /^https?:\/\//.test(item.pictureUrl) ? {} : { pictureUrl: undefined }),
            })),
          },
        }));
      } else if (provider === "paypal") {
        ({ url } = await paypal({ data: { amountUsd, reference, origin, draft } }));
      } else {
        ({ url } = await paguelo({ data: { amountUsd, reference, description: "Tu Marca", origin, draft } }));
      }
      await onStart?.(reference);
      if (provider !== "bold") {
        const popup = window.open(url, "_blank");
        if (popup) popup.opener = null;
        else toast.error("La ventana de pago no se abrió. Puedes retomar el mismo intento.");
      }
      timer.current = setInterval(async () => {
        try {
          const result = await status({ data: { reference } });
          if (result.status === "paid") {
            clearInterval(poll);
            setBusy(false);
            onPaid(result.reference);
          } else if (result.status === "failed") {
            clearInterval(poll);
            setBusy(false);
            toast.error("El pago no se pudo completar.");
          }
        } catch { /* Un fallo temporal de conexión no significa que el pago falló. */ }
      }, 4000);
      const poll = timer.current;
      // Retomar uses the saved reference and URL, rather than starting another charge.
      setBusy(false);
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "No pudimos iniciar el pago.");
    } finally { starting.current = false; }
  };

  const disabled = busy || outOfRange || (provider === "wompi" || provider === "addi" ? amountCop <= 0 : amountUsd <= 0);
  return (
    <>
      <Button className="h-12 w-full uppercase tracking-[0.16em]" disabled={disabled} onClick={start}>
        {busy && <Loader2 className="animate-spin" />}
        {busy ? (provider === "addi" ? "Addi está revisando tu solicitud…" : "Esperando el pago…") : label}
      </Button>
      {outOfRange && limits && (
        <p className="mt-2 text-center text-[11px] text-moss">Addi aplica solo para compras entre {cop(limits.minAmount)} y {cop(limits.maxAmount)}.</p>
      )}
    </>
  );
}
