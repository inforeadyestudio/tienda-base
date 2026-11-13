import { Users } from "lucide-react";
import { useLiveVisitors } from "@/lib/use-live-visitors";

export function LiveVisitorsMetric() {
  const { count, connected } = useLiveVisitors(false);
  return (
    <section aria-label="Visitantes activos ahora" className="border border-border bg-card rounded-lg p-5 max-w-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm text-muted-foreground">Visitantes activos ahora</h2>
        <Users className="size-4 text-moss" aria-hidden="true" />
      </div>
      <div className="mt-2 text-3xl tabular-nums font-nm">{count === null ? "—" : count.toLocaleString("es-CO")}</div>
      <p className="mt-2 text-xs text-muted-foreground">{connected ? "En vivo · toda la tienda" : "Conectando…"}</p>
    </section>
  );
}