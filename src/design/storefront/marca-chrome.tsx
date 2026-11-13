// Piezas globales de la tienda Tu Marca: franja de avisos, grano de papel y newsletter del 10 %.
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Iso, PARES, Pastilla } from "@/design/sections/marca/shared";
import newsletterPhoto from "@/design/assets/marca/newsletter-c1-04.jpg";

/** Grano de papel sobre todo el sitio (no bloquea clics). */
export function GrainOverlay() {
  return <div aria-hidden="true" className="marca-grain-page" />;
}

/** Franja de avisos: un mensaje a la vez, cambia cada ~4 s cuadro a cuadro. Los textos vienen del panel (Anuncios). */
export function AnnouncementStrip({ items }: { items: string[] }) {
  const list = items.filter(Boolean);
  const [i, setI] = useState(0);
  const [prev, setPrev] = useState<number | null>(null);
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    if (list.length < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      setI((cur) => { setPrev(cur); return (cur + 1) % list.length; });
      setEnter(true);
      window.setTimeout(() => setEnter(false), 30);
      window.setTimeout(() => setPrev(null), 500);
    }, 4200);
    return () => window.clearInterval(t);
  }, [list.length]);
  if (!list.length) return null;
  return (
    <div className="marca marca-strip relative h-8 overflow-hidden border-b border-marca-line bg-marca-paper text-center" aria-live="polite">
      {prev !== null ? <span key={`c${prev}`} className="marca-mono marca-mono-soft is-out text-[10px] tracking-[.14em]">{list[prev]}</span> : null}
      <span key={`c${i}`} className={`marca-mono marca-mono-soft text-[10px] tracking-[.14em] ${enter ? "is-pre" : ""}`}>{list[i]}</span>
    </div>
  );
}

/* ---------------- newsletter 10 % ---------------- */
const SEEN = "marca_news_seen";
const DONE = "marca_news_done";
function readStore(k: string, session = true) { try { return (session ? sessionStorage : localStorage).getItem(k); } catch { return null; } }
function writeStore(k: string, v: string, session = true) { try { (session ? sessionStorage : localStorage).setItem(k, v); } catch { /* sin almacenamiento */ } }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Tarjeta del 10 % en la primera compra: aparece al entrar a la tienda (una vez por visita, ~2,5 s después de que
 * se va la pantalla de carga). Sin pestaña fija al costado; si ya se suscribió, no vuelve a salir.
 * TODO(logica): necesito una acción `subscribeNewsletter(email)` en @/logic que guarde el correo
 * y devuelva el código de bienvenida real (y lo aplique a la bolsa). Mientras no exista,
 * se muestra el código de ejemplo y no se guarda nada.
 */
