import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { B2BTopBar } from "@/components/b2b/b2b-topbar";
import { currencyForCountry, formatMoney } from "@/lib/b2b/portal";

export const Route = createFileRoute("/_authenticated/b2b/perfil")({
  head: () => ({
    meta: [
      { title: "Mi perfil mayorista · Tu Marca" },
      { name: "description", content: "Edita tus datos, dirección y consulta tu historial de pedidos B2B." },
      { property: "og:title", content: "Mi perfil mayorista · Tu Marca" },
      { property: "og:description", content: "Edita tus datos, dirección y consulta tu historial de pedidos B2B." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BProfile,
});

const COUNTRIES = ["Colombia", "Panamá", "Estados Unidos", "México", "Ecuador", "Perú", "Chile", "Costa Rica", "España", "Otro"];

const STATUS: Record<string, string> = {
  draft: "Borrador", reserved: "Pendiente", paid: "Pagado", preparing: "Preparando",
  shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", refunded: "Reembolsado",
};

const input = "mt-1 w-full px-4 py-3 rounded-2xl border border-ink/15 bg-white text-sm outline-none focus:border-ink";
const label = "block text-[10px] uppercase tracking-widest text-ink/50";

function B2BProfile() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ full_name: "", company_name: "", phone: "", line1: "", city: "", country: "Colombia", postal_code: "" });

  const { data } = useQuery({
    queryKey: ["b2b-profile"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      const uid = s.session?.user.id;
      if (!uid) return null;
      const [{ data: p }, { data: a }, { data: orders }] = await Promise.all([
        supabase.from("profiles").select("full_name, company_name, phone").eq("id", uid).maybeSingle(),
        supabase.from("addresses").select("id, line1, city, country, postal_code").eq("user_id", uid).order("is_default", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("orders").select("id, number, status, created_at, total_cop, total_usd:total_usd_exact, currency, b2b_mode").eq("customer_id", uid).order("created_at", { ascending: false }).limit(50),
      ]);
      return { uid, email: s.session?.user.email ?? "", p, a, orders: orders ?? [] };
    },
  });

  useEffect(() => {
    if (!data) return;
    setF({
      full_name: data.p?.full_name ?? "",
      company_name: (data.p as any)?.company_name ?? "",
      phone: data.p?.phone ?? "",
      line1: data.a?.line1 ?? "",
      city: data.a?.city ?? "",
      country: data.a?.country ?? "Colombia",
      postal_code: data.a?.postal_code ?? "",
    });
  }, [data]);

  const save = async () => {
    if (!data) return;
    if (!f.full_name.trim()) return toast.error("El nombre es obligatorio");
    if (!f.line1.trim() || !f.city.trim()) return toast.error("Completa dirección y ciudad");
    setBusy(true);
    try {
      const { error: pe } = await supabase.from("profiles").update({
        full_name: f.full_name.trim().slice(0, 120),
        company_name: f.company_name.trim().slice(0, 120) || null,
        phone: f.phone.trim().slice(0, 40) || null,
      } as any).eq("id", data.uid);
      if (pe) throw pe;
      const addr = {
        user_id: data.uid,
        recipient: (f.company_name.trim() || f.full_name.trim()).slice(0, 120),
        phone: f.phone.trim() || null,
        line1: f.line1.trim().slice(0, 200),
        city: f.city.trim().slice(0, 80),
        country: f.country,
        postal_code: f.postal_code.trim().slice(0, 20) || null,
        is_default: true,
      };
      const { error: ae } = data.a?.id
        ? await supabase.from("addresses").update(addr).eq("id", data.a.id)
        : await supabase.from("addresses").insert(addr);
      if (ae) throw ae;
      toast.success("Perfil actualizado");
      qc.invalidateQueries({ queryKey: ["b2b-profile"] });
      qc.invalidateQueries({ queryKey: ["b2b-my-currency"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  const cur = currencyForCountry(f.country) ?? "USD";

  return (
    <>
      <B2BTopBar />
      <div className="px-5 md:px-10 py-8 max-w-5xl">
        <p className="text-[10px] tracking-[0.22em] text-ink/50">MI CUENTA</p>
        <h1 className="font-nm text-3xl md:text-4xl mt-2">Perfil</h1>

        <section className="mt-8 bg-white rounded-3xl border border-ink/10 p-6 md:p-8">
          <div className="grid md:grid-cols-2 gap-4">
            <label className={label}>Nombre<input className={input} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
            <label className={label}>Empresa<input className={input} value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></label>
            <label className={label}>Correo<input className={input + " bg-ink/5"} value={data?.email ?? ""} disabled /></label>
            <label className={label}>Teléfono<input className={input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
            <label className={label + " md:col-span-2"}>Dirección<input className={input} value={f.line1} onChange={(e) => setF({ ...f, line1: e.target.value })} /></label>
            <label className={label}>Ciudad<input className={input} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></label>
            <label className={label}>País
              <select className={input} value={COUNTRIES.includes(f.country) ? f.country : "Otro"} onChange={(e) => setF({ ...f, country: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className={label}>Código postal<input className={input} value={f.postal_code} onChange={(e) => setF({ ...f, postal_code: e.target.value })} /></label>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink/60">Verás los precios en {cur === "COP" ? "pesos colombianos (COP)" : "dólares (USD)"}.</p>
            <button onClick={save} disabled={busy} className="px-7 py-3 rounded-full bg-ink text-ivory text-xs uppercase tracking-widest disabled:opacity-50">
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-nm text-xl">Historial de pedidos</h2>
            <Link to="/b2b/pedidos" className="text-xs text-ink/60 hover:text-ink">Ver todos →</Link>
          </div>
          <div className="bg-white rounded-3xl border border-ink/10 divide-y divide-ink/8">
            {(data?.orders ?? []).length === 0 && <p className="p-6 text-sm text-ink/50">Aún no tienes pedidos.</p>}
            {(data?.orders ?? []).map((o: any) => (
              <div key={o.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-mono">#{o.number}</p>
                  <p className="text-xs text-ink/50">{new Date(o.created_at).toLocaleDateString("es-CO")} · {o.b2b_mode === "restock" ? "Restock" : "Preventa"}</p>
                </div>
                <span className="text-xs px-3 py-1 rounded-full bg-ink/5">{STATUS[o.status] ?? o.status}</span>
                <span className="font-mono">{o.currency === "USD" ? formatMoney(o.total_usd ?? 0, "USD") : formatMoney(o.total_cop ?? 0, "COP")}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
