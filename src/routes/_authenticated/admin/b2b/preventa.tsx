import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { B2BMatrix } from "@/components/admin/b2b-matrix";
import { PreventaSelection } from "@/components/admin/preventa-selection";

export const Route = createFileRoute("/_authenticated/admin/b2b/preventa")({
  head: () => ({ meta: [
    { title: "Preventa y Matriz B2B + B2C · Tu Marca" },
    { name: "description", content: "Gestiona la selección de preventa y la matriz de cortes, cupos y pedidos B2B de Tu Marca." },
    { property: "og:title", content: "Preventa y Matriz B2B + B2C · Tu Marca" },
    { property: "og:description", content: "Gestiona la selección de preventa y la matriz de cortes, cupos y pedidos B2B de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: PreventaPage,
});

function PreventaPage() {
  const [tab, setTab] = useState<"seleccion" | "matriz">("seleccion");
  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación</p>
        <h1 className="mt-1 font-serif text-4xl italic">Preventa</h1>
        <p className="mt-2 max-w-2xl text-sm text-moss">Elige una colección y define el cupo por talla de cada referencia. Estos cupos son el Tope preventa de la Matriz B2B + B2C.</p>
      </header>
      <div className="mb-6 flex gap-2">
        {([["seleccion", "Selección de preventa"], ["matriz", "Matriz B2B + B2C"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={"rounded-full px-4 py-2 text-xs " + (tab === k ? "bg-ink text-ivory" : "border border-ink/10 bg-white text-ink/70")}>{l}</button>
        ))}
      </div>
      {tab === "matriz" ? <B2BMatrix /> : <PreventaSelection />}
    </div>
  );
}
