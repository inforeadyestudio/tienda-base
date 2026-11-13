import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";

export const Route = createFileRoute("/_authenticated/admin/loyalty")({
  head: () => ({
    meta: [
      { title: "Puntos y fidelización · Tu Marca Sales Hub" },
      { name: "description", content: "Configura las reglas de puntos Tu Marca Circle y revisa los canjes de tus clientes." },
    ],
  }),
  component: LoyaltyPage,
});

type LoyaltySettings = {
  enabled: boolean;
  earn_pct: number;
  point_value_cop: number;
  point_value_usd: number;
  min_redeem_points: number;
  max_redeem_pct: number;
  allow_online: boolean;
  allow_pos: boolean;
  expire_days: number;
  review_photo_points: number;
  review_video_points: number;
  sale_no_points: boolean;
};

const DEFAULTS: LoyaltySettings = {
  enabled: true,
  earn_pct: 10,
  point_value_cop: 100,
  point_value_usd: 0.03,
  min_redeem_points: 100,
  max_redeem_pct: 30,
  allow_online: true,
  allow_pos: true,
  expire_days: 0,
  review_photo_points: 5000,
  review_video_points: 25000,
  sale_no_points: false,
};

type Tx = {
  id: string;
  user_id: string;
  order_id: string | null;
  kind: string;
  points: number;
  channel: string;
  note: string | null;
  created_at: string;
};

const CHANNEL_LABEL: Record<string, string> = { online: "Online", pos: "Punto físico", manual: "Manual" };
const KIND_LABEL: Record<string, string> = { earn: "Ganó", redeem: "Redimió", adjust: "Ajuste" };

function LoyaltyPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"reglas" | "historial">("reglas");
  const [form, setForm] = useState<LoyaltySettings>(DEFAULTS);
  const [query, setQuery] = useState("");

  const { data: saved } = useQuery({
    queryKey: ["admin", "loyalty-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", "loyalty").maybeSingle();
      if (error) throw error;
      return { ...DEFAULTS, ...((data?.value ?? {}) as Partial<LoyaltySettings>) };
    },
  });

  useEffect(() => { if (saved) setForm(saved); }, [saved]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "loyalty", value: form as unknown as never }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Reglas de puntos guardadas");
      qc.invalidateQueries({ queryKey: ["admin", "loyalty-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
  });

  const { data: txs, isLoading: txLoading } = useQuery({
    queryKey: ["admin", "loyalty-tx"],
    queryFn: async () => {
      const data = await fetchAll((from, to) => supabase
        .from("loyalty_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
      return data as Tx[];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin", "loyalty-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles ?? []) m.set(p.id, p.full_name ?? "");
    return m;
  }, [profiles]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (txs ?? []).filter((t) => t.kind === "redeem" || t.kind === "earn" || t.kind === "adjust");
    if (!q) return list;
    return list.filter((t) => (nameById.get(t.user_id) ?? t.user_id).toLowerCase().includes(q));
  }, [txs, query, nameById]);
  const { pageItems: pageRows, pager: txPager } = usePaged(rows);

  const redeemed = useMemo(
    () => (txs ?? []).filter((t) => t.kind === "redeem").reduce((s, t) => s + Math.abs(t.points), 0),
    [txs],
  );
  const earned = useMemo(
    () => (txs ?? []).filter((t) => t.kind === "earn").reduce((s, t) => s + t.points, 0),
    [txs],
  );

  return (
    <div className="p-4 md:p-10 max-w-5xl">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Sales Hub</p>
        <h1 className="font-serif text-3xl md:text-4xl mt-1">Puntos y fidelización</h1>
        <p className="text-sm text-ink/60 mt-2">
          Define cuántos puntos gana un cliente por comprar, cuánto puede redimir y dónde. Abajo queda el historial de canjes.
        </p>
      </header>

      <div className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white p-1 mb-8">
        {(["reglas", "historial"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.15em] transition-colors " +
              (tab === t ? "bg-ink text-ivory" : "text-ink/55 hover:text-ink")
            }
          >
            {t === "reglas" ? "Reglas" : "Historial"}
          </button>
        ))}
      </div>

      {tab === "reglas" ? (
        <div className="space-y-4">
          <Card>
            <Toggle
              label="Programa de puntos activo"
              hint="Si lo apagas, nadie acumula ni redime puntos."
              value={form.enabled}
              onChange={(v) => setForm({ ...form, enabled: v })}
            />
          </Card>

          <Card title="Acumulación">
            <NumberField
              label="Porcentaje de la venta que se convierte en puntos (%)"
              value={form.earn_pct}
              onChange={(v) => setForm({ ...form, earn_pct: Math.min(100, Math.max(0, v)) })}
            />
            <NumberField
              label="Los puntos vencen a los (días) — 0 = nunca"
              value={form.expire_days}
              onChange={(v) => setForm({ ...form, expire_days: v })}
            />
            <p className="text-xs text-ink/50 sm:col-span-2">
              Una compra de {formatCOP(200000)} devuelve{" "}
              <strong className="text-ink">{formatCOP(Math.round(200000 * (form.earn_pct || 0) / 100))}</strong> en puntos
              {form.point_value_cop > 0 && (
                <>
                  {" "}(
                  <strong className="text-ink">
                    {Math.floor((200000 * (form.earn_pct || 0)) / 100 / form.point_value_cop)} puntos
                  </strong>
                  )
                </>
              )}
              . Los puntos se registran solos cuando el pedido queda pagado.
            </p>
          </Card>

          <Card title="Canje">
            <NumberField
              label="Valor de 1 punto (COP)"
              value={form.point_value_cop}
              onChange={(v) => setForm({ ...form, point_value_cop: v })}
            />
            <NumberField
              label="Valor de 1 punto (USD)"
              value={form.point_value_usd}
              onChange={(v) => setForm({ ...form, point_value_usd: v })}
            />
            <NumberField
              label="Mínimo de puntos para redimir"
              value={form.min_redeem_points}
              onChange={(v) => setForm({ ...form, min_redeem_points: v })}
            />
            <NumberField
              label="Máximo del pedido que se puede pagar con puntos (%)"
              value={form.max_redeem_pct}
              onChange={(v) => setForm({ ...form, max_redeem_pct: Math.min(100, Math.max(0, v)) })}
            />
            <p className="text-xs text-ink/50 sm:col-span-2">
              {form.min_redeem_points} puntos equivalen a{" "}
              <strong className="text-ink">{formatCOP(form.min_redeem_points * (form.point_value_cop || 0))}</strong> de descuento.
            </p>
          </Card>

          <Card title="Puntos por reseñas">
            <NumberField
              label="Reseña con foto (puntos)"
              value={form.review_photo_points}
              onChange={(v) => setForm({ ...form, review_photo_points: Math.max(0, v) })}
            />
            <NumberField
              label="Reseña con video (puntos)"
              value={form.review_video_points}
              onChange={(v) => setForm({ ...form, review_video_points: Math.max(0, v) })}
            />
            <p className="text-xs text-ink/50 sm:col-span-2">
              Se suman al enviar la reseña desde «Mis pedidos». Una reseña por prenda y pedido; si trae video se da el valor de video.
            </p>
          </Card>

          <Card title="Prendas en Sale">
            <Toggle
              label="Sale sin puntos"
              hint="Si la compra trae prendas con precio tachado, no suma puntos ni se puede pagar con puntos (online y POS)."
              value={form.sale_no_points}
              onChange={(v) => setForm({ ...form, sale_no_points: v })}
            />
          </Card>

          <Card title="¿Dónde pueden redimir?">
            <Toggle
              label="Tienda online"
              hint="Descuento con puntos en el checkout."
              value={form.allow_online}
              onChange={(v) => setForm({ ...form, allow_online: v })}
            />
            <Toggle
              label="Punto físico (POS)"
              hint="Descuento con puntos en la caja de la tienda."
              value={form.allow_pos}
              onChange={(v) => setForm({ ...form, allow_pos: v })}
            />
            {!form.allow_online && !form.allow_pos && (
              <p className="text-xs text-clay sm:col-span-2">Con ambos apagados los clientes acumulan pero no pueden redimir.</p>
            )}
          </Card>

          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex items-center gap-2 bg-ink text-ivory text-[11px] uppercase tracking-[0.2em] px-6 py-3.5 rounded-full hover:opacity-90 disabled:opacity-50"
          >
            <Save className="size-4" /> {save.isPending ? "Guardando…" : "Guardar reglas"}
          </button>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <Stat label="Puntos otorgados" value={earned.toLocaleString("es-CO")} />
            <Stat label="Puntos redimidos" value={redeemed.toLocaleString("es-CO")} />
            <Stat label="Valor redimido" value={formatCOP(redeemed * (form.point_value_cop || 0))} />
          </div>

          <div className="relative mb-4 max-w-sm">
            <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente…"
              className="pl-10 pr-4 py-2.5 w-full rounded-full border border-ink/15 bg-white text-sm outline-none focus:border-ink"
            />
          </div>

          <div className="rounded-3xl border border-ink/10 bg-white overflow-x-auto">
            <table className="w-full text-[13px] min-w-[720px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-ink/40 border-b border-ink/10">
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-4 py-4 font-medium">Movimiento</th>
                  <th className="px-4 py-4 font-medium">Puntos</th>
                  <th className="px-4 py-4 font-medium">Canal</th>
                  <th className="px-4 py-4 font-medium">Nota</th>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {txLoading && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-ink/40">Cargando…</td></tr>
                )}
                {!txLoading && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-ink/40">Todavía no hay movimientos de puntos.</td></tr>
                )}
                {pageRows.map((t) => (
                  <tr key={t.id} className="border-b border-ink/5 last:border-0 hover:bg-ivory/60">
                    <td className="px-6 py-3.5 text-ink">{nameById.get(t.user_id) || `${t.user_id.slice(0, 8)}…`}</td>
                    <td className="px-4 py-3.5">
                      <span className={
                        "text-[10px] uppercase tracking-wide px-2 py-1 rounded-full " +
                        (t.kind === "redeem" ? "bg-ink text-ivory" : "bg-cream text-ink/70")
                      }>
                        {KIND_LABEL[t.kind] ?? t.kind}
                      </span>
                    </td>
                    <td className={"px-4 py-3.5 " + (t.kind === "redeem" ? "text-clay" : "text-ink")}>
                      {t.kind === "redeem" ? "−" : "+"}{Math.abs(t.points)}
                    </td>
                    <td className="px-4 py-3.5 text-ink/60">{CHANNEL_LABEL[t.channel] ?? t.channel}</td>
                    <td className="px-4 py-3.5 text-ink/50">{t.note ?? "—"}</td>
                    <td className="px-6 py-3.5 text-ink/50">{new Date(t.created_at).toLocaleDateString("es-CO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            {txPager}
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-ink/10 bg-white p-5 md:p-6">
      {title && (
        <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40 mb-4">{title}</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.15em] text-ink/50">{label}</span>
      <input
        type="number"
        min={0}
        step="any"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1 w-full border border-ink/15 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-ink bg-transparent"
      />
    </label>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-ink/10 px-4 py-3">
      <div>
        <div className="text-sm text-ink">{label}</div>
        {hint && <div className="text-xs text-ink/50 mt-0.5">{hint}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        aria-pressed={value}
        className={"shrink-0 w-11 h-6 rounded-full transition-colors relative " + (value ? "bg-ink" : "bg-ink/15")}
      >
        <span className={"absolute top-0.5 size-5 rounded-full bg-white transition-all " + (value ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.15em] text-ink/40">{label}</div>
      <div className="font-serif text-2xl text-ink mt-1">{value}</div>
    </div>
  );
}
