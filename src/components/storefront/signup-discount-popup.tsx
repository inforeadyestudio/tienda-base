import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Check, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCheckoutSheet } from "@/lib/checkout/engine";
import { signupSettingsQuery } from "@/lib/signup-discount-query";
import { subscribeSignupDiscount } from "@/lib/signup-discount.functions";
import { isSignupStorefrontPath, SIGNUP_DELAY_MS, signupCopy, type SignupSettings } from "@/lib/signup-discount";

const DISMISSED = "tb-signup-dismissed";
const SUBSCRIBED = "tb-signup-subscribed";
export function SignupDiscountPopup() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const eligible = isSignupStorefrontPath(pathname);
  const { data: settings } = useQuery({ ...signupSettingsQuery(), enabled: eligible });
  const { open: checkoutOpen } = useCheckoutSheet();
  const [open, setOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(true);
  const entered = useRef<number | null>(null);
  useEffect(() => {
    entered.current = Date.now();
    try { setSuppressed(Boolean(sessionStorage.getItem(DISMISSED) || localStorage.getItem(SUBSCRIBED))); }
    catch { setSuppressed(false); }
  }, []);
  useEffect(() => {
    if (!eligible || !settings?.enabled || suppressed || checkoutOpen) { setOpen(false); return; }
    const elapsed = Date.now() - (entered.current ?? Date.now());
    const timer = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"][data-state="open"]') || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setOpen(true);
    }, Math.max(0, SIGNUP_DELAY_MS - elapsed));
    return () => window.clearTimeout(timer);
  }, [eligible, settings?.enabled, suppressed, checkoutOpen]);
  if (!settings || !eligible) return null;
  return <SignupDiscountDialog settings={settings} open={open} onOpenChange={(value) => {
    setOpen(value);
    if (!value) { setSuppressed(true); try { sessionStorage.setItem(DISMISSED, "1"); } catch { /* optional storage */ } }
  }} />;
}

export function SignupDiscountDialog({ settings, open, onOpenChange, preview = false }: { settings: SignupSettings; open: boolean; onOpenChange: (value: boolean) => void; preview?: boolean }) {
  const subscribe = useServerFn(subscribeSignupDiscount);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code: string; discountPct: number } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent hideDefaultClose className="w-[calc(100%-2rem)] max-w-3xl max-h-[90svh] overflow-y-auto border-ink/15 bg-ivory p-0 text-ink sm:rounded-lg gap-0">
      <DialogClose aria-label="Cerrar" className="absolute right-3 top-3 z-10 grid size-9 cursor-pointer place-items-center rounded-full bg-ivory text-ink shadow-md ring-1 ring-ink/10 transition hover:bg-ivory/90 focus:outline-none focus:ring-2 focus:ring-moss">
        <X className="size-4" />
      </DialogClose>
      <div className={settings.imageUrl ? "grid min-w-0 md:grid-cols-2" : "mx-auto w-full max-w-lg"}>
        {settings.imageUrl && <img src={settings.imageUrl} alt="Tu Marca" className="h-36 w-full object-cover md:h-full md:min-h-[480px]" />}
        <div className="min-w-0 px-6 py-8 md:px-8 md:py-12">
          <p className="mb-5 font-nm text-xs uppercase text-moss">Tu Marca</p>
          <DialogTitle className="font-nm text-3xl font-normal leading-tight break-words">{signupCopy(settings.title, settings.discountPct)}</DialogTitle>
          <DialogDescription className="mt-4 leading-relaxed text-moss">{signupCopy(settings.message, settings.discountPct)}</DialogDescription>
          {result ? <div className="mt-7 space-y-4" aria-live="polite">
            <Check className="size-7 text-moss" />
            <p className="text-sm">{signupCopy(settings.successText, result.discountPct)}</p>
            <p className="font-nm text-3xl">{result.discountPct}%</p>
            <div className="flex min-w-0 items-center gap-2 border border-ink/20 p-3"><code className="min-w-0 flex-1 break-all text-sm" translate="no">{result.code}</code><Button variant="ghost" size="icon" aria-label="Copiar código" title="Copiar código" onClick={async () => {
              try { await navigator.clipboard.writeText(result.code); setCopied(true); }
              catch { toast.error("Selecciona el código para copiarlo"); }
            }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</Button></div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Seguir comprando <ArrowRight className="size-4" /></Button>
          </div> : <form className="mt-7 space-y-4" onSubmit={async (event) => {
            event.preventDefault(); setBusy(true); setError("");
            try {
              const response = preview ? { code: "VISTA-PREVIA", discountPct: settings.discountPct } : await subscribe({ data: { name, email, consent: consent as true, website: "" } });
              setResult(response);
              if (!preview) try { localStorage.setItem(SUBSCRIBED, "1"); localStorage.setItem("tb-signup-code", response.code); } catch { /* optional storage */ }
            } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar tu inscripción"); }
            finally { setBusy(false); }
          }}>
            <label className="block text-sm">Nombre<input autoComplete="given-name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full border-b border-ink/30 bg-transparent py-3 outline-none focus:border-moss" /></label>
            <label className="block text-sm">Correo<input type="email" autoComplete="email" required maxLength={255} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full border-b border-ink/30 bg-transparent py-3 outline-none focus:border-moss" /></label>
            <label className="flex items-start gap-2 text-xs leading-relaxed text-moss"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 shrink-0" /><span>Acepto recibir novedades y la <a href="/privacidad" target="_blank" rel="noreferrer" className="underline">política de privacidad</a>.</span></label>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="h-auto min-h-11 w-full whitespace-normal" disabled={busy}>{busy ? "Inscribiendo…" : signupCopy(settings.buttonText, settings.discountPct)} <ArrowRight className="size-4 shrink-0" /></Button>
          </form>}
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}