import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Search, X, Package, Tag, Users, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AdminSupportPanel } from "@/components/admin/support-panel";

type Result = {
  kind: "producto" | "coleccion" | "cliente";
  title: string;
  subtitle?: string | null;
  to: string;
  params?: Record<string, string>;
};

const KIND_META = {
  producto: { label: "Productos", icon: Package },
  coleccion: { label: "Colecciones", icon: Tag },
  cliente: { label: "Clientes", icon: Users },
} as const;

export function AdminGlobalSearch({ placement = "floating", collapsed = false }: { placement?: "floating" | "sidebar"; collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const inSidebar = placement === "sidebar";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className={inSidebar ? "contents" : "admin-scope absolute top-4 right-4 z-[90] flex items-center gap-2"}>
      <Button
        variant={inSidebar ? "ghost" : "outline"}
        size={inSidebar ? "default" : "icon"}
        onClick={() => setOpen(true)}
        aria-label="Buscar en el admin"
        title="Buscar (⌘K)"
        className={inSidebar
          ? `flex w-[calc(100%-1.5rem)] gap-3 mx-3 py-2.5 h-auto rounded-full text-sm font-normal text-ink/70 hover:bg-sidebar-accent hover:text-ink ${collapsed ? "justify-center px-0" : "justify-start px-4"}`
          : "size-10 rounded-full bg-sidebar border-ink/10 shadow-md text-ink/70 hover:text-ink hover:shadow-lg transition-all"}
      >
        <Search className="size-4" />
        {inSidebar && !collapsed && <span>Buscar</span>}
      </Button>
      <AdminSupportPanel placement={inSidebar ? "sidebar" : "floating"} collapsed={collapsed} />
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <SearchModal onClose={() => setOpen(false)} />,
        document.body,
      )}
    </>
  );
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const [products, variants, collections, orders] = await Promise.all([
        supabase.from("products").select("id, name, slug").ilike("name", like).limit(6),
        supabase.from("product_variants").select("id, sku, products(id, name)").ilike("sku", like).limit(6),
        supabase.from("collections").select("id, title").ilike("title", like).limit(5),
        supabase.from("orders").select("id, number, contact_name, contact_email, contact_phone").or(
          `number.ilike.${like},contact_name.ilike.${like},contact_email.ilike.${like},contact_phone.ilike.${like}`,
        ).limit(8),
      ]);

      const out: Result[] = [];
      const seenProducts = new Set<string>();
      for (const p of products.data ?? []) {
        seenProducts.add(p.id);
        out.push({ kind: "producto", title: p.name, subtitle: p.slug, to: "/admin/productos/$id", params: { id: p.id } });
      }
      for (const v of variants.data ?? []) {
        const prod = (v as any).products;
        if (prod && !seenProducts.has(prod.id)) {
          seenProducts.add(prod.id);
          out.push({ kind: "producto", title: prod.name, subtitle: `SKU ${v.sku}`, to: "/admin/productos/$id", params: { id: prod.id } });
        }
      }
      for (const c of collections.data ?? []) {
        out.push({ kind: "coleccion", title: c.title, to: "/admin/colecciones" });
      }
      const seenClients = new Set<string>();
      for (const o of orders.data ?? []) {
        const key = o.contact_email ?? o.contact_phone ?? o.id;
        if (seenClients.has(key)) continue;
        seenClients.add(key);
        out.push({
          kind: "cliente",
          title: o.contact_name ?? o.contact_email ?? "Cliente",
          subtitle: [o.number, o.contact_email ?? o.contact_phone].filter(Boolean).join(" · "),
          to: "/admin/clientes",
        });
      }
      setResults(out);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const grouped = (["producto", "coleccion", "cliente"] as const)
    .map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);

  const go = (r: Result) => {
    onClose();
    navigate({ to: r.to as "/admin", params: r.params as never });
  };

  return (
    <div className="admin-scope fixed inset-0 z-[110] flex items-start justify-center pt-24 px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 border-b border-ink/10">
          <Search className="size-4 text-ink/40 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca productos, colecciones o clientes…"
            className="flex-1 py-4 bg-transparent outline-none text-sm text-ink placeholder:text-ink/40"
          />
          <button onClick={onClose} aria-label="Cerrar" className="size-8 rounded-full flex items-center justify-center text-ink/50 hover:bg-ink/5">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {q.trim().length < 2 && (
            <div className="px-3 py-8 text-center text-xs text-ink/40">
              Escribe al menos 2 letras. Atajo: ⌘K
            </div>
          )}
          {q.trim().length >= 2 && !loading && results.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-ink/40">Sin resultados para “{q.trim()}”.</div>
          )}
          {grouped.map((g) => {
            const Meta = KIND_META[g.kind];
            return (
              <div key={g.kind} className="mb-2">
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-ink/40">{Meta.label}</div>
                {g.items.map((r, i) => (
                  <button
                    key={`${r.kind}-${i}-${r.title}`}
                    onClick={() => go(r)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-ink/5 transition-colors"
                  >
                    <Meta.icon className="size-4 text-ink/50 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-ink truncate">{r.title}</span>
                      {r.subtitle && <span className="block text-xs text-ink/50 truncate">{r.subtitle}</span>}
                    </span>
                    <ArrowUpRight className="size-3.5 text-ink/30 shrink-0" />
                  </button>
                ))}
              </div>
            );
          })}
          {loading && <div className="px-3 py-4 text-xs text-ink/40">Buscando…</div>}
        </div>
      </div>
    </div>
  );
}
