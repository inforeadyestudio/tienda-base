import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DataBar } from "@/components/analytics/shopify-charts";
import { fetchAll } from "@/lib/fetch-all";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const STEP_LABELS: Record<string, string> = {
  details: "En sus datos",
  delivery: "En la entrega",
  payment: "En el pago",
};

const REASON_LABELS: Record<string, string> = {
  envio: "El costo de envío",
  metodo_pago: "No encontró su método de pago",
  talla: "Dudas con la talla",
  mirando: "Solo estaba mirando",
  mas_tarde: "Lo compra más tarde",
  otro: "Otro motivo",
};

type Row = { label: string; value: number };

/** Salidas del checkout por paso y motivos declarados por la clienta. */
export function AbandonSummary({ from, to, live = false }: { from: string; to: string; live?: boolean }) {
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ["checkout-abandon", from, to, live],
    staleTime: 0,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
    queryFn: async () => {
      // Los periodos abiertos deben incluir eventos posteriores a la apertura del panel.
      const end = live ? new Date().toISOString() : to;
      const data = await fetchAll((offset, last) => supabase
        .from("analytics_events")
        .select("id, name, payload, created_at")
        .in("name", ["checkout_exit_intent", "checkout_exit_recovered", "checkout_abandon_reason"])
        .gte("created_at", from)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, last));
      const steps: Record<string, number> = {};
      const reasons: Record<string, number> = {};
      let intents = 0;
      let recovered = 0;
      let notes: string[] = [];
      let lastReasonAt: string | null = null;
      let lastIntentAt: string | null = null;
      (data ?? []).forEach((row: any) => {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const step = String(payload.step ?? "");
        if (row.name === "checkout_exit_intent") { intents += 1; lastIntentAt ??= row.created_at; if (step) steps[step] = (steps[step] ?? 0) + 1; }
        if (row.name === "checkout_exit_recovered") recovered += 1;
        if (row.name === "checkout_abandon_reason") {
          lastReasonAt ??= row.created_at;
          const reason = String(payload.reason ?? "otro");
          reasons[reason] = (reasons[reason] ?? 0) + 1;
          if (typeof payload.note === "string" && payload.note.trim()) notes.push(payload.note.trim());
        }
      });
      notes = notes.slice(0, 8);
      const toRows = (map: Record<string, number>, labels: Record<string, string>): Row[] =>
        Object.entries(map).map(([key, value]) => ({ label: labels[key] ?? key, value })).sort((a, b) => b.value - a.value);
      return { intents, recovered, notes, lastReasonAt, lastIntentAt, steps: toRows(steps, STEP_LABELS), reasons: toRows(reasons, REASON_LABELS) };
    },
  });

  const intents = data?.intents ?? 0;
  const recovered = data?.recovered ?? 0;
  const maxStep = Math.max(1, ...(data?.steps ?? []).map((r) => r.value));
  const totalReasons = (data?.reasons ?? []).reduce((sum, r) => sum + r.value, 0);

  return (
    <section className="bg-card rounded-2xl border border-ink/10 p-5" aria-busy={isFetching}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm uppercase tracking-[0.18em] text-ink/50">Abandono del checkout</h2>
        <Button variant="ghost" size="icon" aria-label="Actualizar abandono del checkout" title="Actualizar" disabled={isFetching} onClick={() => { void refetch(); }}>
          <RefreshCw className={isFetching ? "animate-spin motion-reduce:animate-none" : ""} />
        </Button>
      </div>
      {isError && <p role="alert" className="text-sm text-destructive mb-4">No pudimos actualizar los abandonos. Intenta actualizar de nuevo.</p>}
      {isPending ? <p className="text-sm text-ink/50">Cargando abandonos…</p> : <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <Stat label="Intentaron salir" value={intents.toLocaleString("es-CO")} />
        <Stat label="Volvieron a la compra" value={recovered.toLocaleString("es-CO")} />
        <Stat label="Recuperación" value={intents ? `${((recovered / intents) * 100).toFixed(1)}%` : "—"} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-xs uppercase tracking-[0.16em] text-ink/40 mb-3">Dónde se van</h3>
          {(data?.steps ?? []).length === 0 ? <p className="text-sm text-ink/40">Sin datos aún.</p> : (
            <div className="space-y-3">
              {(data?.steps ?? []).map((row) => (
                <div key={row.label} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 text-sm text-ink/70">{row.label}</div>
                  <div className="flex-1 h-3 bg-data-pale rounded-full overflow-hidden"><DataBar width={(row.value / maxStep) * 100} /></div>
                  <div className="w-10 text-right text-sm tabular-nums">{row.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs uppercase tracking-[0.16em] text-ink/40 mb-3">Motivos</h3>
          <p className="text-xs text-ink/50 mb-3">{totalReasons} respuestas recibidas{data?.lastReasonAt ? ` · Última respuesta: ${formatEventDate(data.lastReasonAt)}` : ""}</p>
          {(data?.reasons ?? []).length === 0 ? <p className="text-sm text-ink/40">Sin respuestas aún.</p> : (
            <ul className="space-y-2">
              {(data?.reasons ?? []).map((row) => (
                <li key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-ink/70">{row.label}</span>
                  <span className="tabular-nums">{row.value} <span className="text-ink/40">{totalReasons ? `${((row.value / totalReasons) * 100).toFixed(0)}%` : ""}</span></span>
                </li>
              ))}
            </ul>
          )}
          {(data?.notes ?? []).length > 0 && (
            <div className="mt-4 space-y-2">
              {(data?.notes ?? []).map((note, index) => (
                <p key={index} className="rounded-md bg-ink/5 px-3 py-2 text-xs text-ink/70">“{note}”</p>
              ))}
            </div>
          )}
        </div>
      </div>
      {data?.lastIntentAt && <p className="text-xs text-ink/50 mt-4">Último intento de salida: {formatEventDate(data.lastIntentAt)}</p>}
      </>}
    </section>
  );
}

function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink/10 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-ink/40">{label}</p>
      <p className="mt-1 text-lg tabular-nums">{value}</p>
    </div>
  );
}