export function NewsletterPopup({ onSubscribe, code: fixedCode = "TU MARCA10", delay = 2500, blocked = false }: { onSubscribe?: (email: string) => Promise<{ code?: string } | void>; code?: string; delay?: number; blocked?: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [ok, setOk] = useState(false);
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  useEffect(() => {
    if (readStore(DONE, false) || readStore(SEEN)) return;
    let t = 0;
    // espera a que se vaya la pantalla de carga y a que no haya otro panel abierto
    const tryOpen = () => {
      if (blockedRef.current || document.querySelector(".marca-loader")) { t = window.setTimeout(tryOpen, blockedRef.current ? 4000 : 400); return; }
      writeStore(SEEN, "1");
      setOpen(true);
    };
    t = window.setTimeout(tryOpen, delay);
    return () => window.clearTimeout(t);
  }, [delay]);

  const change = (v: boolean) => {
    setOpen(v);
    if (!v) writeStore(SEEN, "1");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) { setMsg("Revisa tu correo"); return; }
    if (!ok) { setMsg("Marca la casilla para continuar"); return; }
    setMsg("");
    let result: { code?: string } | void = undefined;
    if (onSubscribe) {
      try { result = await onSubscribe(email.trim()); } catch { setMsg("No pudimos enviarlo, intenta de nuevo"); return; }
    }
    setCode((result && result.code) || fixedCode);
    writeStore(DONE, "1", false);
  };
  const copy = () => {
    if (!code) return;
    navigator.clipboard?.writeText(code).then(() => setCopied(true), () => setCopied(false));
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={change}>
        <Dialog.Portal>
          <Dialog.Overlay className="marca-scrim fixed inset-0 z-[94] bg-marca-cacao/20 backdrop-blur-[3px]" />
          <Dialog.Content onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="marca marca-news marca-lift fixed left-1/2 top-1/2 z-[95] w-[min(760px,calc(100%-40px))] outline-none [transform:translate(-50%,-50%)]" aria-describedby={undefined}>
            {/* par de color lima + rosa (guía de marca): la foto va dentro de una pastilla y el 10 % en un círculo rosa */}
            <div className="grid max-h-[calc(100svh-40px)] grid-cols-1 overflow-y-auto bg-marca-lima md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <div className="relative hidden items-center p-6 md:flex">
                <Pastilla tone={PARES.rosa} inset="9%" className="w-full">
                  <span className="absolute inset-[9%] overflow-hidden rounded-full">
                    <img src={newsletterPhoto} alt="Foto de ejemplo" className="absolute inset-0 h-full w-full object-cover object-[50%_30%]" />
                  </span>
                </Pastilla>
              </div>
              <div className="relative grid content-start gap-3.5 px-5 pb-5 pt-6 md:px-[30px] md:pb-[26px] md:pt-[30px]">
                <Dialog.Close className="marca-mono absolute right-[22px] top-[18px] text-[10.5px] text-marca-cacao">Cerrar</Dialog.Close>
                <span className="grid size-[96px] place-items-center rounded-full bg-marca-rosa md:size-[112px]">
                  {code ? <Iso className="w-[44px] text-marca-burdeos" spin={false} /> : <span className="marca-t text-[38px] leading-none text-marca-burdeos md:text-[44px]">10%</span>}
                </span>
                {code ? (
                  <>
                    <Dialog.Title className="marca-t text-[clamp(24px,3vw,30px)] leading-[1.05]">Tu código</Dialog.Title>
                    <div className="flex items-center justify-between gap-3.5 border border-dashed border-marca-cacao px-4 py-3">
                      <b className="marca-tr text-[24px] font-normal tracking-[.08em]">{code}</b>
                      <button type="button" className="marca-bk" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button>
                    </div>
                    <p className="m-0">Úsalo en tu primera compra.</p>
                    <div><Dialog.Close className="marca-btn">Seguir viendo</Dialog.Close></div>
                  </>
                ) : (
                  <>
                    <Dialog.Title className="marca-t mt-1 text-[clamp(26px,3.2vw,34px)] leading-[1.02]">De descuento en tu primera compra</Dialog.Title>
                    <p className="m-0">Drops y avisos antes que nadie.</p>
                    <form onSubmit={submit} noValidate className="grid gap-3">
                      <label className="sr-only" htmlFor="marca-news-email">Correo</label>
                      <div className="marca-field"><input id="marca-news-email" type="email" placeholder="Tu correo" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                      <div className="marca-mono min-h-[1.2em] text-[10px] text-marca-burdeos" role="status">{msg}</div>
                      <label className="marca-mono marca-mono-soft flex cursor-pointer items-start gap-2.5 text-[9.5px]">
                        <input type="checkbox" className="marca-check" checked={ok} onChange={(e) => setOk(e.target.checked)} /> Acepto recibir correos de Tu Marca
                      </label>
                      <div className="mt-1 flex flex-wrap items-center gap-[18px]">
                        <button type="submit" className="marca-btn bg-marca-cacao text-marca-lima hover:bg-transparent hover:text-marca-cacao">Quiero mi 10%</button>
                        <Dialog.Close className="marca-bk">No, gracias</Dialog.Close>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
