import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";

const KEY = "tb-cookie-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(KEY); } catch { /* noop */ }
    if (stored) return;
    const t = window.setTimeout(() => setVisible(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  const answer = (value: "accepted" | "declined") => {
    try { window.localStorage.setItem(KEY, value); } catch { /* noop */ }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          role="dialog"
          aria-label="Aviso de cookies"
          className="fixed bottom-4 left-4 right-4 z-[55] mx-auto w-auto max-w-sm rounded-md border border-foreground/10 bg-background p-4 shadow-lg md:left-6 md:right-auto md:mx-0"
        >
          <p className="text-xs leading-relaxed text-muted-foreground">
            Usamos cookies propias y de terceros para mejorar tu experiencia y
            analizar el tráfico. Conoce más en nuestra{" "}
            <Link to="/privacidad" className="underline underline-offset-2 hover:text-foreground">
              política de datos
            </Link>
            .
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => answer("accepted")}
              className="flex-1 rounded-sm bg-foreground px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-background transition-opacity hover:opacity-85"
            >
              Aceptar
            </button>
            <button
              onClick={() => answer("declined")}
              className="flex-1 rounded-sm border border-foreground/20 px-3 py-2 text-[11px] uppercase tracking-widest text-foreground/70 transition-colors hover:border-foreground/50 hover:text-foreground"
            >
              Rechazar
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
