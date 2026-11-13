import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";
import { Search, Boxes, Pencil, Trash2, PlusCircle, ArrowLeftRight } from "lucide-react";

type Entry = {
  id: string;
  at: string;
  actor: string | null;
  kind: "inventario" | "cambio";
  action: string;
  title: string;
  detail: string;
};

const ENTITY_LABELS: Record<string, string> = {
  products: "Producto",
  product_variants: "Variante",
  inventory_levels: "Existencias",
  locations: "Bodega / tienda",
  transfers: "Traslado",
  transfer_items: "Línea de traslado",
  collections: "Colección",
  promotions: "Promoción",
  preventa_rules: "Regla de preventa",
  pos_offers: "Oferta POS",
  user_roles: "Rol de usuario",
  app_settings: "Ajuste",
};

const MOVEMENT_LABELS: Record<string, string> = {
  sale: "Venta",
  reservation: "Reserva",
  release: "Liberación",
  adjustment: "Ajuste",
  transfer_out: "Salida por traslado",
  transfer_in: "Entrada por traslado",
  count: "Conteo",
};

const ACTION_LABELS: Record<string, string> = {
  insert: "Creación",
  update: "Edición",
  delete: "Eliminación",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  if (typeof v === "object") return JSON.stringify(v).slice(0, 40);
  return String(v);
}

function describeDiff(diff: unknown): string {
  if (!diff || typeof diff !== "object") return "";
  const d = diff as Record<string, unknown>;
  if (d["new"] || d["old"]) {
    const row = (d["new"] ?? d["old"]) as Record<string, unknown>;
    const label = row?.["name"] ?? row?.["title"] ?? row?.["sku"] ?? row?.["code"] ?? row?.["key"];
    return label ? String(label) : "";
  }
  return Object.entries(d)
    .slice(0, 4)
    .map(([k, v]) => {
      const c = v as { from?: unknown; to?: unknown };
      return `${k}: ${fmt(c?.from)} → ${fmt(c?.to)}`;
    })
    .join(" · ");
}

export function ActivityLog() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"todo" | "inventario" | "cambio">("todo");

  const { data: audits, isLoading: la } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: async () => {
      return await fetchAll((from, to) => supabase
        .from("audit_log")
        .select("id, actor_id, action, entity, entity_id, diff, created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });

  const { data: moves, isLoading: lm } = useQuery({
    queryKey: ["admin-inventory-log"],
    queryFn: async () => {
      return await fetchAll((from, to) => supabase
        .from("inventory_movements")
        .select(
          "id, kind, qty, note, ref_type, actor_id, created_at, locations(name), product_variants(sku, size, color, products(name))",
        )
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["admin-profiles-lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name");
      if (error) throw error;
      return data;
    },
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles ?? []) if (p.full_name) m.set(p.id, p.full_name);
    return m;
  }, [profiles]);

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    for (const a of audits ?? []) {
      const entity = ENTITY_LABELS[a.entity] ?? a.entity;
      list.push({
        id: `a-${a.id}`,
        at: a.created_at,
        actor: a.actor_id ? nameById.get(a.actor_id) ?? null : null,
        kind: "cambio",
        action: ACTION_LABELS[a.action] ?? a.action,
        title: entity,
        detail: describeDiff(a.diff),
      });
    }
    for (const m of moves ?? []) {
      const v = m.product_variants as
        | { sku: string; size: string | null; color: string | null; products: { name: string } | null }
        | null;
      const loc = (m.locations as { name: string } | null)?.name ?? "—";
      const variant = [v?.size, v?.color].filter(Boolean).join(" / ");
      list.push({
        id: `m-${m.id}`,
        at: m.created_at,
        actor: m.actor_id ? nameById.get(m.actor_id) ?? null : null,
        kind: "inventario",
        action: MOVEMENT_LABELS[m.kind] ?? m.kind,
        title: `${v?.products?.name ?? "Producto"}${variant ? ` · ${variant}` : ""}`,
        detail: `${m.qty > 0 ? "+" : ""}${m.qty} en ${loc}${v?.sku ? ` · ${v.sku}` : ""}${m.note ? ` · ${m.note}` : ""}`,
      });
    }
    return list.sort((x, y) => (x.at < y.at ? 1 : -1));
  }, [audits, moves, nameById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (tab !== "todo" && e.kind !== tab) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        (e.actor ?? "").toLowerCase().includes(q)
      );
    });
  }, [entries, query, tab]);

  const loading = la || lm;
  const { pageItems: filteredPage, pager: filteredPager } = usePaged(filtered);

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white p-1">
          {(["todo", "inventario", "cambio"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.15em] transition-colors ${
                tab === t ? "bg-ink text-ivory" : "text-ink/55 hover:text-ink"
              }`}
            >
              {t === "todo" ? "Todo" : t === "inventario" ? "Inventario" : "Ediciones"}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el registro…"
            className="pl-10 pr-4 py-2.5 rounded-full border border-ink/15 bg-white text-sm w-72 outline-none focus:border-ink"
          />
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-ink/10 bg-white overflow-hidden">
        {loading && <div className="px-6 py-10 text-center text-ink/40 text-sm">Cargando registro…</div>}
        {!loading && filtered.length === 0 && (
          <div className="px-6 py-10 text-center text-ink/40 text-sm">Todavía no hay movimientos registrados.</div>
        )}
        {filteredPage.map((e) => {
          const Icon =
            e.kind === "inventario"
              ? e.action.includes("traslado")
                ? ArrowLeftRight
                : Boxes
              : e.action === "Creación"
                ? PlusCircle
                : e.action === "Eliminación"
                  ? Trash2
                  : Pencil;
          return (
            <div key={e.id} className="flex items-start gap-4 px-6 py-4 border-b border-ink/5 last:border-0 hover:bg-ivory/60">
              <div className="mt-0.5 size-8 rounded-full bg-cream flex items-center justify-center shrink-0">
                <Icon className="size-4 text-ink/60" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-ink/40">{e.action}</span>
                  <span className="text-sm text-ink font-medium truncate">{e.title}</span>
                </div>
                {e.detail && <div className="text-xs text-ink/55 mt-1 break-words">{e.detail}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-ink/60">
                  {new Date(e.at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                </div>
                <div className="text-[11px] text-ink/40">{e.actor ?? "Sistema"}</div>
              </div>
            </div>
          );
        })}
        {filteredPager}
      </div>
    </div>
  );
}
