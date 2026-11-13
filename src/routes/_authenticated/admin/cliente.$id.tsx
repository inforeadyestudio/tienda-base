import { CustomerAccountActions } from "@/components/admin/customer-account-actions";
import { PointsKardex } from "@/components/loyalty/points-kardex";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Heart, Loader2, Sparkles, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { formatCOP, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getCustomerEmail } from "@/lib/admin/customer-contact.functions";
import { TeamNotes } from "@/components/admin/team-notes";

export const Route = createFileRoute("/_authenticated/admin/cliente/$id")({
  head: () => ({
    meta: [
      { title: "Perfil de cliente · Tu Marca" },
      { name: "description", content: "Perfil, pedidos y fidelización de una clienta de Tu Marca." },
      { property: "og:title", content: "Perfil de cliente · Tu Marca" },
      { property: "og:description", content: "Perfil, pedidos y fidelización de una clienta de Tu Marca." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomerProfile,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", reserved: "Reservado", paid: "Pagado", preparing: "Preparando",
  shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", refunded: "Reembolsado",
};

function daysSince(iso?: string | null) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "hoy";
  if (d === 1) return "1 día";
  if (d < 31) return `${d} días`;
  const m = Math.round(d / 30);
  return m < 12 ? `${m} meses` : `${Math.round(d / 365)} años`;
}

function orderEta(o: any): string | null {
  if (o.status === "delivered") return "Entregado";
  if (o.status === "cancelled" || o.status === "refunded") return null;
  if (o.b2b_ship_eta) return formatDate(o.b2b_ship_eta);
  if (!o.created_at) return null;
  const d = new Date(o.created_at);
  d.setDate(d.getDate() + 5);
  return formatDate(d.toISOString());
}

function Card({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-ink/10 rounded-2xl">
      {title && (
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink/5">
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function CustomerProfile() {
  const { id } = Route.useParams();
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin", "customer", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, company_name, phone, document_id, address, created_at")
        .eq("id", id).maybeSingle();
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["admin", "customer-orders", id],
    queryFn: async () => {
      const data = await fetchAll((from, to) => supabase
        .from("orders")
        .select(`id, number, status, source, total_cop, created_at, contact_name, contact_email, contact_phone, ship_to, b2b_ship_eta,
          order_items(id, qty, unit_price_cop, product_name, variant_label, product_variants(products(hero_image_url)))`)
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
      return (data ?? []) as any[];
    },
  });

  const { data: points = [] } = useQuery({
    queryKey: ["crm-customer-points", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("loyalty_transactions")
        .select("id, kind, points, channel, note, created_at")
        .eq("user_id", id).order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: wishlistCount = 0 } = useQuery({
    queryKey: ["admin", "customer-wishlist", id],
    queryFn: async () => {
      const { count } = await supabase.from("wishlists").select("variant_id", { count: "exact", head: true }).eq("user_id", id);
      return count ?? 0;
    },
  });

  const { data: shopifyHistory } = useQuery({
    queryKey: ["admin", "customer-shopify", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("shopify_customers")
        .select("total_spent, orders_count, tags, note, accepts_email_marketing, created_at")
        .eq("user_id", id)
        .maybeSingle();
      return data as any;
    },
  });

  const balance = useMemo(
    () => points.reduce((a, t: any) => a + (t.kind === "redeem" ? -Math.abs(t.points) : Math.abs(t.points)), 0),
    [points],
  );

  const valid = orders.filter((o) => o.status !== "cancelled" && o.status !== "draft");
  const spent = valid.reduce((a, o) => a + (o.total_cop ?? 0), 0);
  const last = orders[0];
  const contact = last ?? {};
  const name = profile?.full_name || contact.contact_name || "Cliente";
  const ship = (contact.ship_to ?? {}) as Record<string, any>;
  const since = daysSince(profile?.created_at ?? orders[orders.length - 1]?.created_at);
  const group = valid.length >= 3 ? "Fieles" : valid.length >= 1 ? "Activos" : "Sin compras";

  if (isLoading) {
    return <div className="p-10 text-sm text-moss/60 flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Cargando cliente…</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <Link to="/admin/clientes" className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-moss/70 hover:text-ink mb-2">
        <ArrowLeft className="size-3.5" /> Clientes
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5">
          <User className="size-5 text-moss" />
          <h1 className="font-serif text-3xl md:text-4xl text-ink">{name}</h1>
        </div>
        <CustomerAccountActions userId={id} name={String(name)} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 bg-white border border-ink/10 rounded-2xl divide-y sm:divide-y-0 sm:divide-x divide-ink/10 mb-5">
        <Stat label="Importe gastado" value={formatCOP(spent)} />
        <Stat label="Pedidos" value={String(valid.length)} />
        <Stat label="Cliente desde" value={since ?? "—"} />
        <Stat label="Grupo" value={group} />
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="space-y-5">
          <Card
            title="Último pedido realizado"
            action={last ? <Link to="/admin/pedido/$id" params={{ id: last.id }} className="text-xs text-moss hover:text-ink underline">Ver pedido</Link> : undefined}
          >
            {last ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg text-ink">#{last.number}</span>
                    <span className="px-2.5 py-1 rounded-full bg-ink/5 text-[11px] text-moss">
                      {STATUS_LABEL[last.status] ?? last.status}
                    </span>
                  </div>
                  <span className="text-lg text-ink">{formatCOP(last.total_cop ?? 0)}</span>
                </div>
                <p className="text-xs text-moss/70 mt-1">
                  {formatDate(last.created_at)} · desde {last.source === "pos" ? "Tienda física" : last.source === "ecom" ? "Tienda online" : "Venta asistida"}
                </p>
                <div className="divide-y divide-ink/5 mt-3 border-t border-ink/5">
                  {(last.order_items ?? []).map((it: any) => (
                    <div key={it.id} className="flex items-center gap-4 py-3">
                      <div className="size-12 rounded-lg bg-ink/5 overflow-hidden shrink-0">
                        {it.product_variants?.products?.hero_image_url && (
                          <img src={it.product_variants.products.hero_image_url} alt="" className="size-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink truncate">{it.product_name}</p>
                        <p className="text-[11px] text-moss/60">{it.variant_label || "—"}</p>
                      </div>
                      <p className="text-xs text-moss">× {it.qty}</p>
                      <p className="text-sm text-ink">{formatCOP((it.unit_price_cop ?? 0) * (it.qty ?? 1))}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-moss/60">Todavía no tiene pedidos.</p>
            )}
          </Card>

          <Card title={`Todos los pedidos (${orders.length})`}>
            <div className="-my-1 divide-y divide-ink/5">
              {orders.map((o) => {
                const items = (o.order_items ?? []) as any[];
                const thumb = items.find((it) => it.product_variants?.products?.hero_image_url)?.product_variants?.products?.hero_image_url;
                const open = expandedOrder === o.id;
                const eta = orderEta(o);
                return (
                  <div key={o.id} className="py-3">
                    <button type="button" onClick={() => setExpandedOrder(open ? null : o.id)}
                      className="flex w-full items-center gap-3 text-left hover:opacity-80">
                      <div className="size-11 rounded-lg bg-ink/5 overflow-hidden shrink-0">
                        {thumb && <img src={thumb} alt="" className="size-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink">#{o.number}</p>
                        <p className="text-[11px] text-moss/60">{formatDate(o.created_at)} · {STATUS_LABEL[o.status] ?? o.status} · {items.length} {items.length === 1 ? "prenda" : "prendas"}</p>
                      </div>
                      <p className="text-sm text-ink shrink-0">{formatCOP(o.total_cop ?? 0)}</p>
                      <ChevronDown className={`size-4 text-moss/60 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && (
                      <div className="mt-3 ml-14 space-y-3">
                        <p className="text-xs text-moss">
                          {eta ? <>Llegada estimada: <span className="text-ink">{eta}</span></> : "Sin fecha estimada de llegada."}
                        </p>
                        <div className="divide-y divide-ink/5 border-t border-ink/5">
                          {items.map((it) => (
                            <div key={it.id} className="flex items-center gap-3 py-2.5">
                              <div className="size-10 rounded-lg bg-ink/5 overflow-hidden shrink-0">
                                {it.product_variants?.products?.hero_image_url && (
                                  <img src={it.product_variants.products.hero_image_url} alt="" className="size-full object-cover" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-ink truncate">{it.product_name}</p>
                                <p className="text-[11px] text-moss/60">{it.variant_label || "—"}</p>
                              </div>
                              <p className="text-xs text-moss">× {it.qty}</p>
                              <p className="text-sm text-ink">{formatCOP((it.unit_price_cop ?? 0) * (it.qty ?? 1))}</p>
                            </div>
                          ))}
                        </div>
                        <Link to="/admin/pedido/$id" params={{ id: o.id }} className="inline-block text-xs text-moss hover:text-ink underline">
                          Ver pedido completo
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
              {orders.length === 0 && <p className="text-sm text-moss/60 py-3">Sin pedidos registrados.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <ContactCard userId={id} profile={profile} fallbackEmail={contact.contact_email} fallbackPhone={contact.contact_phone} ship={ship} />

          <StoreCredit userId={id} balance={balance} transactions={points} />

          <Card title="Wishlist">
            <p className="flex items-center gap-2 text-sm text-moss">
              <Heart className="size-4" /> {wishlistCount} producto{wishlistCount === 1 ? "" : "s"} guardado{wishlistCount === 1 ? "" : "s"}
            </p>
          </Card>

          {shopifyHistory && (
            <Card title="Historial Online Nacional">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-moss/60">Compras previas</p>
                  <p className="text-xl text-ink mt-1">{shopifyHistory.orders_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-moss/60">Total histórico</p>
                  <p className="text-xl text-ink mt-1">{formatCOP(Number(shopifyHistory.total_spent ?? 0))}</p>
                </div>
              </div>
              <p className="text-xs text-moss/70 mt-3">
                {shopifyHistory.accepts_email_marketing ? "Acepta correos de marketing" : "No acepta correos de marketing"}
              </p>
              {shopifyHistory.tags && (
                <>
                  <p className="text-[11px] uppercase tracking-widest text-moss/60 mt-3 mb-1">Etiquetas</p>
                  <div className="flex flex-wrap gap-1">
                    {String(shopifyHistory.tags).split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                      <span key={t} className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-ink/5 text-ink/70">{t}</span>
                    ))}
                  </div>
                </>
              )}
              {shopifyHistory.note && (
                <>
                  <p className="text-[11px] uppercase tracking-widest text-moss/60 mt-3 mb-1">Notas</p>
                  <p className="text-sm text-moss whitespace-pre-line">{shopifyHistory.note}</p>
                </>
              )}
            </Card>
          )}
          <TeamNotes entityType="customer" entityId={id} label={`la ficha de ${name}`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] uppercase tracking-widest text-moss/60">{label}</p>
      <p className="text-xl text-ink mt-1">{value}</p>
    </div>
  );
}

function StoreCredit({ userId, balance, transactions }: { userId: string; balance: number; transactions: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const give = useMutation({
    mutationFn: async () => {
      const pts = Number(amount);
      if (!pts) throw new Error("Escribe cuántos puntos quieres dar o quitar");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("loyalty_transactions").insert({
        user_id: userId,
        kind: pts > 0 ? "adjust" : "redeem",
        points: Math.abs(Math.round(pts)),
        channel: "manual",
        note: note.trim() || "Ajuste manual",
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Puntos actualizados");
      setAmount(""); setNote(""); setOpen(false);
      qc.invalidateQueries({ queryKey: ["crm-customer-points", userId] }); qc.invalidateQueries({ queryKey: ["points-kardex", userId] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudieron actualizar los puntos"),
  });

  return (
    <Card
      title="Crédito en tienda"
      action={<button onClick={() => setOpen((v) => !v)} className="text-xs text-moss hover:text-ink underline">{open ? "Cerrar" : "Editar"}</button>}
    >
      <p className="flex items-center gap-2 text-2xl text-ink"><Sparkles className="size-4 text-moss" />{balance} <span className="text-sm text-moss/70">puntos</span></p>
      {open && (
        <div className="mt-4 space-y-2">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            placeholder="Puntos (usa negativo para restar)"
            className="w-full bg-white border border-ink/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-ink/40" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo (opcional)"
            className="w-full bg-white border border-ink/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-ink/40" />
          <button onClick={() => give.mutate()} disabled={give.isPending}
            className="rounded-full bg-ink text-ivory px-5 py-2 text-xs disabled:opacity-50">
            {give.isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
      <div className="mt-4 border-t border-ink/5 pt-2">
        <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-1">Historial de puntos</p>
        <PointsKardex userId={userId} admin />
      </div>
    </Card>
  );
}

function ContactCard({ userId, profile, fallbackEmail, fallbackPhone, ship }: {
  userId: string; profile: any; fallbackEmail?: string; fallbackPhone?: string; ship: Record<string, any>;
}) {
  const qc = useQueryClient();
  const fetchEmail = useServerFn(getCustomerEmail);
  const { data: emailData } = useQuery({
    queryKey: ["admin", "customer-email", userId],
    queryFn: () => fetchEmail({ data: { id: userId } }),
  });
  const { data: addr } = useQuery({
    queryKey: ["admin", "customer-address", userId],
    queryFn: async () => {
      const { data } = await supabase.from("addresses").select("*").eq("user_id", userId)
        .order("is_default", { ascending: false }).order("created_at", { ascending: false }).limit(1);
      return (data?.[0] ?? null) as any;
    },
  });
  const email = emailData?.email || fallbackEmail || null;
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const start = () => {
    setF({
      full_name: profile?.full_name ?? "",
      company_name: profile?.company_name ?? "",
      document_id: profile?.document_id ?? "",
      phone: profile?.phone ?? fallbackPhone ?? "",
      line1: addr?.line1 ?? ship.line1 ?? profile?.address ?? "",
      line2: addr?.line2 ?? ship.line2 ?? "",
      city: addr?.city ?? ship.city ?? "",
      department: addr?.department ?? ship.department ?? "",
      country: addr?.country ?? ship.country ?? "Colombia",
    });
    setEditing(true);
  };
  const save = useMutation({
    mutationFn: async () => {
      const t = (k: string) => (f[k] ?? "").trim().slice(0, 200) || null;
      const { error } = await supabase.from("profiles").update({
        full_name: t("full_name"), company_name: t("company_name"), document_id: t("document_id"), phone: t("phone"), address: t("line1"),
      }).eq("id", userId);
      if (error) throw error;
      if (t("line1") && t("city")) {
        const row: any = {
          recipient: t("full_name") ?? "Cliente", phone: t("phone"), line1: t("line1")!, line2: t("line2"),
          city: t("city")!, department: t("department"), country: t("country") ?? "Colombia", is_default: true,
        };
        const q = addr?.id
          ? supabase.from("addresses").update(row).eq("id", addr.id)
          : supabase.from("addresses").insert({ ...row, user_id: userId, label: "Principal" });
        const { error: e2 } = await q;
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("Información actualizada");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin", "customer", userId] });
      qc.invalidateQueries({ queryKey: ["admin", "customer-address", userId] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });

  const a = addr ?? (ship.line1 ? ship : null);
  const field = (k: string, label: string) => (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-moss/60">{label}</span>
      <input value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} maxLength={200}
        className="mt-1 w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-ink/40" />
    </label>
  );

  return (
    <Card title="Información de contacto"
      action={!editing ? <button onClick={start} className="text-xs text-moss hover:text-ink underline">Editar</button> : undefined}>
      <p className="text-[11px] uppercase tracking-widest text-moss/60 mb-1">Correo</p>
      {email ? <a href={`mailto:${email}`} className="text-sm text-ink underline decoration-ink/20 break-all">{email}</a>
        : <p className="text-sm text-moss/60">Sin correo</p>}
      {editing ? (
        <div className="mt-4 space-y-3">
          {field("full_name", "Nombre")}
          {field("company_name", "Nombre de la empresa")}
          <div className="grid grid-cols-2 gap-3">{field("document_id", "Cédula / NIT")}{field("phone", "Teléfono")}</div>
          {field("line1", "Dirección")}
          {field("line2", "Apto, torre, barrio")}
          <div className="grid grid-cols-2 gap-3">{field("city", "Ciudad")}{field("department", "Departamento")}</div>
          {field("country", "País")}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(false)} className="rounded-full px-4 py-2 text-xs text-moss hover:text-ink">Cancelar</button>
            <button onClick={() => save.mutate()} disabled={save.isPending}
              className="rounded-full bg-ink text-ivory px-5 py-2 text-xs disabled:opacity-50">
              {save.isPending ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {profile?.company_name && <>
            <p className="text-[11px] uppercase tracking-widest text-moss/60 mt-4 mb-1">Empresa</p>
            <p className="text-sm text-moss">{profile.company_name}</p>
          </>}
          <p className="text-[11px] uppercase tracking-widest text-moss/60 mt-4 mb-1">Teléfono</p>
          <p className="text-sm text-moss">{profile?.phone || fallbackPhone || "—"}</p>
          <p className="text-[11px] uppercase tracking-widest text-moss/60 mt-4 mb-1">Cédula / NIT</p>
          <p className="text-sm text-moss">{profile?.document_id || "—"}</p>
          <p className="text-[11px] uppercase tracking-widest text-moss/60 mt-4 mb-1">Dirección predeterminada</p>
          {a || profile?.address ? (
            <address className="not-italic text-sm text-moss leading-relaxed">
              {a?.line1 ?? profile?.address}<br />
              {a?.line2 && <>{a.line2}<br /></>}
              {[a?.city, a?.department].filter(Boolean).join(", ")}
              {a?.country && <><br />{a.country}</>}
            </address>
          ) : <p className="text-sm text-moss/60">Sin dirección guardada</p>}
        </>
      )}
    </Card>
  );
}
