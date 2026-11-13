import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PaymentDraft } from "@/lib/checkout/payment-draft";
import { formatUSD } from "@/lib/format";
import { createPagueloPayment, pagueloPaymentStatus } from "@/lib/international.functions";


/** Abre el pago de Páguelo Fácil en una ventana y confirma el pedido cuando la pasarela responde. */
export function PagueloFacilButton({ amountUsd, onPaid, prepareDraft }: { amountUsd: number; onPaid: (reference: string) => void; prepareDraft: (reference: string) => Promise<PaymentDraft> }) {
  const create = useServerFn(createPagueloPayment);
  const status = useServerFn(pagueloPaymentStatus);
  const [busy, setBusy] = useState(false);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setBusy(false);
  };

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const start = async () => {
    setBusy(true);
    setPayUrl(null);
    const reference = crypto.randomUUID();
    // Abrimos la ventana dentro del gesto del usuario para evitar el bloqueo de pop-ups.
    const win = window.open("", "_blank");
    try {
      const draft = await prepareDraft(reference);
      const { url } = await create({
        data: { amountUsd, reference, draft, description: "Tu Marca", origin: window.location.origin },
      });
      setPayUrl(url);
      if (win && !win.closed) win.location.href = url;
      else toast.message("Enable pop-ups or use the payment link below.");
      timer.current = setInterval(async () => {
        const result = await status({ data: { reference } });
        if (result.status === "paid") {
          if (timer.current) clearInterval(timer.current);
          setBusy(false);
          onPaid(result.reference);
        } else if (result.status === "failed") {
          if (timer.current) clearInterval(timer.current);
          setBusy(false);
          toast.error("El pago no se pudo completar.");
        }
      }, 4000);
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "No pudimos iniciar el pago.");
    }
  };

  return (
    <div className="space-y-2">
      <Button className="h-12 w-full uppercase tracking-[0.16em]" disabled={busy || amountUsd <= 0} onClick={start}>
        {busy && <Loader2 className="animate-spin" />}
        {busy ? "Waiting for payment…" : `Pay ${formatUSD(amountUsd)}`}
      </Button>
      {busy && (
        <div className="flex items-center justify-between gap-3 text-xs text-moss">
          {payUrl ? (
            <a href={payUrl} target="_blank" rel="noopener" className="underline">Open the payment page</a>
          ) : (
            <span>Opening the payment page…</span>
          )}
          <button type="button" className="underline" onClick={stop}>Cancel and try again</button>
        </div>
      )}
    </div>
  );
}
