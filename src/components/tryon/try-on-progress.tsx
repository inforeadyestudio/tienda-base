import { LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

export function TryOnProgress() {
  const reducedMotion = useReducedMotion();
  return (
    <div role="status" className="w-full space-y-3 px-5 py-6">
      <div className="flex items-center gap-2 text-sm text-ink">
        <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
        Generando tu look…
      </div>
      <div role="progressbar" aria-label="Generando tu look" className="h-1.5 overflow-hidden rounded-full bg-ink/10">
        <motion.div className="h-full w-1/3 rounded-full bg-moss" animate={{ x: reducedMotion ? "100%" : ["-100%", "300%"] }} transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity }} />
      </div>
    </div>
  );
}