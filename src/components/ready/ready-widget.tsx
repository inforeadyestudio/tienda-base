import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mic, MicOff, X, ArrowUp, Minus } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useReady } from "./ready-context";
import { ReadyResults } from "./ready-results";

/** Saludo inicial según la página del admin donde se abre el chat. */
const PAGE_GREETING: Array<[string, string]> = [
  ["/admin/tienda/pedidos", "Estás en Pedidos de la tienda. ¿Revisamos los pendientes o buscamos uno en específico?"],
  ["/admin/tienda/productos", "Estás en Productos de la tienda. ¿Buscamos una prenda por nombre o SKU?"],
  ["/admin/tienda/colecciones", "Estás en Colecciones. ¿Te ayudo con la experiencia editorial de alguna?"],
  ["/admin/tienda/cambios", "Estás en Cambios y devoluciones. ¿Revisamos las solicitudes pendientes?"],
  ["/admin/tienda/clientes", "Estás en Clientes. ¿Buscamos a alguien o revisamos sus pedidos?"],
  ["/admin/tienda/promociones", "Estás en Promociones. ¿Te cuento cómo crear o ajustar un descuento?"],
  ["/admin/tienda/estadisticas", "Estás en Estadísticas. ¿Quieres un resumen de ventas o tráfico?"],
  ["/admin/tienda/configuracion", "Estás en Configuración de la tienda. ¿Qué quieres ajustar?"],
  ["/admin/tienda", "Estás en el admin de la Tienda online. ¿Qué revisamos: productos, pedidos o promociones?"],
  ["/admin/b2b/pedidos", "Estás en Pedidos B2B. ¿Miramos los preliminares o los despachos?"],
  ["/admin/b2b/preventa", "Estás en la Preventa. ¿Revisamos cupos por talla o clientes?"],
  ["/admin/b2b/envios", "Estás en Control de envíos. ¿Vemos qué va en tránsito o por confirmar?"],
  ["/admin/b2b/devoluciones", "Estás en Devoluciones B2B. ¿Registramos una o revisamos las abiertas?"],
  ["/admin/b2b/inventario", "Estás en Inventario B2B. ¿Consultamos stock de Bodega Central o consignación?"],
  ["/admin/b2b/solicitudes", "Estás en Solicitudes Wholesale. ¿Revisamos las pendientes?"],
  ["/admin/b2b", "Estás en el admin B2B. ¿Pedidos, preventa o envíos?"],
  ["/admin/inventario", "Estás en Inventario. ¿Consultamos stock de una prenda o revisamos las unidades bajas?"],
  ["/admin/conteo", "Estás en Conteo físico. ¿Te explico cómo hacer una toma o revisamos diferencias?"],
  ["/admin/productos", "Estás en Productos. ¿Buscamos uno por nombre o SKU, con precios y stock?"],
  ["/admin/pedidos", "Estás en Pedidos. ¿Miramos los nacionales, B2B o internacionales?"],
  ["/admin/traslados", "Estás en Traslados. ¿Hay alguno pendiente de aprobar o recibir?"],
  ["/admin/bodegas", "Estás en Bodegas. ¿Repasamos las reglas omnicanal de alguna?"],
  ["/admin/cambios", "Estás en Cambios. ¿Revisamos las solicitudes de las clientas?"],
  ["/admin/clientes", "Estás en Clientes. ¿Buscamos a alguien en el CRM?"],
  ["/admin/estadisticas", "Estás en Estadísticas. ¿Quieres un resumen de ventas por canal?"],
  ["/admin/control-financiero", "Estás en Control financiero. ¿Revisamos ingresos por canal?"],
  ["/admin/configuracion", "Estás en Configuración. ¿Usuarios, facturación o pasarelas?"],
  ["/admin", "Estás en el Sales Hub. ¿Qué revisamos: ventas, inventario o pedidos?"],
  ["/pos", "Estás en el POS. ¿Consultamos el stock de la tienda o los pedidos por despachar?"],
];

function greetingFor(pathname: string): string {
  const hit = PAGE_GREETING.find(([prefix]) => pathname.startsWith(prefix));
  return hit?.[1] ?? "¿En qué te ayudo? Puedo responder sobre los módulos del admin, productos, inventario y pedidos.";
}

const STATUS_LABEL: Record<string, string> = {
  idle: "Disponible",
  listening: "Escuchando",
  thinking: "Pensando",
  speaking: "Hablando",
};

