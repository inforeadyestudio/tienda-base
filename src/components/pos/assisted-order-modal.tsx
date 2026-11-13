import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Search, Truck, X, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";
import { shippingSettingsQuery } from "@/lib/store-settings";
import { shipDelivery } from "@/lib/checkout/engine";

type Line = { variantId: string; productId: string; productName: string; label: string; price: number; qty: number; max: number };

const LOCAL_METHODS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "datafono", label: "Datáfono" },
] as const;

/**
 * Pedido con envío a domicilio creado desde el POS (venta asistida).
 * Solo vende stock de la bodega Ecommerce; no descuenta nada de la tienda.
 */
export function AssistedOrderModal({
  onClose,
  session,
  storeLocationId,
  storeName,
  initialVariant,
}: {
  initialVariant?: { id: string; productId: string; productName: string; size: string | null; color: string | null; sku: string; price_cop: number } | null;
  onClose: () => void;
  session: { id: string; sellerId: string } | null;
  storeLocationId: string;
  storeName: string;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    initialVariant
      ? [{ variantId: initialVariant.id, productId: initialVariant.productId, productName: initialVariant.productName, label: [initialVariant.color, initialVariant.size].filter(Boolean).join(" · ") || initialVariant.sku, price: initialVariant.price_cop, qty: 1, max: 99 }]
      : [],
  );
  const [form, setForm] = useState({ name: "", document: "", phone: "", email: "", line1: "", city: "", department: "" });
  const [payMode, setPayMode] = useState<"local" | "remote">("local");
  const [localMethod, setLocalMethod] = useState<(typeof LOCAL_METHODS)[number]["id"]>("efectivo");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const { data: shipping } = useQuery(shippingSettingsQuery());

  const { data: results } = useQuery({
    queryKey: ["assisted-ecom-stock", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const term = q.trim();
      const sel = "id, sku, size, color, price_cop, products!inner(id, name, status), inventory_levels!inner(on_hand, reserved, locations!inner(kind))";
      const base = () => supabase.from("product_variants").select(sel).eq("active", true).eq("inventory_levels.locations.kind", "ecom").limit(40);
      const [byName, bySku] = await Promise.all([base().ilike("products.name", `%${term}%`), base().ilike("sku", `%${term}%`)]);
      if (byName.error) throw byName.error;
      const map = new Map<string, any>();
      [...(byName.data ?? []), ...(bySku.data ?? [])].forEach((v: any) => map.set(v.id, v));
      return Array.from(map.values());
    },
  });

  const options = useMemo(
    () =>
      ((results ?? []) as any[])
        .map((v) => ({
          v,
          stock: (v.inventory_levels ?? []).reduce((s: number, l: any) => s + Math.max(0, l.on_hand - l.reserved), 0),
        }))
        .filter((o) => o.stock > 0),
    [results],
  );

  const add = (v: any, stock: number) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variantId === v.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Math.min(stock, next[i].qty + 1) };
        return next;
      }
      return [
        ...prev,
        {
          variantId: v.id,
          productId: v.products?.id,
          productName: v.products?.name ?? "Producto",
          label: [v.color, v.size].filter(Boolean).join(" · ") || v.sku,
          price: v.price_cop ?? 0,
          qty: 1,
          max: stock,
        },
      ];
    });
  };

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const delivery = shipDelivery(
    subtotal,
    shipping,
    lines.map((l) => ({ productId: l.productId, qty: l.qty })) as any,
    "Colombia",
    form.department,
  );
  const total = subtotal + delivery.cost;
  const valid = lines.length > 0 && form.name && form.document && form.phone && form.line1 && form.city;

  const submit = async () => {
    if (!valid) return toast.error("Completa los datos de la clienta y agrega prendas.");
    if (payMode === "local" && !session) return toast.error("Abre la caja para cobrar en tienda.");
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const notes = payMode === "local" ? `Pagado en ${storeName} · Pendiente de despacho` : `Venta asistida ${storeName} · Cobro remoto`;
      const { data: order, error: oe } = await supabase
        .from("orders")
        .insert({
          source: "assisted",
          status: "draft",
          currency: "COP",
          buyer_country: "Colombia",
          payment_status: payMode === "local" ? "paid" : "pending",
          payment_method: payMode === "local" ? `pos_${localMethod}` : "transferencia",
          subtotal_cop: subtotal,
          shipping_cop: delivery.cost,
          total_cop: total,
          contact_name: form.name,
          contact_email: form.email || null,
          contact_phone: form.phone,
          ship_to: { line1: form.line1, city: form.city, department: form.department, country: "Colombia", document: form.document },
          notes,
          sold_by_location_id: storeLocationId,
          sold_by_user_id: session?.sellerId ?? auth.user?.id ?? null,
          pos_session_id: payMode === "local" ? session?.id ?? null : null,
        } as any)
        .select("id, number")
        .single();
      if (oe) throw oe;
      const { error: ie } = await supabase.from("order_items").insert(
        lines.map((l) => ({
          order_id: order.id,
          variant_id: l.variantId,
          product_name: l.productName,
          variant_label: l.label,
          qty: l.qty,
          unit_price_cop: l.price,
        })),
      );
      if (ie) throw ie;
      const minutes = payMode === "local" ? 5 : 60 * 48;
      const { error: re } = await supabase.rpc("reserve_stock", { _order_id: order.id, _minutes: minutes, _channel: "online" });
      if (re) throw new Error("No hay stock suficiente en Ecommerce.");
      if (payMode === "local") {
        const { error: ce } = await supabase.rpc("confirm_order", { _order_id: order.id });
        if (ce) throw ce;
        const { error: pe } = await supabase
          .from("pos_sales")
          .insert({ session_id: session!.id, order_id: order.id, method: localMethod, amount_cop: total });
        if (pe) throw pe;
        toast.success(`Pedido ${order.number} pagado en tienda · pasa a despacho de Ecommerce`);
        onClose();
      } else {
        setLink(`${window.location.origin}/gracias/${order.id}`);
        toast.success(`Pedido ${order.number} creado · comparte el enlace de pago`);
      }
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el pedido");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-ivory p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Venta asistida · {storeName}</p>
            <h2 className="font-serif text-3xl italic">Pedido con envío a domicilio</h2>
            <p className="mt-1 text-xs text-moss">Se despacha desde la bodega Ecommerce. No descuenta inventario de la tienda.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        {link ? (
          <div className="space-y-4">
            <p className="text-sm">Envía este enlace a la clienta. Allí ve los datos de transferencia y sube el comprobante; el pedido se despacha cuando se confirme el pago.</p>
            <div className="flex items-center gap-2 rounded-xl border border-ink/15 bg-white p-3 text-sm">
              <span className="flex-1 truncate font-mono">{link}</span>
              <button onClick={() => { navigator.clipboard.writeText(link); toast.success("Enlace copiado"); }} className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs text-ivory">
                <Copy className="size-3.5" /> Copiar
              </button>
            </div>
            <div className="flex justify-center">
              <img alt="QR de pago" className="h-48 w-48 rounded-xl bg-white p-2" src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`} />
            </div>
            <button onClick={onClose} className="w-full rounded-full bg-ink py-3 text-sm text-ivory">Listo</button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-moss/70">Clienta</p>
              <input className={input} placeholder="Nombre completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input className={input} placeholder="Cédula" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
                <input className={input} placeholder="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <input className={input} placeholder="Correo (opcional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className={input} placeholder="Dirección" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input className={input} placeholder="Ciudad" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <input className={input} placeholder="Departamento" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>

              <p className="pt-2 text-[10px] uppercase tracking-widest text-moss/70">Forma de pago</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPayMode("local")} className={"rounded-xl border px-3 py-2.5 text-left text-xs " + (payMode === "local" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white")}>
                  <span className="block font-medium">Cobrar aquí en tienda</span>
                  <span className="opacity-70">Entra a la caja de {storeName}</span>
                </button>
                <button onClick={() => setPayMode("remote")} className={"rounded-xl border px-3 py-2.5 text-left text-xs " + (payMode === "remote" ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white")}>
                  <span className="block font-medium">Cobro remoto</span>
                  <span className="opacity-70">Enlace / QR para la clienta</span>
                </button>
              </div>
              {payMode === "local" && (
                <div className="flex gap-2">
                  {LOCAL_METHODS.map((m) => (
                    <button key={m.id} onClick={() => setLocalMethod(m.id)} className={"rounded-full border px-3 py-1.5 text-xs " + (localMethod === m.id ? "border-ink bg-ink/5" : "border-ink/15")}>
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-moss/70">Prendas disponibles en Ecommerce</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/40" />
                <input className={input + " pl-9"} placeholder="Buscar por nombre o SKU" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {options.length > 0 && (
                <ul className="max-h-40 divide-y divide-ink/5 overflow-y-auto rounded-xl border border-ink/10 bg-white text-sm">
                  {options.map(({ v, stock }) => (
                    <li key={v.id}>
                      <button onClick={() => add(v, stock)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink/5">
                        <span className="flex-1 truncate">{v.products?.name} · {[v.color, v.size].filter(Boolean).join(" · ")}</span>
                        <span className="text-xs text-moss">{stock} ud</span>
                        <span className="text-xs">{formatCOP(v.price_cop ?? 0)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li key={l.variantId} className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm">
                    <span className="flex-1 truncate">{l.productName} <span className="text-xs text-ink/50">{l.label}</span></span>
                    <button onClick={() => setLines((p) => p.map((x) => (x.variantId === l.variantId ? { ...x, qty: x.qty - 1 } : x)).filter((x) => x.qty > 0))} className="rounded-full p-1 hover:bg-ink/5"><Minus className="size-3" /></button>
                    <span className="w-5 text-center">{l.qty}</span>
                    <button onClick={() => setLines((p) => p.map((x) => (x.variantId === l.variantId ? { ...x, qty: Math.min(x.max, x.qty + 1) } : x)))} className="rounded-full p-1 hover:bg-ink/5"><Plus className="size-3" /></button>
                  </li>
                ))}
              </ul>
              <div className="space-y-1 border-t border-ink/10 pt-3 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCOP(subtotal)}</span></div>
                <div className="flex justify-between"><span>{delivery.label}</span><span>{delivery.cost ? formatCOP(delivery.cost) : "Gratis"}</span></div>
                <div className="flex justify-between text-base font-medium"><span>Total</span><span>{formatCOP(total)}</span></div>
              </div>
              <button disabled={busy || !valid} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm text-ivory disabled:opacity-40">
                <Truck className="size-4" /> {payMode === "local" ? `Cobrar ${formatCOP(total)} y enviar a despacho` : "Crear pedido y generar enlace"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
