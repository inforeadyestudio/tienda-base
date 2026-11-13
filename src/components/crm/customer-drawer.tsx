import { PointsKardex } from "@/components/loyalty/points-kardex";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatDate } from "@/lib/format";
import type { CrmCustomer } from "@/lib/crm/customers";
import { grantB2BAccess } from "@/lib/b2b/admin.functions";
import { B2BAccountForm } from "@/components/admin/b2b-account-form";
import { X, Gift, Heart, ShoppingBag, Sparkles, Store } from "lucide-react";
import { toast } from "sonner";
import { SITE_ORIGIN } from "@/lib/site";

type Tab = "resumen" | "compras" | "wishlist" | "regalos" | "puntos";

const TABS: { id: Tab; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "compras", label: "Compras" },
  { id: "wishlist", label: "Wishlist" },
  { id: "regalos", label: "Listas de regalo" },
  { id: "puntos", label: "Puntos" },
];

export function CustomerDrawer({ customer, onClose }: { customer: CrmCustomer; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("resumen");
  const uid = customer.userId;

  const { data: profile } = useQuery({
    queryKey: ["crm-customer-profile", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, document_id, address")
        .eq("id", uid!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["crm-customer-orders", customer.key],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, number, total_cop, status, source, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      q = uid
        ? q.eq("customer_id", uid)
        : customer.email
          ? q.eq("contact_email", customer.email)
          : q.eq("contact_phone", customer.phone ?? "___");
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: wishlist = [] } = useQuery({
    queryKey: ["crm-customer-wishlist", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wishlists")
        .select("variant_id, created_at, product_variants(sku, size, color, price_cop, products(name, slug, hero_image_url))")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: giftLists = [] } = useQuery({
    queryKey: ["crm-customer-gifts", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_lists")
        .select("id, title, slug, occasion, event_date, is_public, gift_list_items(id, qty_wanted, purchased_qty)")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: points = [] } = useQuery({
    queryKey: ["crm-customer-points", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_transactions")
        .select("id, kind, points, channel, note, created_at")
        .eq("user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const balance = useMemo(
    () =>
      points.reduce(
        (acc, t: any) => acc + (t.kind === "redeem" ? -Math.abs(t.points) : Math.abs(t.points)),
        0,
      ),
    [points],
  );

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-ivory overflow-y-auto">
        <div className="sticky top-0 bg-ivory/95 backdrop-blur border-b border-ink/10 px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-moss/70">Cliente</div>
            {uid ? (
              <Link to="/admin/cliente/$id" params={{ id: uid }} className="text-2xl mt-1 block underline decoration-ink/20 hover:decoration-ink">
                {customer.name || "Sin nombre"}
              </Link>
            ) : (
              <div className="text-2xl mt-1">{customer.name || "Sin nombre"}</div>
            )}
            <div className="text-xs text-moss mt-1">
              {[customer.email, customer.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}
            </div>
          </div>
          <button onClick={onClose} className="size-9 rounded-full hover:bg-ink/5 flex items-center justify-center">
            <X className="size-4" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex gap-1 bg-white border border-ink/10 rounded-full p-1 w-fit overflow-x-auto max-w-full">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-xs px-4 py-1.5 rounded-full whitespace-nowrap transition ${
                  tab === t.id ? "bg-ink text-ivory" : "text-ink/70 hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {!uid && tab !== "resumen" && tab !== "compras" && (
            <p className="text-sm text-moss/70">
              Este contacto no tiene cuenta registrada, por eso no tiene wishlist, listas de regalo ni puntos.
            </p>
          )}

          {tab === "resumen" && (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <Stat icon={<ShoppingBag className="size-4" />} label="Pedidos" value={String(orders.length)} />
                <Stat icon={<ShoppingBag className="size-4" />} label="Total comprado" value={formatCOP(customer.total)} />
                <Stat icon={<Sparkles className="size-4" />} label="Puntos disponibles" value={uid ? String(balance) : "—"} />
                <Stat icon={<Heart className="size-4" />} label="Wishlist" value={uid ? String(wishlist.length) : "—"} />
                <Stat icon={<Gift className="size-4" />} label="Listas de regalo" value={uid ? String(giftLists.length) : "—"} />
                <Stat label="Última compra" value={customer.last ? formatDate(customer.last) : "—"} />
                <Stat label="Cédula / documento" value={(profile as any)?.document_id || "—"} />
                <Stat label="Dirección" value={(profile as any)?.address || "—"} />
              </div>
              <B2BAccessPanel customer={customer} documentId={(profile as any)?.document_id || ""} />
            </>
          )}

          {tab === "compras" && (
            <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
              {orders.map((o: any) => (
                <Link
                  key={o.id}
                  to="/admin/pedido/$id"
                  params={{ id: o.id }}
                  className="flex items-center justify-between gap-3 px-4 py-3 border-b border-ink/5 last:border-0 hover:bg-ink/[0.03]"
                >
                  <div>
                    <div className="text-sm">#{o.number}</div>
                    <div className="text-[11px] text-moss">{formatDate(o.created_at)} · {o.source} · {o.status}</div>
                  </div>
                  <div className="text-sm">{formatCOP(o.total_cop ?? 0)}</div>
                </Link>
              ))}
              {orders.length === 0 && <Empty>Sin compras registradas.</Empty>}
            </div>
          )}

          {tab === "wishlist" && uid && (
            <div className="grid sm:grid-cols-2 gap-3">
              {wishlist.map((w: any) => (
                <div key={w.variant_id} className="bg-white border border-ink/10 rounded-2xl p-3 flex gap-3">
                  {w.product_variants?.products?.hero_image_url && (
                    <img
                      src={w.product_variants.products.hero_image_url}
                      alt={w.product_variants.products.name}
                      className="size-16 object-cover rounded-xl"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm truncate">{w.product_variants?.products?.name ?? "Producto"}</div>
                    <div className="text-[11px] text-moss">
                      {[w.product_variants?.size, w.product_variants?.color].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-xs mt-1">{formatCOP(w.product_variants?.price_cop ?? 0)}</div>
                  </div>
                </div>
              ))}
              {wishlist.length === 0 && <Empty>Sin productos guardados.</Empty>}
            </div>
          )}

          {tab === "regalos" && uid && (
            <div className="space-y-3">
              {giftLists.map((g: any) => {
                const items = g.gift_list_items ?? [];
                const wanted = items.reduce((a: number, i: any) => a + (i.qty_wanted ?? 0), 0);
                const bought = items.reduce((a: number, i: any) => a + (i.purchased_qty ?? 0), 0);
                return (
                  <div key={g.id} className="bg-white border border-ink/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm">{g.title}</div>
                        <div className="text-[11px] text-moss">
                          {[g.occasion, g.event_date ? formatDate(g.event_date) : null].filter(Boolean).join(" · ") || "Sin ocasión"}
                        </div>
                      </div>
                      <a
                        href={`${SITE_ORIGIN}/regalos/${g.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] underline text-moss"
                      >
                        Ver lista
                      </a>
                    </div>
                    <div className="text-[11px] text-moss mt-2">
                      {bought} de {wanted} regalos comprados · {g.is_public ? "Enlace activo" : "Enlace apagado"}
                    </div>
                  </div>
                );
              })}
              {giftLists.length === 0 && <Empty>Sin listas de regalo.</Empty>}
            </div>
          )}

          {tab === "puntos" && uid && (
            <PointsPanel userId={uid} balance={balance} transactions={points as any[]} />
          )}
        </div>
      </div>
    </div>
  );
}

function PointsPanel({
  userId,
  balance,
  transactions,
}: {
  userId: string;
  balance: number;
  transactions: any[];
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const give = useMutation({
    mutationFn: async () => {
      const pts = Number(amount);
      if (!pts || pts <= 0) throw new Error("Escribe cuántos puntos quieres regalar");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("loyalty_transactions").insert({
        user_id: userId,
        kind: "adjust",
        points: Math.round(pts),
        channel: "manual",
        note: note.trim() || "Puntos de regalo",
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Puntos agregados");
      setAmount("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["crm-customer-points", userId] }); qc.invalidateQueries({ queryKey: ["points-kardex", userId] });
      qc.invalidateQueries({ queryKey: ["loyalty-transactions"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudieron agregar los puntos"),
  });

  return (
    <div className="space-y-4">
      <div className="bg-white border border-ink/10 rounded-2xl p-5">
        <div className="text-[10px] uppercase tracking-widest text-moss/70">Puntos disponibles</div>
        <div className="text-3xl mt-1">{balance}</div>
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl p-5 space-y-3">
        <div className="text-sm">Regalar puntos</div>
        <div className="grid sm:grid-cols-[140px_1fr] gap-3">
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Puntos"
            className="bg-white border border-ink/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-ink/40"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Motivo (opcional)"
            className="bg-white border border-ink/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-ink/40"
          />
        </div>
        <button
          onClick={() => give.mutate()}
          disabled={give.isPending}
          className="rounded-full bg-ink text-ivory px-6 py-2 text-xs disabled:opacity-50"
        >
          {give.isPending ? "Guardando…" : "Regalar puntos"}
        </button>
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl p-4">
        <div className="text-sm mb-2">Historial de puntos</div>
        <PointsKardex userId={userId} admin />
      </div>
    </div>
  );
}

function B2BAccessPanel({ customer, documentId }: { customer: CrmCustomer; documentId: string }) {
  const qc = useQueryClient();
  const grant = useServerFn(grantB2BAccess);
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const uid = customer.userId;

  const give = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("Este contacto no tiene cuenta registrada");
      return grant({ data: { userId: uid, company: company.trim() || undefined } });
    },
    onSuccess: (r) => {
      toast.success(r.already ? "Ya tenía acceso al portal B2B" : "Acceso al portal B2B activado");
      setOpen(false);
      setCompany("");
      qc.invalidateQueries({ queryKey: ["b2b-user-ids"] });
      qc.invalidateQueries({ queryKey: ["global-crm"] });
      qc.invalidateQueries({ queryKey: ["admin-b2b-accounts"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo dar el acceso"),
  });

  if (customer.isB2B)
    return (
      <div className="bg-moss/10 border border-moss/20 rounded-2xl px-4 py-3 text-xs text-moss flex items-center gap-2">
        <Store className="size-3.5" /> Este cliente ya tiene acceso al portal B2B.
      </div>
    );

  // Sin cuenta registrada: crear la cuenta B2B con sus datos ya conocidos.
  if (!uid)
    return (
      <div className="bg-white border border-ink/10 rounded-2xl p-4">
        <div className="text-[10px] uppercase tracking-widest text-moss/70 flex items-center gap-1.5">
          <Store className="size-3.5" /> Portal B2B
        </div>
        <p className="text-xs text-ink/60 mt-1 mb-3">
          Este contacto no tiene cuenta. Créala con sus datos y quedará con acceso al portal mayorista.
        </p>
        <B2BAccountForm
          label="Crear cuenta B2B con estos datos"
          defaults={{
            email: customer.email ?? "",
            fullName: customer.name === "Venta mostrador" ? "" : customer.name,
            phone: customer.phone ?? "",
            documentId,
          }}
        />
      </div>
    );

  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-moss/70 flex items-center gap-1.5">
        <Store className="size-3.5" /> Portal B2B
      </div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-2 rounded-full bg-ink text-ivory px-5 py-2 text-xs hover:bg-moss"
        >
          Dar acceso al portal B2B
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            autoFocus
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nombre de la empresa (opcional)"
            className="w-full border border-ink/15 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-ink/40"
          />
          <div className="flex gap-2">
            <button
              onClick={() => give.mutate()}
              disabled={give.isPending}
              className="rounded-full bg-ink text-ivory px-5 py-2 text-xs disabled:opacity-50"
            >
              {give.isPending ? "Activando…" : "Activar acceso"}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-full border border-ink/15 px-5 py-2 text-xs">
              Cancelar
            </button>
          </div>
          <p className="text-[11px] text-ink/50">
            Entra en /auth con el correo de su cuenta y su clave actual, y llegará a su portal B2B.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-moss/70 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="text-xl mt-1">{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-6 py-10 text-center text-sm text-moss/60">{children}</div>;
}
