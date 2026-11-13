import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export type ExitStep = "details" | "delivery" | "payment";

export type ExitReason =
  | "envio"
  | "metodo_pago"
  | "talla"
  | "mirando"
  | "mas_tarde"
  | "otro";

const REASONS: { id: ExitReason; label: string }[] = [
  { id: "envio", label: "El costo de envío" },
  { id: "metodo_pago", label: "No encontré mi método de pago" },
  { id: "talla", label: "Dudas con la talla" },
  { id: "mirando", label: "Solo estaba mirando" },
  { id: "mas_tarde", label: "Lo compro más tarde" },
  { id: "otro", label: "Otro motivo" },
];

const FOLLOW_UP: Partial<Record<ExitReason, string>> = {
  talla: "Escríbenos por WhatsApp y te ayudamos a escoger tu talla en un minuto.",
  metodo_pago: "Tenemos transferencia, Addi y pagos internacionales. Vuelve al paso de pago y los verás todos.",
  envio: "Con pedidos más grandes el envío es gratis. Te guardamos la selección por si quieres sumar otra pieza.",
  mas_tarde: "Guardamos tu selección en este dispositivo para que la retomes cuando quieras.",
};

type Props = {
  open: boolean;
  step: ExitStep;
  city: string;
  deliveryLabel: string;
  deliveryEta: string;
  onContinue: () => void;
  onLeave: () => void;
};

/** Aviso al intentar salir del checkout: motiva en el paso 1, pregunta el motivo en los pasos 2 y 3. */
export function ExitIntent({ open, step, city, deliveryLabel, deliveryEta, onContinue, onLeave }: Props) {
  const [asking, setAsking] = useState(step === "payment");
  const [chosen, setChosen] = useState<ExitReason | null>(null);
  const [note, setNote] = useState("");

  const close = () => { onLeave(); setAsking(step === "payment"); setChosen(null); setNote(""); };
  const stay = () => { track("checkout_exit_recovered", { step }); onContinue(); setAsking(step === "payment"); setChosen(null); setNote(""); };
  const pick = (reason: ExitReason) => {
    setChosen(reason);
    track("checkout_abandon_reason", { step, reason });
    if (reason !== "otro") window.setTimeout(close, 2200);
  };
  const sendNote = () => {
    if (note.trim()) track("checkout_abandon_reason", { step, reason: "otro", note: note.trim().slice(0, 300) });
    close();
  };

  const heading = step === "details"
    ? "Tu selección sigue aquí"
    : step === "delivery"
      ? "Ya casi lo tienes"
      : "Cuéntanos qué pasó";
  const body = step === "details"
    ? "No te preocupes, guardamos todo por ti. Si quieres terminar ahora, solo te faltan un par de pasos."
    : step === "delivery"
      ? `Ya tenemos tu dirección: ${deliveryLabel}${city ? ` a ${city}` : ""} · ${deliveryEta}. Solo falta el pago.`
      : "Nos ayudas a mejorar en un toque. No tienes que escribir nada si no quieres.";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] bg-ink/60 backdrop-blur-[2px]" onClick={close} />
          <motion.div
            initial={{ y: "100%", opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[91] rounded-t-2xl bg-ivory text-ink shadow-2xl sm:inset-x-auto sm:bottom-1/2 sm:left-1/2 sm:w-[440px] sm:translate-x-[-50%] sm:translate-y-1/2 sm:rounded-2xl"
            role="dialog" aria-modal="true" aria-label={heading}
          >
            <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-nm text-xl leading-tight">{heading}</h2>
                  <p className="mt-2 text-sm text-moss">{body}</p>
                </div>
                <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8 shrink-0" onClick={close} aria-label="Cerrar"><X /></Button>
              </div>

              {!asking ? (
                <div className="mt-6 space-y-2">
                  <Button className="h-12 w-full tracking-[0.02em]" onClick={stay}>
                    {step === "details" ? "Continuar con mi compra" : "Continuar"}
                  </Button>
                  <Button variant="ghost" className="h-11 w-full text-sm text-moss" onClick={() => (step === "payment" ? setAsking(true) : close())}>
                    {step === "payment" ? "No voy a comprar ahora" : "Guardar y salir"}
                  </Button>
                </div>
              ) : chosen && chosen !== "otro" ? (
                <div className="mt-6">
                  <p className="rounded-md border border-ink/15 bg-cream px-4 py-3 text-sm">{FOLLOW_UP[chosen] ?? "Gracias, lo tendremos en cuenta."}</p>
                  <Button className="mt-4 h-12 w-full tracking-[0.02em]" onClick={stay}>Volver a mi compra</Button>
                  <Button variant="ghost" className="mt-1 h-11 w-full text-sm text-moss" onClick={close}>Salir</Button>
                </div>
              ) : chosen === "otro" ? (
                <div className="mt-6">
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={300}
                    rows={3}
                    className="w-full rounded-md border border-ink/15 bg-transparent px-3 py-3 text-sm outline-none focus:border-ink"
                    aria-label="Cuéntanos qué pasó"
                  />
                  <Button className="mt-3 h-12 w-full tracking-[0.02em]" onClick={sendNote}>Enviar y salir</Button>
                  <Button variant="ghost" className="mt-1 h-11 w-full text-sm text-moss" onClick={stay}>Volver a mi compra</Button>
                </div>
              ) : (
                <div className="mt-5 space-y-2">
                  {REASONS.map((reason) => (
                    <Button
                      key={reason.id}
                      variant="outline"
                      className={cn("h-auto w-full justify-start whitespace-normal px-4 py-3 text-left text-sm font-normal")}
                      onClick={() => pick(reason.id)}
                    >
                      {reason.label}
                    </Button>
                  ))}
                  <Button variant="ghost" className="h-11 w-full text-sm text-moss" onClick={stay}>Mejor sigo con mi compra</Button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
