import { useMemo, useState } from "react";
import { searchPosCustomers, getCustomerLastAddress } from "@/lib/pos/customer-search.functions";
import { useDraftState, clearDraft } from "@/hooks/use-draft-state";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminCreateUser } from "@/lib/admin/users.functions";
import { formatCOP, formatUSD } from "@/lib/format";
import { intlSettingsQuery } from "@/lib/international";
import { CountrySelect, CitySelect } from "@/components/admin/geo-select";
import { Button } from "@/components/ui/button";

const PAYMENT_METHODS = [
  { id: "link_wompi", label: "Link de pago Wompi" },
  { id: "link_bold", label: "Link de pago Bold" },
  { id: "transferencia", label: "Transferencia" },
  { id: "datafono", label: "Datáfono" },
  { id: "efectivo", label: "Efectivo" },
  { id: "credito_15", label: "Crédito a 15 días" },
] as const;
type PayMethod = (typeof PAYMENT_METHODS)[number]["id"];
const NEEDS_PROOF: PayMethod[] = ["link_wompi", "link_bold", "transferencia"];

/* ───────────────────────── nuevo pedido manual ───────────────────────── */

type Line = { imageUrl: string | null; key: string; locationId: string; locationName: string; available: number; variantId: string; productName: string; label: string; price: number; priceUsd: number; qty: number };
type CustomerRef = { id: string | null; name: string; email: string | null; phone: string | null; documentId?: string | null };