export function ReadyWidget() {
  const {
    open,
    setOpen,
    status,
    voiceActive,
    voiceMode,
    messages,
    actions,
    error,
    send,
    startVoice,
    stopVoice,
    setDictationHandler,
  } = useReady();
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement | null>(null);
  const [minimized, setMinimized] = useState(false);
  // Por ahora el chat solo vive en el panel de administración para entrenarlo.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const visible = pathname.startsWith("/admin");

  /** El dictado escribe en el campo de texto; Tu Marca responde por texto. */
  useEffect(() => {
    setDictationHandler((text) => setDraft(text.slice(0, 2000)));
    return () => setDictationHandler(null);
  }, [setDictationHandler]);

  useEffect(() => {
    if (!open) {
      setMinimized(false);
      stopVoice();
    }
  }, [open, stopVoice]);

  const toggleVoice = () => {
    if (voiceActive) { stopVoice(); return; }
    void startVoice("dictate");
  };

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, actions]);

  if (!visible) return null;

  return (
    <>
      <AnimatePresence>
        {!open ? (
          <motion.button
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            onClick={() => setOpen(true)}
            className="group fixed right-0 top-1/2 z-50 grid h-11 -translate-y-1/2 translate-x-[calc(100%-2.75rem)] grid-cols-[2.75rem_auto] items-center overflow-hidden border border-r-0 border-ink/15 bg-background/95 text-[9px] uppercase tracking-[0.14em] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.4)] backdrop-blur transition-[transform,color,background-color] duration-300 ease-out hover:translate-x-0 hover:bg-ink hover:text-ivory focus-visible:translate-x-0 sm:h-12 sm:translate-x-[calc(100%-3rem)] sm:grid-cols-[3rem_auto] sm:text-[11px] sm:tracking-[0.18em]"
            aria-label="Hablar con Tu Marca"
          >
            <span aria-hidden className="grid size-full place-items-center border-r border-current/15 text-sm">✦</span>
            <span className="whitespace-nowrap px-4">Hablar con Tu Marca</span>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open && minimized ? (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed right-4 top-1/2 z-50 flex -translate-y-1/2 items-center gap-3 rounded-full border border-ink/12 bg-background/95 px-3 py-2 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.45)] backdrop-blur sm:right-6"
            role="status"
          >
            <button
              onClick={() => setMinimized(false)}
              className="flex items-center gap-2"
              aria-label="Abrir chat de Tu Marca"
            >
              <span className="relative flex size-2">
                {voiceActive ? <span className="absolute inline-flex size-2 animate-ping rounded-full bg-ink/40" /> : null}
                <span className="inline-flex size-2 rounded-full bg-ink" />
              </span>
              <span className="text-[9px] uppercase tracking-[0.16em]">{STATUS_LABEL[status] ?? "Tu Marca"}</span>
            </button>
            <button
              onClick={toggleVoice}
              aria-label={voiceActive ? "Terminar voz" : "Hablar por voz"}
              className="p-1 text-muted-foreground"
            >
              {voiceActive ? <MicOff className="size-4" /> : <Mic className="size-4" />}
            </button>
            <button
              onClick={() => {
                stopVoice();
                setOpen(false);
              }}
              aria-label="Cerrar"
              className="p-1 text-muted-foreground"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {open && !minimized ? (
          <motion.aside
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed bottom-4 right-4 left-4 z-50 flex max-h-[72dvh] flex-col overflow-hidden rounded-[18px] border border-ink/12 bg-background shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)] sm:left-auto sm:bottom-6 sm:right-6 sm:h-[620px] sm:max-h-[calc(100dvh-3rem)] sm:w-[400px] sm:rounded-[4px]"
            role="dialog"
            aria-label="Asistente Tu Marca de Tu Marca"
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <p className="font-nm text-sm uppercase tracking-[0.2em]">Tu Marca</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {voiceActive ? "Dictando" : (STATUS_LABEL[status] ?? "Disponible")}
                </p>
              </div>
              <div className="relative flex items-center gap-1">
                <button
                  onClick={toggleVoice}
                  className="p-2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={voiceActive ? "Terminar voz" : "Hablar por voz"}
                >
                  {voiceActive ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </button>
                <button
                  onClick={() => setMinimized(true)}
                  className="p-2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Minimizar"
                >
                  <Minus className="size-4" />
                </button>
                <button
                  onClick={() => {
                    stopVoice();
                    setOpen(false);
                  }}
                  className="p-2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Cerrar"
                >
                  <X className="size-4" />
                </button>
              </div>
            </header>

            <div ref={scroller} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {!messages.length ? (
                <p className="max-w-[26ch] font-nm text-2xl leading-tight">
                  {greetingFor(pathname)}
                </p>
              ) : null}
              {messages.map((m, i) => (
                <p
                  key={i}
                  className={
                    m.role === "user"
                      ? "whitespace-pre-wrap text-right text-[13px] leading-relaxed text-muted-foreground"
                      : "whitespace-pre-wrap text-[14px] leading-relaxed"
                  }
                >
                  {m.content}
                </p>
              ))}
              <ReadyResults actions={actions} />
              {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const text = draft;
                setDraft("");
                void send(text);
              }}
              className="flex items-center gap-2 border-t border-border px-5 py-4"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={voiceActive && voiceMode === "dictate" ? "Dictando… habla y lo escribo" : "Escríbeme…"}
                aria-label="Mensaje para Tu Marca"
                className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!draft.trim() || status === "thinking"}
                className="border border-ink/20 p-2 transition-colors hover:bg-ink hover:text-ivory disabled:opacity-30"
                aria-label="Enviar"
              >
                <ArrowUp className="size-4" />
              </button>
            </form>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}
