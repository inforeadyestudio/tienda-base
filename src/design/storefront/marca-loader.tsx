// Pantalla de carga de Tu Marca: el isotipo se va llenando de abajo hacia arriba mientras carga la página.
// Al terminar, el ojo parpadea y la pantalla sube. Solo presentación: mide lo que el navegador ya está cargando
// (imágenes y fuentes de la página); no consulta datos.
// - Primera carga: aparece desde el HTML del servidor y se va cuando la página terminó de cargar.
// - Al cambiar de página no aparece aquí: la espera del router muestra BrandLoaderView (mismo isotipo), así hay una sola.
import { useEffect, useRef, useState } from "react";
import { ISO_PUPIL, ISO_SWIRL, ISO_VIEWBOX } from "@/design/sections/marca/shared";

let booted = false; // la primera carga ya pasó en esta pestaña

const MIN_MS = 700; // que alcance a verse, sin frenar una página lenta
const MAX_MS = 4500; // nunca tapa la página más de esto

/** El isotipo que se llena (con `loop`, se llena una y otra vez). Lo usa también BrandLoaderView. */
export function IsoFill({ pct, loop }: { pct: number; loop: boolean }) {
  return (
    <span className="marca-load-iso" aria-hidden="true">
      <svg viewBox={ISO_VIEWBOX} className="marca-load-base"><path d={ISO_SWIRL} /><path d={ISO_PUPIL} /></svg>
      <span className={loop ? "marca-load-fill is-loop" : "marca-load-fill"} style={loop ? undefined : { clipPath: `inset(${100 - pct}% 0 0 0)` }}>
        <svg viewBox={ISO_VIEWBOX}><path d={ISO_SWIRL} /><path className="marca-load-pu" d={ISO_PUPIL} /></svg>
      </span>
    </span>
  );
}

export function MarcaLoader() {
  const [boot, setBoot] = useState(() => !booted);
  const [js, setJs] = useState(false);
  const [pct, setPct] = useState(6);
  const [out, setOut] = useState(false);
  const shown = useRef(6);

  // primera carga: progreso real de imágenes y fuentes de la página
  useEffect(() => {
    if (!boot) return;
    setJs(true);
    const t0 = performance.now();
    let doneAt = 0;
    let timer = 0;
    const tick = () => {
      const imgs = Array.from(document.images).filter((i) => i.loading !== "lazy");
      const ready = imgs.filter((i) => i.complete).length;
      const fonts = (document as any).fonts?.status === "loaded" ? 1 : 0;
      const complete = document.readyState === "complete";
      const elapsed = performance.now() - t0;
      const target = complete ? 100 : 12 + 70 * (imgs.length ? ready / imgs.length : 1) + 8 * fonts;
      // sube suave hacia la meta y nunca baja
      shown.current = Math.min(100, Math.max(shown.current, shown.current + (target - shown.current) * 0.35 + 0.6));
      if ((complete && elapsed > MIN_MS) || elapsed > MAX_MS) shown.current = 100;
      setPct(Math.round(shown.current));
      if (shown.current >= 100) {
        if (!doneAt) doneAt = performance.now();
        if (performance.now() - doneAt > 380) {
          setOut(true);
          booted = true;
          timer = window.setTimeout(() => setBoot(false), 700);
          return;
        }
      }
      timer = window.setTimeout(tick, 90);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [boot]);

  if (boot) {
    return (
      <div className={`marca marca-loader${js ? " is-js" : ""}${out ? " is-out" : ""}${pct >= 100 ? " is-full" : ""}`} role="status" aria-live="polite">
        <div className="grid justify-items-center gap-4">
          <IsoFill pct={pct} loop={false} />
          <span className="marca-mono marca-mono-soft tabular-nums">{js ? `${String(pct).padStart(3, "0")}%` : "Cargando"}</span>
        </div>
        <span className="sr-only">Cargando Tu Marca</span>
      </div>
    );
  }
  return null;
}