export function ManualOrderModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const createUser = useServerFn(adminCreateUser);

  const [customer, setCustomer] = useDraftState<CustomerRef | null>("draft-manual-order:customer", null);
  const [newC, setNewC] = useDraftState("draft-manual-order:newC", { name: "", email: "", phone: "", documentId: "", account: false });
  const [custTab, setCustTab] = useDraftState<"buscar" | "nuevo">("draft-manual-order:custTab", "buscar");
  const [custQ, setCustQ] = useState("");

  const [q, setQ] = useState("");
  const [lines, setLines] = useDraftState<Line[]>("draft-manual-order:lines", []);
  const [market, setMarket] = useDraftState<"nacional" | "internacional">("draft-manual-order:market", "nacional");
  const [method, setMethod] = useDraftState<PayMethod | null>("draft-manual-order:method", null);
  const [proof, setProof] = useState<File | null>(null);
  const [shipping, setShipping] = useDraftState("draft-manual-order:shipping", 0);
  const [address, setAddress] = useDraftState("draft-manual-order:address", { line1: "", city: "", country: "Colombia" });
  const [notes, setNotes] = useDraftState("draft-manual-order:notes", "");
  const [discountKind, setDiscountKind] = useDraftState<"none" | "pct" | "fixed">("draft-manual-order:discountKind", "none");
  const [discountVal, setDiscountVal] = useDraftState("draft-manual-order:discountVal", "");
  const [asDraft, setAsDraft] = useDraftState("draft-manual-order:asDraft", false);
  const [holdStock, setHoldStock] = useDraftState("draft-manual-order:holdStock", true);
  const [busy, setBusy] = useState(false);

  const searchCustomers = useServerFn(searchPosCustomers);
  const lastAddress = useServerFn(getCustomerLastAddress);
  const { data: results } = useQuery({
    queryKey: ["manual-order-customers", custQ.trim().toLowerCase()],
    enabled: custTab === "buscar" && custQ.trim().length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const hits = await searchCustomers({ data: { q: custQ.trim() } });
      return hits.map((h): CustomerRef => ({ id: h.id, name: h.name, email: h.email, phone: h.phone, documentId: h.document ?? "" }));
    },
  });

  const pickCustomer = async (c: CustomerRef) => {
    setCustomer(c);
    try {
      const a = await lastAddress({ data: { userId: c.id, email: c.email, phone: c.phone } });
      if (!a) { toast.message("Sin dirección guardada para esta clienta"); return; }
      setCustomer({ ...c, documentId: c.documentId || a.document || "", phone: c.phone || a.phone, email: c.email || a.email });
      if (a.line1) {
        const intl = a.country && !/^colombia$/i.test(a.country.trim());
        setMarket(intl ? "internacional" : "nacional");
        const extra = [a.line2, a.department, a.postal_code].map((s) => s?.trim()).filter((s) => s && !a.line1.includes(s));
        setAddress({ line1: [a.line1, ...extra].join(", "), city: a.city, country: intl ? a.country : "Colombia" });
        toast.success("Dirección anterior cargada");
      } else toast.message("Sin dirección guardada para esta clienta");
    } catch (e) { toast.error("No se pudo cargar la dirección: " + ((e as Error)?.message ?? "")); }
  };

  const { data: variants } = useQuery({
    queryKey: ["manual-order-variants", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const term = `%${q.trim()}%`;
      const { data: prods, error: prodErr } = await supabase
        .from("products")
        .select("id")
        .in("status", ["published", "draft"])
        .ilike("name", term)
        .limit(30);
      // Si la búsqueda por nombre falla (servidor saturado), no mostrar «Sin resultados» falso.
      if (prodErr) throw prodErr;
      const ids = (prods ?? []).map((p) => p.id);
      let query = supabase
        .from("product_variants")
        .select("id, sku, size, color, price_cop, price_usd, products!inner(id, name, status, product_images(url, position))")
        .eq("active", true)
        .in("products.status", ["published", "draft"])
        .limit(60);
      query = ids.length
        ? query.or(`sku.ilike.${term},product_id.in.(${ids.join(",")})`)
        : query.ilike("sku", term);
      const { data, error } = await query;
      if (error) throw error;
      const vids = (data ?? []).map((v) => v.id);
      const stock = new Map<string, { id: string; name: string; avail: number }[]>();
      if (vids.length) {
        const { data: lv } = await supabase
          .from("inventory_levels")
          .select("variant_id, on_hand, reserved, locations!inner(id, name, active)")
          .in("variant_id", vids)
          .eq("locations.active", true);
        for (const l of (lv ?? []) as any[]) {
          const avail = (l.on_hand ?? 0) - (l.reserved ?? 0);
          if (avail <= 0) continue;
          const arr = stock.get(l.variant_id) ?? [];
          arr.push({ id: l.locations.id, name: l.locations.name, avail });
          stock.set(l.variant_id, arr);
        }
      }
      return (data ?? []).map((v) => ({ ...v, stock: (stock.get(v.id) ?? []).sort((a, b) => b.avail - a.avail) }));
    },
  });

  const { data: intlCfg } = useQuery(intlSettingsQuery());
  const usdRate = intlCfg?.usdRate ?? 4000;
  const isUsd = market === "internacional";
  const subtotalCop = useMemo(() => lines.reduce((s, l) => s + l.price * l.qty, 0), [lines]);
  const subtotalUsd = useMemo(() => Math.round(lines.reduce((s, l) => s + l.priceUsd * l.qty, 0) * 100) / 100, [lines]);
  const shippingNum = Number(shipping) || 0;
  const discountNum = Math.max(0, Number(discountVal) || 0);
  const baseCop = isUsd ? Math.round(subtotalUsd * usdRate) : subtotalCop;
  const baseUsd = isUsd ? subtotalUsd : Math.round((subtotalCop / usdRate) * 100) / 100;
  const discountCop = discountKind === "pct"
    ? Math.round(baseCop * Math.min(discountNum, 100) / 100)
    : discountKind === "fixed"
      ? Math.min(isUsd ? Math.round(discountNum * usdRate) : Math.round(discountNum), baseCop)
      : 0;
  const discountUsd = Math.round((discountCop / usdRate) * 100) / 100;
  const totalUsd = Math.round((baseUsd - discountUsd + (isUsd ? shippingNum : 0)) * 100) / 100;
  const shippingCop = isUsd ? Math.round(shippingNum * usdRate) : shippingNum;
  const subtotal = subtotalCop;
  const total = subtotalCop - discountCop + shippingCop;
  const money = (cop: number, usd: number) => (isUsd ? formatUSD(usd) : formatCOP(cop));

  const addLine = (v: any, loc: { id: string; name: string; avail: number }) => {
    const key = `${v.id}:${loc.id}`;
    setLines((prev) => {
      const ex = prev.find((l) => l.key === key);
      if (ex) return prev.map((l) => (l.key === key ? { ...l, qty: Math.min(l.available, l.qty + 1) } : l));
      return [
        ...prev,
        {
          key,
          locationId: loc.id,
          locationName: loc.name,
          available: loc.avail,
          variantId: v.id,
          productName: v.products?.name ?? "",
          imageUrl: [...(v.products?.product_images ?? [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))[0]?.url ?? null,
          label: [v.color, v.size].filter(Boolean).join(" · ") || v.sku,
          price: v.price_cop,
          priceUsd: v.price_usd != null && Number(v.price_usd) > 0 ? Number(v.price_usd) : Math.round((v.price_cop / usdRate) * 100) / 100,
          qty: 1,
        },
      ];
    });
  };

  const saveNewCustomer = async () => {
    if (!newC.name.trim()) return toast.error("El nombre es obligatorio");
    if (newC.documentId.trim().length < 3) return toast.error("Escribe el pasaporte o DNI del cliente");
    if (newC.account) {
      if (!newC.email.includes("@")) return toast.error("Se necesita un email para crear la cuenta");
      try {
        const pass = `Zl${Math.random().toString(36).slice(2, 10)}!${Math.floor(Math.random() * 90 + 10)}`;
        const res = await createUser({
          data: { email: newC.email.trim(), password: pass, fullName: newC.name.trim(), phone: newC.phone.trim(), documentId: newC.documentId.trim(), address: address.line1.trim() || undefined },
        });
        setCustomer({ id: res.userId, name: newC.name.trim(), email: newC.email.trim(), phone: newC.phone.trim() || null, documentId: newC.documentId.trim() });
        toast.success("Cliente creado con cuenta");
        return;
      } catch (e: any) {
        return toast.error(e?.message ?? "No se pudo crear la cuenta");
      }
    }
    setCustomer({
      id: null,
      name: newC.name.trim(),
      email: newC.email.trim() || null,
      phone: newC.phone.trim() || null,
      documentId: newC.documentId.trim(),
    });
  };

  const locTotals = useMemo(() => {
    const m = new Map<string, { id: string; name: string; units: number }>();
    lines.forEach((l) => { const c = m.get(l.locationId) ?? { id: l.locationId, name: l.locationName, units: 0 }; c.units += l.qty; m.set(l.locationId, c); });
    return Array.from(m.values()).sort((a, b) => b.units - a.units);
  }, [lines]);
  const [dispatchPick, setDispatchPick] = useState<string | null>(null);
  const dispatchLoc = locTotals.some((l) => l.id === dispatchPick) ? dispatchPick : locTotals[0]?.id ?? null;

  const submit = async () => {
    if (!customer) return toast.error("Escoge o crea un cliente");
    if (!(customer.documentId ?? "").trim()) return toast.error("Escribe el documento del cliente");
    if (!address.line1.trim()) return toast.error("Escribe la dirección de entrega");
    if (lines.length === 0) return toast.error("Agrega al menos un producto");
    {
      const c = (address.country ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      if (c && c !== "colombia") {
        if ((customer?.documentId ?? "").trim().length < 3) return toast.error("Pedido internacional: escribe la identificación del cliente (pasaporte o DNI)");
        if (!address.city.trim()) return toast.error("Pedido internacional: elige la ciudad de destino");
      }
    }
    if ((!asDraft || holdStock) && lines.some((l) => l.qty > l.available)) return toast.error("Hay prendas con más unidades de las disponibles en su bodega");
    if (!method) return toast.error("Escoge el medio de pago");
    const needsProof = NEEDS_PROOF.includes(method);
    setBusy(true);
    let createdId: string | null = null;
    try {
      const payLabel = PAYMENT_METHODS.find((m) => m.id === method)?.label ?? method;
      let proofUrl: string | null = null;
      if (!asDraft && needsProof && proof) {
        const ext = proof.name.split(".").pop() || "jpg";
        const path = `manual/${crypto.randomUUID()}.${ext}`;
        const { error: ue } = await supabase.storage
          .from("payment-receipts")
          .upload(path, proof, { contentType: proof.type || undefined });
        if (ue) throw new Error("No se pudo subir el comprobante");
        const { data: signed, error: se } = await supabase.storage
          .from("payment-receipts")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        if (se || !signed) throw new Error("No se pudo guardar el comprobante");
        proofUrl = signed.signedUrl;
      }
      const { data: order, error: oe } = await supabase
        .from("orders")
        .insert({
          source: "ecom",
          is_manual: true,
          status: "draft",
          payment_method: method,
          payment_status: proofUrl ? "paid" : "pending",
          dispatch_location_id: dispatchLoc,
          payment_proof_url: proofUrl,
          payment_proof_at: proofUrl ? new Date().toISOString() : null,
          subtotal_cop: subtotal,
          discount_cop: discountCop,
          shipping_cop: shippingCop,
          total_cop: total,
          currency: isUsd ? "USD" : "COP",
          total_usd_exact: isUsd ? totalUsd : null,
          customer_id: customer.id,
          contact_name: customer.name,
          contact_email: customer.email,
          contact_phone: customer.phone,
          notes: [`Pedido manual · Pago: ${payLabel}`, notes.trim()].filter(Boolean).join(" — "),
          ship_to: {
            market,
            recipient: customer.name,
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            identification: customer.documentId ?? "",
            line1: address.line1,
            city: address.city,
            country: market === "internacional" ? address.country : "Colombia",
            payment_method: method,
          } as any,
        })
        .select("id, number")
        .single();
      if (oe) throw oe;
      createdId = order.id;
      if (customer.id && customer.documentId?.trim()) {
        await supabase.from("profiles").update({ document_id: customer.documentId.trim() } as any).eq("id", customer.id).is("document_id", null);
        if (customer.phone?.trim()) await supabase.from("profiles").update({ phone: customer.phone.trim() } as any).eq("id", customer.id).is("phone", null);
      }

      const { error: ie } = await supabase.from("order_items").insert(
        lines.map((l) => ({
          order_id: order.id,
          variant_id: l.variantId,
          product_name: l.productName,
          variant_label: l.label,
          qty: l.qty,
          unit_price_cop: l.price,
          unit_price_usd: isUsd ? l.priceUsd : null,
          fulfill_location_id: l.locationId,
        })),
      );
      if (ie) throw ie;

      if (!asDraft || holdStock) {
        const { data: stock, error: se } = asDraft
          ? await supabase.rpc("confirm_manual_order_stock" as never, { _order_id: order.id, _dispatch_location_id: dispatchLoc } as never)
          : await supabase.rpc("create_manual_order_stock" as never, { _order_id: order.id } as never);
        if (se) throw se;
        const res = stock as any;
        if (res && res.ok === false) {
          const m = (res.missing ?? []).map((x: any) => `${x.product} ${x.variant ?? ""} (hay ${x.available})`).join(", ");
          throw new Error(`Sin unidades suficientes: ${m}`);
        }
      }

      toast.success(
        !asDraft ? `Pedido ${order.number} creado · las prendas ya se descontaron del inventario`
        : holdStock ? `Borrador ${order.number} guardado · prendas separadas hasta confirmar el pago`
        : `Borrador ${order.number} guardado · sin separar inventario`,
      );
      qc.invalidateQueries({ queryKey: ["tienda-pedidos"] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries();
      clearDraft("draft-manual-order:");
      onClose();
    } catch (e: any) {
      // No dejar pedidos a medio crear (en «Borrador» sin inventario descontado).
      if (createdId) await supabase.from("orders").update({ status: "cancelled", notes: "Creación interrumpida" }).eq("id", createdId);
      toast.error(e?.message ?? "No se pudo crear el pedido");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/40 p-0 md:p-6">
      <div
        role="dialog" aria-modal="true" aria-label="Nuevo pedido manual"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full md:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-6 md:p-8"
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Sales hub</p>
            <h2 className="font-serif text-2xl mt-1">Nuevo pedido manual</h2>
          </div>
          <button onClick={() => { if (lines.length && !window.confirm("¿Descartar el pedido en curso? Se borrará lo que llevas.")) return; clearDraft("draft-manual-order:"); onClose(); }} className="p-2 rounded-full hover:bg-ink/5">
            <X className="size-4" />
          </button>
        </div>

        {/* Cliente */}
        <section className="mb-7">
          <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-3">Cliente</p>
          {customer ? (
            <div className="border border-ink/10 rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-ink">{customer.name}</p>
                  <p className="text-xs text-moss/60">{customer.email ?? customer.phone ?? "Sin contacto"}</p>
                </div>
                <button onClick={() => setCustomer(null)} className="text-xs uppercase tracking-widest text-moss hover:text-ink">
                  Cambiar
                </button>
              </div>
              <input
                value={customer.documentId ?? ""}
                onChange={(e) => setCustomer({ ...customer, documentId: e.target.value })}
                placeholder="Documento / pasaporte / DNI *"
                className="w-full border border-ink/10 rounded-xl px-3 py-2 text-sm bg-transparent"
              />
              <input
                value={customer.phone ?? ""}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value || null })}
                placeholder="Teléfono"
                inputMode="tel"
                className="w-full border border-ink/10 rounded-xl px-3 py-2 text-sm bg-transparent"
              />
            </div>
          ) : (
            <>
              <div className="flex gap-1 bg-ivory/60 rounded-full p-1 mb-3 max-w-xs">
                {(["buscar", "nuevo"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setCustTab(t)}
                    className={"flex-1 text-sm py-2 rounded-full transition " + (custTab === t ? "bg-ink text-ivory" : "text-ink/60")}
                  >
                    {t === "buscar" ? "Buscar" : "Nuevo"}
                  </button>
                ))}
              </div>
              {custTab === "buscar" ? (
                <div className="space-y-3">
                  <input
                    value={custQ}
                    onChange={(e) => setCustQ(e.target.value)}
                    placeholder="Nombre, email o teléfono"
                    className="w-full px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm"
                  />
                  <div className="max-h-56 overflow-auto divide-y divide-ink/5 rounded-2xl border border-ink/10">
                    {custQ.length < 2 && <p className="p-5 text-sm text-moss/50 text-center">Escribe al menos 2 letras</p>}
                    {custQ.length >= 2 && results?.length === 0 && (
                      <p className="p-5 text-sm text-moss/50 text-center">Sin resultados</p>
                    )}
                    {results?.map((c, i) => (
                      <button key={i} onClick={() => pickCustomer(c)} className="w-full text-left p-3 hover:bg-ink/5">
                        <p className="text-sm">{c.name}</p>
                        <p className="text-xs text-moss/50">{c.email ?? c.phone ?? "—"}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    value={newC.name}
                    onChange={(e) => setNewC({ ...newC, name: e.target.value })}
                    placeholder="Nombre completo"
                    className="w-full px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      value={newC.email}
                      onChange={(e) => setNewC({ ...newC, email: e.target.value })}
                      type="email"
                      placeholder="Email"
                      className="px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm"
                    />
                    <input
                      required
                      value={newC.documentId}
                      onChange={(e) => setNewC({ ...newC, documentId: e.target.value })}
                      placeholder="Pasaporte o DNI"
                      maxLength={60}
                      className="px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm"
                    />
                    <input
                      value={newC.phone}
                      onChange={(e) => setNewC({ ...newC, phone: e.target.value })}
                      placeholder="Teléfono"
                      className="px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-moss">
                    <input
                      type="checkbox"
                      checked={newC.account}
                      onChange={(e) => setNewC({ ...newC, account: e.target.checked })}
                    />
                    Crear también su cuenta en la tienda
                  </label>
                  <button
                    onClick={saveNewCustomer}
                    className="px-5 py-2.5 rounded-full bg-ink text-ivory text-xs uppercase tracking-widest"
                  >
                    Usar este cliente
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Productos */}
        <section className="mb-7">
          <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-3">Productos</p>
          <div className="relative mb-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-moss/50" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto por nombre o referencia…"
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm"
            />
          </div>
          {q.trim().length >= 2 && (
            <div className="max-h-56 overflow-auto divide-y divide-ink/5 rounded-2xl border border-ink/10 mb-4">
              {(variants ?? []).length === 0 && <p className="p-5 text-sm text-moss/50 text-center">Sin resultados</p>}
              {(variants ?? []).map((v: any) => {
                const imageUrl = [...(v.products?.product_images ?? [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))[0]?.url;
                return (
                <div key={v.id} className="p-3 flex gap-3">
                  {imageUrl ? <img src={imageUrl} alt={v.products?.name ?? ""} loading="lazy" className="w-10 h-12 rounded-md object-cover shrink-0 bg-ink/5" /> : <div className="w-10 h-12 rounded-md bg-ink/5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-ink">{v.products?.name}</p>
                    <p className="text-xs text-moss/50">
                      {[v.color, v.size].filter(Boolean).join(" · ") || v.sku} · {v.sku}
                    </p>
                  </div>
                  <span className="font-mono text-xs">{isUsd ? formatUSD(v.price_usd != null && Number(v.price_usd) > 0 ? Number(v.price_usd) : Math.round((v.price_cop / usdRate) * 100) / 100) : formatCOP(v.price_cop)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {v.stock.length === 0 && <span className="text-xs text-moss/50">Sin unidades en ninguna bodega</span>}
                    {v.stock.map((s: any) => (
                      <Button type="button" variant="outline" size="sm"
                        key={s.id}
                        onClick={() => addLine(v, s)}
                        className="h-auto px-3 py-1 rounded-full border-ink/15 text-xs text-ink hover:bg-ink hover:text-ivory whitespace-normal"
                      >
                        {s.name} · {s.avail}
                      </Button>
                    ))}
                  </div>
                  </div>
                </div>
              ); })}
            </div>
          )}

          {lines.length > 0 && (
            <ul className="divide-y divide-ink/5 border border-ink/10 rounded-2xl">
              {lines.map((l) => (
                <li key={l.key} className="flex flex-wrap items-center gap-3 p-3">
                  {l.imageUrl ? <img src={l.imageUrl} alt={l.productName} loading="lazy" className="w-10 h-12 rounded-md object-cover shrink-0 bg-ink/5" /> : <div className="w-10 h-12 rounded-md bg-ink/5 shrink-0" />}
                  <div className="flex-1 min-w-[140px]">
                    <p className="text-sm text-ink">{l.productName}</p>
                    <p className="text-xs text-moss/50">{l.label} · Sale de {l.locationName} ({l.available} disp.)</p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={l.available}
                    value={l.qty}
                    onChange={(e) =>
                      setLines((p) =>
                        p.map((x) => (x.key === l.key ? { ...x, qty: Math.min(x.available, Math.max(1, Number(e.target.value) || 1)) } : x)),
                      )
                    }
                    className="w-16 px-2 py-1.5 rounded-xl border border-ink/15 text-sm text-center"
                  />
                  <span className="font-mono text-xs w-24 text-right">{money(l.price * l.qty, Math.round(l.priceUsd * l.qty * 100) / 100)}</span>
                  <button
                    onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                    className="p-2 rounded-full hover:bg-ink/5 text-moss"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Envío y pago */}
        {locTotals.length > 0 && (
          <section className="mb-7">
            <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-3">Bodega de despacho</p>
            <div className="flex flex-wrap gap-2">
              {locTotals.map((l) => (
                <button key={l.id} type="button" onClick={() => setDispatchPick(l.id)}
                  className={`px-3 py-1.5 rounded-full border text-xs ${dispatchLoc === l.id ? "bg-ink text-ivory border-ink" : "border-ink/15"}`}>
                  {l.name} · {l.units} u.
                </button>
              ))}
            </div>
            {locTotals.length > 1 && (
              <p className="mt-2 text-xs text-moss/75">Al confirmar cantidades se creará un traslado automático de las otras bodegas hacia la de despacho.</p>
            )}
          </section>
        )}

        <section className="mb-7 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
            Mercado
            <select
              value={market}
              onChange={(e) => setMarket(e.target.value as typeof market)}
              className="mt-1 px-4 py-3 rounded-2xl border border-ink/15 text-sm text-ink"
            >
              <option value="nacional">Nacional</option>
              <option value="internacional">Internacional</option>
            </select>
          </label>
          <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
            {isUsd ? "Envío (USD)" : "Envío (COP)"}
            <input
              type="number"
              min={0}
              value={shipping}
              onChange={(e) => setShipping(Number(e.target.value) || 0)}
              className="mt-1 px-4 py-3 rounded-2xl border border-ink/15 text-sm"
            />
          </label>
          <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
            Dirección *
            <input
              value={address.line1}
              onChange={(e) => setAddress({ ...address, line1: e.target.value })}
              placeholder="Calle, número, detalles"
              className="mt-1 px-4 py-3 rounded-2xl border border-ink/15 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
              País
              <CountrySelect
                value={market === "internacional" ? address.country : "Colombia"}
                disabled={market === "nacional"}
                onChange={(v) => setAddress({ ...address, country: v, city: "" })}
              />
            </label>
            <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
              Ciudad
              <CitySelect
                country={market === "internacional" ? address.country : "Colombia"}
                value={address.city}
                onChange={(v) => setAddress({ ...address, city: v })}
              />
            </label>
          </div>
        </section>

        <section className="mb-7">
          <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-3">Método de pago</p>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={
                  "px-5 py-2.5 rounded-full text-xs uppercase tracking-widest border transition " +
                  (method === m.id ? "bg-ink text-ivory border-ink" : "bg-white border-ink/10 text-moss hover:text-ink")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          {method && NEEDS_PROOF.includes(method) && (
            <label className="mt-4 flex flex-col gap-2 border border-dashed border-ink/20 rounded-2xl px-4 py-3 text-xs text-moss cursor-pointer hover:border-ink/40">
              <span className="text-[10px] uppercase tracking-widest text-moss/70">Foto del comprobante (opcional: también puedes confirmar el pago después)</span>
              <span className="text-ink">{proof ? proof.name : "Toca para subir la foto"}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setProof(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-moss/70">Descuento</span>
            <div className="flex rounded-full border border-ink/15 overflow-hidden text-xs">
              {([["none", "Sin descuento"], ["pct", "%"], ["fixed", isUsd ? "US$ fijo" : "$ fijo"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDiscountKind(k)}
                  className={`px-3 py-1.5 ${discountKind === k ? "bg-ink text-ivory" : "text-moss hover:bg-ink/5"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {discountKind !== "none" && (
              <input
                type="number"
                min={0}
                max={discountKind === "pct" ? 100 : undefined}
                value={discountVal}
                onChange={(e) => setDiscountVal(e.target.value)}
                placeholder={discountKind === "pct" ? "Ej: 10" : isUsd ? "Ej: 20" : "Ej: 50000"}
                className="w-32 px-3 py-1.5 rounded-full border border-ink/15 text-sm outline-none focus:border-ink"
              />
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas del pedido (opcional)"
            className="mt-4 w-full px-4 py-3 rounded-2xl border border-ink/15 text-sm resize-none outline-none focus:border-ink"
          />
        </section>

        <section className="mb-5 rounded-2xl border border-ink/10 p-4 space-y-3">
          <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
            <input type="checkbox" checked={asDraft} onChange={(e) => setAsDraft(e.target.checked)} className="mt-1" />
            <span>Guardar como borrador (pago pendiente)
              <span className="block text-xs text-moss/75">Se confirma y sale del inventario cuando confirmes el pago.</span>
            </span>
          </label>
          {asDraft && (
            <label className="flex items-start gap-3 text-sm text-ink cursor-pointer pl-6">
              <input type="checkbox" checked={holdStock} onChange={(e) => setHoldStock(e.target.checked)} className="mt-1" />
              <span>Separar las prendas del inventario
                <span className="block text-xs text-moss/75">{holdStock ? "Quedan apartadas: nadie más las puede vender." : "No se apartan: siguen a la venta hasta confirmar el pago."}</span>
              </span>
            </label>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 pt-5">
          <div className="text-sm text-moss">
            <p>Subtotal: <span className="font-mono text-ink">{money(subtotalCop, subtotalUsd)}</span></p>
            {discountCop > 0 && (
              <p>Descuento: <span className="font-mono text-ink">−{money(discountCop, discountUsd)}</span></p>
            )}
            <p className="font-serif text-2xl text-ink mt-1">{money(total, totalUsd)}{isUsd && <span className="ml-2 text-xs font-sans text-moss">USD</span>}</p>
          </div>
          <button
            onClick={submit}
            disabled={busy}
            className="px-7 py-3 rounded-full bg-ink text-ivory text-xs uppercase tracking-widest hover:bg-ink/85 disabled:opacity-50"
          >
            {busy ? "Creando…" : "Crear pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
