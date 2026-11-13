import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Columns2, GalleryHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function useProductView(initialView: string) {
  const { pathname } = useLocation();
  const canSwitch = pathname === "/" || pathname === "/home" || pathname.startsWith("/coleccion/") || pathname.startsWith("/tipo/");
  const [choice, setChoice] = useState<"grid" | "carousel" | null>(null);
  return { canSwitch, view: canSwitch ? choice ?? (initialView === "carousel" ? "carousel" : "grid") : initialView, setView: setChoice };
}

export function ProductViewToggle({ view, onChange }: { view: string; onChange: (view: "grid" | "carousel") => void }) {
  return (
    <div role="group" aria-label="Vista de productos" className="flex justify-start gap-1 mb-5">
      <Button type="button" variant="ghost" size="icon" aria-label="Ver en dos columnas" title="Dos columnas" aria-pressed={view === "grid"} onClick={() => onChange("grid")} className="rounded-none text-inherit aria-pressed:bg-cream aria-pressed:text-ink aria-pressed:ring-1 aria-pressed:ring-ink/20">
        <Columns2 className="size-5" />
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label="Ver en carrusel" title="Carrusel" aria-pressed={view === "carousel"} onClick={() => onChange("carousel")} className="rounded-none text-inherit aria-pressed:bg-cream aria-pressed:text-ink aria-pressed:ring-1 aria-pressed:ring-ink/20">
        <GalleryHorizontal className="size-5" />
      </Button>
    </div>
  );
}