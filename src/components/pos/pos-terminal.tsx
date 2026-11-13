import type { TablesInsert } from "@/integrations/supabase/types";
import { loyaltyConfigQuery, myPointsQuery, redeemablePoints } from "@/lib/loyalty";
import { CameraScanModal, type ScannedVariant } from "@/components/pos/camera-scan-modal";
import { AssistedOrderModal } from "@/components/pos/assisted-order-modal";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Banknote, Check, ChevronLeft, ChevronRight, Gift, ImagePlus, Layers, Lock, Minus, Package, Plus, Search, ShoppingBag, Tag, Trash2, User, UserPlus, X,
  Camera,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { searchPosCustomers, savePosCustomerDocument, ensurePosCustomerAccount, type PosCustomerHit } from "@/lib/pos/customer-search.functions";
import { formatCOP } from "@/lib/format";
import { getBoldTerminalSettings, startBoldTerminalPayment, cancelBoldTerminalPayment, getBoldTerminalPaymentStatus } from "@/lib/pos/bold-terminal.functions";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { normalizeScannedCode, scannedCodeFilter } from "@/lib/scanned-code";
import { Button } from "@/components/ui/button";
import { PosReceiptModal, printPosClosing, type PosReceiptSale } from "@/components/pos/pos-receipt-modal";
import { CountrySelect, CitySelect } from "@/components/admin/geo-select";


type CartLine = { variantId: string; productName: string; label: string; price: number; qty: number; listPrice?: number };
type Filter =
  | { kind: "all" }
  | { kind: "type"; value: string }
  | { kind: "collection"; id: string }
  | { kind: "offers" };
type PosMethod = "efectivo" | "tarjeta" | "datafono" | "transferencia" | "link_pago" | "link_wompi" | "link_bold" | "credito_15";
const METHODS: { id: PosMethod; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "datafono", label: "Datáfono" },
  { id: "transferencia", label: "Transferencia" },
  { id: "link_wompi", label: "Link de pago Wompi" },
  { id: "link_bold", label: "Link de pago Bold" },
  { id: "credito_15", label: "Crédito a 15 días" },
];

type ActiveSession = {
  id: string;
  sellerId: string;
  sellerName: string;
  openingCash: number;
  locationId: string;
};

type CustomerRef = {
  id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
};


/** Hasta el 24 de octubre de 2026 (hora Colombia) la caja arranca en consumidor final. */
const FINAL_CONSUMER_UNTIL = Date.parse("2026-10-25T00:00:00-05:00");
function defaultInvoiceMode(): "final" | "empresa" {
  return Date.now() < FINAL_CONSUMER_UNTIL ? "final" : "empresa";
}

export function PosTerminal({ defaultCode, title }: { defaultCode?: string; title?: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [locationId, setLocationId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<PosMethod | null>(null);
  const [splitOn, setSplitOn] = useState(false);
  const [method2, setMethod2] = useState<PosMethod | null>(null);
  const [amount2, setAmount2] = useState("");
  const [busy, setBusy] = useState(false);
  const [boldWait, setBoldWait] = useState<{ id: string; amount: number; terminal: string; status: string; error: string | null } | null>(null);
  const getBoldSettings = useServerFn(getBoldTerminalSettings);
  const startBold = useServerFn(startBoldTerminalPayment);
  const cancelBold = useServerFn(cancelBoldTerminalPayment);
  const boldStatus = useServerFn(getBoldTerminalPaymentStatus);
  const boldFinalizing = useRef<string | null>(null);
  const [boldHidden, setBoldHidden] = useState(false);
  const boldSettings = useQuery({ queryKey: ["bold-terminal-settings"], queryFn: () => getBoldSettings(), staleTime: 300_000, retry: false });
  const [receipt, setReceipt] = useState<PosReceiptSale | null>(null);
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [customer, setCustomer] = useState<CustomerRef | null>(null);
  const [customerModal, setCustomerModal] = useState(false);
  const [invoiceMode, setInvoiceMode] = useState<"final" | "empresa">(defaultInvoiceMode);
  const [invoiceName, setInvoiceName] = useState("");
  const [invoiceNit, setInvoiceNit] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [pointsOpen, setPointsOpen] = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; name: string; kind: string; value: number } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [typeModal, setTypeModal] = useState(false);
  const [collectionModal, setCollectionModal] = useState(false);
  const [assistedModal, setAssistedModal] = useState(false);
  const [assistedInitial, setAssistedInitial] = useState<ScannedVariant | null>(null);
  const [cameraModal, setCameraModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  // Saldo a favor de una devolución recibida en Cambios y devoluciones.
  const [returnCredit, setReturnCredit] = useState<{ returnId: string; amount: number; code: string; orderNumber: string } | null>(null);

  useEffect(() => { setPage(1); }, [q, locationId, filter]);

  useEffect(() => {
    const raw = sessionStorage.getItem("pos-return-credit");
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      setReturnCredit({ returnId: d.returnId, amount: Number(d.amount) || 0, code: d.code, orderNumber: d.orderNumber });
      if (d.customer?.name) setCustomer(d.customer);
    } catch { sessionStorage.removeItem("pos-return-credit"); }
  }, []);

  const { data: locations } = useQuery({
    queryKey: ["pos-locations"],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, code, name, kind, channels").in("kind", ["store", "warehouse"]).order("priority");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (locationId || !locations?.length) return;
    const preferred = defaultCode ? locations.find((l) => l.code === defaultCode) : null;
    setLocationId(preferred?.id ?? locations[0].id);
  }, [locations, defaultCode, locationId]);

  // Try to resume an existing open session for this location
  useEffect(() => {
    if (!locationId || session) return;
    (async () => {
      const { data } = await supabase
        .from("pos_sessions")
        .select("id, opened_by, opening_cash_cop")
        .eq("location_id", locationId).is("closed_at", null)
        .order("opened_at", { ascending: false }).limit(1).maybeSingle();
      if (data) {
        let sellerName = "Vendedora";
        const { data: prof } = await supabase
          .from("profiles").select("full_name").eq("id", data.opened_by).maybeSingle();
        if (prof?.full_name) sellerName = prof.full_name;
        setSession({
          id: data.id,
          sellerId: data.opened_by,
          sellerName,
          openingCash: data.opening_cash_cop,
          locationId,
        });
      }
    })();
  }, [locationId, session]);

  const activeLoc = locationId;

  // Pistola lectora (USB/Bluetooth): se comporta como teclado, escribe el código muy rápido y termina con Enter.
  const searchRef = useRef<HTMLInputElement>(null);
  const addByCode = async (raw: string) => {
    const code = normalizeScannedCode(raw);
    if (!code || !activeLoc) return;
    const { data } = await supabase
      .from("product_variants")
      .select("id, sku, size, color, price_cop, products!inner(name, status), inventory_levels(location_id, on_hand, reserved)")
      .eq("active", true)
      .neq("products.status", "archived")
      .or(scannedCodeFilter(raw))
      .eq("inventory_levels.location_id", activeLoc)
      .limit(1).maybeSingle();
    if (!data) { toast.error(`Código no encontrado: ${raw.trim()}`); return; }
    const lvl = data.inventory_levels?.[0];
    const avail = lvl ? lvl.on_hand - lvl.reserved : 0;
    const name = (data.products as any)?.name ?? data.sku;
    const inCart = cart.find((l) => l.variantId === data.id)?.qty ?? 0;
    if (avail - inCart <= 0) toast.warning(`${name}: sin stock en esta tienda, quedará en negativo`);
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === data.id);
      if (existing) return prev.map((l) => (l.variantId === data.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { variantId: data.id, productName: name, label: [data.color, data.size].filter(Boolean).join(" · ") || data.sku, price: data.price_cop, qty: 1 }];
    });
    toast.success(`${name} agregado`);
    setQ("");
  };
  // Un solo receptor: un Enter del lector agrega exactamente una unidad.
  useBarcodeScanner(addByCode, { enabled: !!activeLoc });

  const { data: variants } = useQuery({
    queryKey: ["pos-inventory", activeLoc, q],
    enabled: !!activeLoc,
    queryFn: async () => {
      const term = q.trim().replace(/[%_,()]/g, "");
      // Con búsqueda: coincide por SKU o por nombre del producto y muestra también
      // las prendas sin stock (marcadas «Sin stock»). Sin búsqueda: solo disponibles.
      let productIds: string[] = [];
      if (term) {
        // Borrador en la tienda online sigue vendible en tienda física; solo se excluye lo archivado.
        const { data: prods } = await supabase
          .from("products").select("id").neq("status", "archived").ilike("name", `%${term}%`).limit(200);
        productIds = (prods ?? []).map((p) => p.id);
      }
      // Solo prendas con unidades disponibles en esta tienda (el escáner sí permite vender sin stock).
      let query = supabase
        .from("product_variants")
        .select("id, sku, size, color, price_cop, products!inner(id, name, slug, hero_image_url, status, product_type), inventory_levels!inner(location_id, on_hand, reserved)")
        .eq("active", true)
        .eq("inventory_levels.location_id", activeLoc!)
        .gt("inventory_levels.on_hand", 0)
        .neq("products.status", "archived")
        .limit(term ? 300 : 1000);
      if (term) {
        query = productIds.length
          ? query.or(`sku.ilike.%${term}%,product_id.in.(${productIds.join(",")})`)
          : query.ilike("sku", `%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      const avail = (v: (typeof data)[number]) => { const l = v.inventory_levels?.[0]; return l ? l.on_hand - l.reserved : 0; };
      return (data ?? []).filter((v) => avail(v) > 0);
    },
  });

  const { data: productTypes } = useQuery({
    queryKey: ["pos-product-types"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("product_type").eq("status", "published");
      const set = new Set<string>();
      (data ?? []).forEach((p) => { if (p.product_type) set.add(p.product_type); });
      return Array.from(set).sort();
    },
  });

  const { data: collections } = useQuery({
    queryKey: ["pos-collections"],
    queryFn: async () => {
      const { data } = await supabase.from("collections").select("id, title").eq("status", "published").order("position");
      return data ?? [];
    },
  });

  const { data: collectionProductIds } = useQuery({
    queryKey: ["pos-collection-products", filter.kind === "collection" ? filter.id : null],
    enabled: filter.kind === "collection",
    queryFn: async () => {
      if (filter.kind !== "collection") return [] as string[];
      const { data } = await supabase.from("collection_products").select("product_id").eq("collection_id", filter.id);
      return (data ?? []).map((r) => r.product_id);
    },
  });

  const { data: offers } = useQuery({
    queryKey: ["pos-offers", locationId],
    enabled: filter.kind === "offers",
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_offers").select("*").eq("active", true).order("position");
      if (error) throw error;
      const code = locations?.find((l) => l.id === locationId)?.code;
      return (data ?? []).filter((o: any) => !code || !Array.isArray(o.placements) || o.placements.includes(`pos_${code}`));
    },
  });

  const filteredVariants = useMemo(() => {
    if (!variants) return [];
    if (filter.kind === "type") return variants.filter((v) => v.products?.product_type === filter.value);
    if (filter.kind === "collection") {
      const set = new Set(collectionProductIds ?? []);
      return variants.filter((v) => v.products && set.has((v.products as any).id));
    }
    return variants;
  }, [variants, filter, collectionProductIds]);

  const productGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; image: string | null; variants: NonNullable<typeof variants> }>();
    for (const variant of filteredVariants) {
      const product = variant.products;
      if (!product) continue;
      const current = groups.get(product.id);
      if (current) current.variants.push(variant);
      else groups.set(product.id, { id: product.id, name: product.name, image: product.hero_image_url, variants: [variant] });
    }
    return Array.from(groups.values());
  }, [filteredVariants]);
  const selectedProduct = productGroups.find((group) => group.id === selectedProductId) ?? null;

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.qty, 0), [cart]);

  const availHere = (levels: any[] | null | undefined) => {
    const lvl = (levels ?? []).find((l: any) => l.location_id === activeLoc);
    return lvl ? Math.max(0, lvl.on_hand - lvl.reserved) : 0;
  };

  const addLine = (v: NonNullable<typeof variants>[number]) => {
    const max = availHere((v as any).inventory_levels);
    const inCart = cart.find((l) => l.variantId === v.id)?.qty ?? 0;
    if (inCart + 1 > max) toast.warning("Sin stock en esta tienda", { description: "La venta se registra y el inventario queda en negativo." });
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === v.id);
      if (existing) return prev.map((l) => (l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, {
        variantId: v.id, productName: v.products?.name ?? "",
        label: [v.color, v.size].filter(Boolean).join(" · ") || v.sku,
        price: v.price_cop, qty: 1,
      }];
    });
  };

  const setQty = (id: string, qty: number) => {
    if (qty <= 0) { setCart((p) => p.filter((l) => l.variantId !== id)); return; }
    setCart((p) => p.map((l) => l.variantId === id ? { ...l, qty } : l));
  };

  const addOffer = async (offer: { id: string; name: string; price_cop: number; items: Array<{ variant_id: string; qty: number; price_cop: number }> }) => {
    if (!session) { toast.error("Abre la caja primero"); return; }
    const ids = offer.items.map((i) => i.variant_id);
    if (ids.length === 0) return;
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, sku, size, color, price_cop, products(name)")
      .in("id", ids);
    if (error) { toast.error(error.message); return; }
    const meta = new Map((data ?? []).map((v) => [v.id, v]));
    setCart((prev) => {
      const next = [...prev];
      offer.items.forEach((it) => {
        const v = meta.get(it.variant_id);
        if (!v) return;
        const label = `${offer.name} · ` + ([v.color, v.size].filter(Boolean).join(" · ") || v.sku);
        const idx = next.findIndex((l) => l.variantId === it.variant_id && l.label === label);
        if (idx >= 0) next[idx] = { ...next[idx], qty: next[idx].qty + it.qty };
        // El precio base de la prenda viaja en la factura a R-Count con su
        // porcentaje de descuento; lo cobrado es el precio de la oferta.
        else next.push({ variantId: it.variant_id, productName: v.products?.name ?? offer.name, label, price: it.price_cop, qty: it.qty, listPrice: Number(v.price_cop) > it.price_cop ? Number(v.price_cop) : undefined });
      });
      return next;
    });
    toast.success(`${offer.name} agregada al carrito`);
  };

  const { data: loyaltyCfg } = useQuery(loyaltyConfigQuery());
  const { data: pointsBalance = 0 } = useQuery(myPointsQuery(customer?.id ?? undefined));
  const redeemPts = customer?.id && !appliedPromo ? redeemablePoints(loyaltyCfg, pointsBalance, subtotal, "pos") : 0;
  const requestedPoints = Math.max(0, Math.floor(Number(pointsInput) || 0));
  const pointsToRedeem = pointsOpen ? Math.min(requestedPoints, redeemPts) : 0;
  const minimumPoints = loyaltyCfg?.min_redeem_points ?? 0;
  const validPointRedemption = !pointsOpen || (requestedPoints >= minimumPoints && requestedPoints <= redeemPts);
  const pointsDiscount = pointsToRedeem ? Math.floor(pointsToRedeem * (loyaltyCfg?.point_value_cop ?? 0)) : 0;
  const earnedPoints = !pointsOpen && customer?.id && loyaltyCfg?.enabled && loyaltyCfg.point_value_cop > 0
    ? Math.floor(subtotal * loyaltyCfg.earn_pct / 100 / loyaltyCfg.point_value_cop)
    : 0;
  // Regla: la clienta paga con puntos O con código de descuento, nunca ambos.
  const promoDiscount = appliedPromo
    ? appliedPromo.kind === "percent"
      ? Math.round((subtotal * appliedPromo.value) / 100)
      : Math.min(appliedPromo.value, subtotal)
    : 0;
  const creditApplied = returnCredit ? returnCredit.amount : 0;
  const creditShort = !!returnCredit && subtotal < returnCredit.amount;
  const payable = Math.max(subtotal - pointsDiscount - promoDiscount - creditApplied, 0);

  const posChannel = (locations?.find((l) => l.id === activeLoc)?.code ?? "") === "bogota" ? "pos_bogota" : "pos_cali";
  const { data: posPromosRaw } = useQuery({
    queryKey: ["pos-promos", posChannel],
    queryFn: async () => (await supabase.from("promotions").select("id, code, name, kind, value, channels").eq("active", true).contains("channels", [posChannel])).data ?? [],
  });
  const posPromos = posPromosRaw ?? [];
  const selectPromo = (p: { code: string | null; name: string; kind: string; value: number }) => {
    setAppliedPromo({ code: p.code ?? p.name, name: p.name, kind: p.kind, value: Number(p.value) });
    setPointsOpen(false); setPointsInput(""); setPromoOpen(false); setPromoCode("");
    toast.success(`Descuento aplicado: ${p.name}`);
  };

  const applyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code) return;
    setPromoBusy(true);
    try {
      const { data, error } = await supabase
        .from("promotions")
        .select("code, name, kind, value, channels, active")
        .eq("code", code)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      const locCode = locations?.find((l) => l.id === activeLoc)?.code ?? "";
      const channel = locCode === "bogota" ? "pos_bogota" : "pos_cali";
      if (!data || !(data.channels ?? []).includes(channel)) {
        toast.error("Ese código no existe o no aplica en esta tienda.");
        return;
      }
      setAppliedPromo({ code: data.code ?? code, name: data.name, kind: data.kind, value: Number(data.value) });
      setPointsOpen(false);
      setPointsInput("");
      setPromoOpen(false);
      setPromoCode("");
      toast.success(`Descuento aplicado: ${data.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo validar el código");
    } finally {
      setPromoBusy(false);
    }
  };

  const splitActive = splitOn && !!method && method !== "credito_15";
  const split2 = splitActive ? Number(amount2 || 0) : 0;
  const isSplit = splitActive && !!method && !!method2 && split2 > 0 && split2 < payable;
  const splitInvalid = splitActive && payable > 0 && !isSplit;
  const labelOf = (id: PosMethod | null) => METHODS.find((m) => m.id === id)?.label ?? "";
  const methodLabel = isSplit
    ? `${labelOf(method)} ${formatCOP(payable - split2)} + ${labelOf(method2)} ${formatCOP(split2)}`
    : labelOf(method);

  // Todo lo que impide cerrar la venta se revisa ANTES de enviar el cobro al datáfono.
  const chargeProblem = (): string | null => {
    if (!session || !activeLoc) return "Abre la caja antes de cobrar";
    if (cart.length === 0) return "Agrega al menos una prenda";
    if (returnCredit && (creditShort || promoDiscount > 0 || pointsDiscount > 0)) return "En un cambio la prenda nueva debe cubrir todo el saldo, sin puntos ni códigos.";
    if (payable > 0 && !method) return "Selecciona el método de pago antes de cobrar";
    if (splitInvalid) return "Revisa el segundo medio de pago y su monto";
    if (invoiceMode === "empresa") {
      if (!invoiceName.trim()) return "Escribe la razón social o nombre para la factura, o elige consumidor final";
      if (!invoiceNit.trim()) return "Escribe el NIT o documento para la factura";
      if (invoiceEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceEmail.trim())) return "El correo de la factura no es válido";
    }
    return null;
  };

  const finalizeCharge = async (boldRef?: string): Promise<true | string> => {
    const invalid = chargeProblem();
    if (invalid) { toast.error(invalid); return invalid; }
    if (!session || !activeLoc) return "La caja no está abierta";
    setBusy(true);
    try {
      const wantsInvoice = invoiceMode === "empresa";
      const orderRow: TablesInsert<"orders"> = {
        // Pago mixto: el medio principal es el de mayor monto (R-Count recibe uno solo).
        source: "pos", sold_by_location_id: locationId, status: "draft", payment_status: "paid", payment_method: (isSplit && split2 > payable - split2 ? method2 : method) ?? "efectivo",
        // Points discount is subtracted later by apply_order_points; don't pre-apply it here.
        subtotal_cop: subtotal, shipping_cop: 0, total_cop: payable + (pointsToRedeem ? pointsDiscount : 0),
        discount_cop: promoDiscount,
        ...((appliedPromo || isSplit || boldRef) ? { notes: [appliedPromo ? `Código ${appliedPromo.code} (${appliedPromo.name})` : null, isSplit ? `Pago mixto: ${methodLabel}` : null, boldRef ? `Datáfono Bold ${boldRef}` : null].filter(Boolean).join(" · ") } : {}),
        contact_name: wantsInvoice ? invoiceName.trim() : (customer?.name ?? "Venta mostrador"),
        contact_email: wantsInvoice ? (invoiceEmail.trim() || customer?.email || null) : (customer?.email ?? null),
        contact_phone: customer?.phone ?? null,
        customer_id: customer?.id ?? null,
        invoice_requested: wantsInvoice,
        invoice_name: wantsInvoice ? invoiceName.trim() : null,
        invoice_document: wantsInvoice ? (invoiceNit.trim() || customer?.document || null) : null,
        invoice_email: wantsInvoice ? (invoiceEmail.trim() || null) : null,
      };
      let { data: order, error: oe } = await supabase.from("orders").insert(orderRow).select("id, number").single();
      // Clienta sin cuenta real: guardamos la venta con sus datos de contacto, sin enlazar cuenta.
      if (oe && String(oe.message ?? "").includes("orders_customer_id_fkey")) {
        ({ data: order, error: oe } = await supabase.from("orders").insert({ ...orderRow, customer_id: null }).select("id, number").single());
      }
      if (oe || !order) throw oe ?? new Error("No se pudo crear la venta");
      const { error: ie } = await supabase.from("order_items").insert(cart.map((l) => ({
        order_id: order.id, variant_id: l.variantId,
        product_name: l.productName, variant_label: l.label,
        qty: l.qty, unit_price_cop: l.price,
        ...(l.listPrice && l.listPrice > l.price ? { list_price_cop: l.listPrice } : {}),
      })));
      if (ie) throw ie;
      // Reservar stock antes de consumir el saldo a favor: si no hay unidades, el saldo queda intacto.
      const activeChannel = locations?.find((l) => l.id === activeLoc)?.channels?.[0] ?? undefined;
      const { error: re } = await supabase.rpc("reserve_stock", { _order_id: order.id, _minutes: 2, _channel: activeChannel });
      if (re) throw new Error("Sin stock suficiente.");
      if (returnCredit) {
        const { error: rc } = await supabase.rpc("apply_return_credit" as any, { _return_id: returnCredit.returnId, _order_id: order.id });
        if (rc) throw new Error(rc.message);
      }
      if (pointsDiscount > 0) {
        const { error: pe2 } = await supabase.rpc("apply_order_points", { _order_id: order.id, _points: pointsToRedeem });
        if (pe2) throw new Error(pe2.message);
      }
      const { error: ce } = await supabase.rpc("confirm_order", { _order_id: order.id });
      if (ce) throw ce;
      if (payable > 0) {
        const rows = isSplit
          ? [
              { session_id: session.id, order_id: order.id, method: method!, amount_cop: payable - split2 },
              { session_id: session.id, order_id: order.id, method: method2!, amount_cop: split2 },
            ]
          : [{ session_id: session.id, order_id: order.id, method: method!, amount_cop: payable }];
        const { error: pe } = await supabase.from("pos_sales").insert(rows);
        if (pe) throw pe;
      }
      toast.success(returnCredit ? `Cambio ${order.number} cerrado${payable > 0 ? ` · excedente ${formatCOP(payable)}` : ""}` : `Venta ${order.number} · ${methodLabel}`);
      setReceipt({
        orderId: order.id, number: order.number, createdAt: new Date().toISOString(),
        storeCode: locations?.find((l) => l.id === activeLoc)?.code ?? null,
        method: methodLabel || "—",
        customerName: wantsInvoice ? invoiceName.trim() : (customer?.name ?? "Consumidor final"),
        customerDoc: wantsInvoice ? (invoiceNit.trim() || customer?.document || null) : (customer?.document ?? "222222222222"),
        customerPhone: customer?.phone ?? null,
        lines: cart.map((l) => ({ name: l.productName, label: l.label, qty: l.qty, price: l.price })),
        total: payable, received: payable,
      });
      if (returnCredit) { sessionStorage.removeItem("pos-return-credit"); setReturnCredit(null); qc.invalidateQueries({ queryKey: ["returns"] }); }
      setCart([]);
      setCustomer(null);
      setInvoiceMode(defaultInvoiceMode());
      setMethod(null);
      setSplitOn(false); setMethod2(null); setAmount2("");
      setInvoiceName("");
      setInvoiceNit("");
      setInvoiceEmail("");
      setPointsOpen(false);
      setPointsInput("");
      setAppliedPromo(null);
      setPromoOpen(false);
      setPromoCode("");
      qc.invalidateQueries({ queryKey: ["loyalty"] });
      qc.invalidateQueries({ queryKey: ["pos-inventory"] });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? "Error al cobrar";
      toast.error(msg);
      return msg;
    } finally {
      setBusy(false);
    }
  };

  const boldAmount = method === "datafono" ? (isSplit ? payable - split2 : payable) : method2 === "datafono" && isSplit ? split2 : 0;
  const boldTerminal = (boldSettings.data?.terminals ?? []).find((t) => t.location_id === activeLoc);
  const charge = async () => {
    if (!session || !activeLoc || cart.length === 0) return;
    if (boldAmount > 0 && boldTerminal) {
      const invalid = chargeProblem();
      if (invalid) { toast.error(invalid); return; }
      setBusy(true);
      try {
        const r = await startBold({ data: { locationId: activeLoc, sessionId: session.id, amount: Math.round(boldAmount), description: `Tu Marca · ${cart.length} prenda(s)`, payer: { email: customer?.email ?? null, phone: customer?.phone ?? null, document: customer?.document ?? null } } });
        if (!r.ok) { toast.error(r.message); return; }
        setBoldWait({ id: r.id, amount: Math.round(boldAmount), terminal: r.terminalName, status: "pending", error: null });
      } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo enviar al datáfono"); }
      finally { setBusy(false); }
      return;
    }
    await finalizeCharge();
  };

  const closeBoldSale = async (id: string) => {
    if (boldFinalizing.current === id) return;
    boldFinalizing.current = id;
    try {
      const r = await finalizeCharge(id.slice(0, 8));
      if (r === true) { setBoldWait(null); setBoldHidden(false); }
      else { boldFinalizing.current = null; setBoldWait((w) => w && w.id === id ? { ...w, error: r } : w); }
    } catch (e) {
      boldFinalizing.current = null;
      setBoldWait((w) => w && w.id === id ? { ...w, error: e instanceof Error ? e.message : "No se pudo cerrar la venta" } : w);
    }
  };

  useEffect(() => {
    if (!boldWait || boldWait.status !== "pending") return;
    const id = boldWait.id;
    let stop = false;
    const check = async () => {
      let data: { status: string; error: string | null } | null = null;
      try { data = await boldStatus({ data: { id } }); } catch { return; }
      if (stop || !data || data.status === "pending") return;
      stop = true;
      setBoldWait((w) => w && w.id === id ? { ...w, status: data!.status, error: data!.error } : w);
      if (data.status === "approved") await closeBoldSale(id);
    };
    const ch = supabase.channel(`bold-${id}`).on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "pos_terminal_payments", filter: `id=eq.${id}` }, () => { void check(); }).subscribe();
    const iv = setInterval(check, 2500);
    void check();
    return () => { stop = true; clearInterval(iv); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boldWait?.id, boldWait?.status]);

  const activeName = locations?.find((l) => l.id === activeLoc)?.name ?? "";

  return (
    <div className="min-h-screen flex">
      {receipt && <PosReceiptModal sale={receipt} onClose={() => setReceipt(null)} />}
      {boldWait && boldHidden && boldWait.status === "approved" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-ink text-ivory rounded-full shadow-xl pl-5 pr-2 py-2 flex items-center gap-3 text-sm">
          <span>Pago Bold aprobado {formatCOP(boldWait.amount)} · corrige y registra</span>
          <button disabled={busy} onClick={() => { boldFinalizing.current = null; setBoldHidden(false); void closeBoldSale(boldWait.id); }} className="rounded-full bg-ivory text-ink px-4 py-1.5 disabled:opacity-50">Registrar venta</button>
        </div>
      )}
      {boldWait && !boldHidden && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-8 text-center space-y-4">
            <div className="text-[10px] uppercase tracking-widest text-moss/70">Datáfono Bold · {boldWait.terminal}</div>
            <div className="text-3xl">{formatCOP(boldWait.amount)}</div>
            {boldWait.status === "pending" ? (
              <>
                <p className="text-sm text-ink/70">Esperando el pago en el datáfono…</p>
                <div className="mx-auto size-8 rounded-full border-2 border-ink/15 border-t-ink animate-spin" />
                <button onClick={async () => { await cancelBold({ data: { id: boldWait.id } }); setBoldWait(null); }} className="w-full py-2.5 rounded-full border border-ink/15 text-sm hover:bg-ink/5">Cancelar cobro</button>
                <p className="text-[11px] text-ink/45">Si cancelas aquí, cancela también la notificación en el datáfono.</p>
              </>
            ) : boldWait.status === "approved" ? (
              <>
                <p className="text-sm text-ink/70">{boldWait.error ? "Pago aprobado en el datáfono, pero la venta no se pudo cerrar:" : "Pago aprobado en el datáfono. Cerrando la venta…"}</p>
                {boldWait.error && <p className="text-sm text-destructive">{boldWait.error}</p>}
                <button disabled={busy} onClick={() => { boldFinalizing.current = null; void closeBoldSale(boldWait.id); }} className="w-full py-2.5 rounded-full bg-ink text-ivory text-sm disabled:opacity-50">Registrar venta</button>
                {boldWait.error && <button onClick={() => setBoldHidden(true)} className="w-full py-2.5 rounded-full border border-ink/15 text-sm hover:bg-ink/5">Corregir datos en la caja</button>}
                <p className="text-[11px] text-ink/45">No vuelvas a cobrar en el datáfono: el pago ya fue aprobado.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-destructive">{boldWait.error ?? "El pago no se completó."}</p>
                <button onClick={() => setBoldWait(null)} className="w-full py-2.5 rounded-full bg-ink text-ivory text-sm">Volver a la caja</button>
              </>
            )}
          </div>
        </div>
      )}
      {cameraModal && activeLoc && (
        <CameraScanModal
          onClose={() => setCameraModal(false)}
          storeLocationId={activeLoc}
          onAddToCart={(v) => {
            setCart((prev) => {
              const existing = prev.find((l) => l.variantId === v.id);
              if (existing) return prev.map((l) => (l.variantId === v.id ? { ...l, qty: l.qty + 1 } : l));
              return [...prev, { variantId: v.id, productName: v.productName, label: [v.color, v.size].filter(Boolean).join(" · ") || v.sku, price: v.price_cop, qty: 1 }];
            });
            toast.success(`${v.productName} agregado`);
          }}
          onAssisted={(v) => { setAssistedInitial(v); setAssistedModal(true); }}
        />
      )}
      {assistedModal && activeLoc && (
        <AssistedOrderModal
          initialVariant={assistedInitial}
          onClose={() => { setAssistedModal(false); setAssistedInitial(null); }}
          session={session ? { id: session.id, sellerId: session.sellerId } : null}
          storeLocationId={activeLoc}
          storeName={activeName}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0 px-8 py-6">
        <header className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate({ to: "/admin" })} className="w-10 h-10 rounded-full border border-ink/10 flex items-center justify-center text-ink/70 hover:bg-ink/5">
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">POS · {activeName}</p>
            <h1 className="text-3xl">{title ?? "Caja"}</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-ink/10 text-sm">
              <User className="size-3.5 text-ink/60" />
              <span className="text-ink/60">Cajera:</span>
              <span className="font-medium">{session?.sellerName ?? "—"}</span>
            </div>
            <button onClick={() => setAssistedModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-ink/15 text-ink text-sm font-medium hover:bg-ink/5 transition-colors">
              Pedido con envío
            </button>
            {session && (
              <>
                <button onClick={() => setExpenseModal(true)} className="px-5 py-2.5 rounded-full bg-white border border-ink/15 text-ink text-sm font-medium hover:bg-ink/5 transition-colors">
                  Caja menor
                </button>
                <button onClick={() => setCloseModal(true)} className="px-5 py-2.5 rounded-full bg-ink text-ivory text-sm font-medium hover:bg-ink/85 transition-colors">
                  Cerrar caja
                </button>
              </>
            )}
            {!session && (
              <button onClick={() => setOpenModal(true)} className="px-5 py-2.5 rounded-full bg-ink text-ivory text-sm font-medium hover:bg-ink/85 transition-colors">
                Abrir caja
              </button>
            )}
          </div>
        </header>

        {!session && (
          <div className="mb-6 rounded-2xl bg-clay/10 border border-clay/20 px-5 py-4 flex items-center gap-3">
            <Lock className="size-4 text-clay" />
            <p className="text-sm text-ink/80">La caja está cerrada. Ábrela con tu PIN para empezar a vender.</p>
          </div>
        )}

        <div className="rounded-2xl bg-white border border-ink/10 p-3 flex items-center gap-2 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (!e.defaultPrevented && e.key === "Enter" && q.trim()) { e.preventDefault(); void addByCode(q.trim()); } }} placeholder="Buscar producto, SKU o escanear con pistola..." className="w-full pl-11 pr-4 py-2.5 rounded-full bg-ivory/60 border border-ink/10 focus:border-ink outline-none text-sm" />
          </div>
          <button onClick={() => setCameraModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-ink text-ivory text-sm hover:bg-ink/85">
            <Camera className="size-4" /> Escanear con cámara
          </button>
          {!defaultCode && locations?.slice(0, 4).map((l) => (
            <button key={l.id} onClick={() => setLocationId(l.id)} className={"px-4 py-2.5 rounded-full text-sm border transition-colors " + (activeLoc === l.id ? "bg-ink/5 border-ink/20 text-ink" : "border-transparent text-ink/60 hover:bg-ink/5")}>
              {l.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button onClick={() => setFilter({ kind: "all" })} className={"px-4 py-2 rounded-full text-xs uppercase tracking-widest border transition-colors " + (filter.kind === "all" ? "bg-ink text-ivory border-ink" : "bg-white text-ink/60 border-ink/15 hover:bg-ink/5")}>Todos</button>
          <button onClick={() => setTypeModal(true)} className={"flex items-center gap-1.5 px-4 py-2 rounded-full text-xs uppercase tracking-widest border transition-colors " + (filter.kind === "type" ? "bg-ink text-ivory border-ink" : "bg-white text-ink/60 border-ink/15 hover:bg-ink/5")}>
            <Tag className="size-3.5" /> {filter.kind === "type" ? filter.value : "Tipo de producto"}
          </button>
          <button onClick={() => setCollectionModal(true)} className={"flex items-center gap-1.5 px-4 py-2 rounded-full text-xs uppercase tracking-widest border transition-colors " + (filter.kind === "collection" ? "bg-ink text-ivory border-ink" : "bg-white text-ink/60 border-ink/15 hover:bg-ink/5")}>
            <Layers className="size-3.5" /> {filter.kind === "collection" ? (collections?.find((c) => c.id === filter.id)?.title ?? "Colección") : "Colección"}
          </button>
          <button onClick={() => setFilter({ kind: "offers" })} className={"flex items-center gap-1.5 px-4 py-2 rounded-full text-xs uppercase tracking-widest border transition-colors " + (filter.kind === "offers" ? "bg-ink text-ivory border-ink" : "bg-white text-ink/60 border-ink/15 hover:bg-ink/5")}>
            <Gift className="size-3.5" /> Ofertas / Cross-sell
          </button>
        </div>

        {typeModal && (
          <PickerModal
            title="Tipo de producto"
            onClose={() => setTypeModal(false)}
            options={(productTypes ?? []).map((t) => ({ id: t, label: t }))}
            selectedId={filter.kind === "type" ? filter.value : null}
            onPick={(id) => { setFilter(id ? { kind: "type", value: id } : { kind: "all" }); setTypeModal(false); }}
          />
        )}
        {collectionModal && (
          <PickerModal
            title="Colección"
            onClose={() => setCollectionModal(false)}
            options={(collections ?? []).map((c) => ({ id: c.id, label: c.title }))}
            selectedId={filter.kind === "collection" ? filter.id : null}
            onPick={(id) => { setFilter(id ? { kind: "collection", id } : { kind: "all" }); setCollectionModal(false); }}
          />
        )}

        {selectedProduct && (
          <ModalShell
            title={selectedProduct.name}
            subtitle="Escoge la talla para agregarla a la caja."
            onClose={() => setSelectedProductId(null)}
            footer={
              <div className="flex items-center justify-between border-t border-ink/10 pt-4 mt-4">
                <span className="text-xs text-ink/50">Precio</span>
                <span className="text-xl">{formatCOP(selectedProduct.variants[0]?.price_cop ?? 0)}</span>
              </div>
            }
          >
            <div className="space-y-5">
              {selectedProduct.image && (
                <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-cream/60">
                  <img src={selectedProduct.image} alt={selectedProduct.name} className="h-full w-full object-cover object-center" />
                </div>
              )}
              <div className="space-y-2">
                {selectedProduct.variants.map((variant) => {
                  const available = availHere(variant.inventory_levels);
                  const out = available <= 0;
                  return (
                    <Button
                      key={variant.id}
                      variant="outline"
                      disabled={!session}
                      onClick={() => { addLine(variant); setSelectedProductId(null); }}
                      className="h-auto min-h-16 w-full justify-between rounded-2xl px-4 py-3"
                    >
                      <span className="min-w-0 text-left">
                        <span className="block text-sm">{variant.size || "Única"}{variant.color ? ` · ${variant.color}` : ""}</span>
                        <span className="block truncate text-[11px] font-normal text-ink/50">{variant.sku}</span>
                      </span>
                      <span className={`shrink-0 ${out ? "text-clay text-[11px]" : "text-moss text-[11px]"}`}>{out ? "Sin stock" : `${available} disp.`}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </ModalShell>
        )}

        {filter.kind === "offers" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
            {(offers ?? []).map((o: any) => (
              <button key={o.id} onClick={() => addOffer(o)} disabled={!session} className="relative text-left rounded-2xl bg-white border border-ink/10 overflow-hidden hover:border-ink/30 transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
                <span className={"absolute top-3 left-3 z-10 text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full text-ivory " + (o.kind === "upsell" ? "bg-clay" : "bg-moss")}>{o.kind === "upsell" ? "Upsell" : "Cross-sell"}</span>
                <div className="aspect-square bg-cream/60 overflow-hidden flex items-center justify-center">
                  {o.image_url ? <img src={o.image_url} alt="" className="w-full h-full object-cover" /> : <Gift className="size-8 text-ink/20" />}
                </div>
                <div className="p-4">
                  <div className="text-lg truncate">{o.name}</div>
                  <div className="text-xs text-ink/50 mt-1">{o.items?.length ?? 0} artículos</div>
                  <div className="text-base mt-3 font-medium">{formatCOP(o.price_cop)}</div>
                </div>
              </button>
            ))}
            {offers && offers.length === 0 && (<p className="col-span-full text-ink/50 text-sm py-16 text-center">Aún no hay ofertas activas. Configúralas desde Sales Hub → Ofertas Cross y upsell.</p>)}
          </div>
        ) : (
        (() => {
          const total = productGroups.length;
          const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
          const current = Math.min(page, pageCount);
          const pageItems = productGroups.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
          return (
        <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5">
          {pageItems.map((product) => {
            const available = product.variants.reduce((sum, variant) => sum + availHere(variant.inventory_levels), 0);
            const out = available <= 0;
            const disabled = !session;
            return (
              <button key={product.id} onClick={() => !disabled && setSelectedProductId(product.id)} disabled={disabled} className="relative text-left rounded-2xl bg-white border border-ink/10 overflow-hidden hover:border-ink/30 transition-colors disabled:opacity-70 disabled:cursor-not-allowed">
                {out && (<span className="absolute top-3 right-3 z-10 text-[10px] uppercase tracking-widest bg-clay text-ivory px-2.5 py-1 rounded-full">Sin stock</span>)}
                <div className="aspect-square bg-cream/60 overflow-hidden flex items-center justify-center">
                  {product.image ? (<img src={product.image} alt="" className="w-full h-full object-cover" />) : (<Package className="size-8 text-ink/20" />)}
                </div>
                <div className="p-4">
                  <div className="text-lg truncate">{product.name}</div>
                  <div className="text-xs text-ink/50 mt-1">{product.variants.length} {product.variants.length === 1 ? "talla" : "tallas"}</div>
                  <div className="text-base mt-3 font-medium">{formatCOP(product.variants[0]?.price_cop ?? 0)}</div>
                </div>
              </button>
            );
          })}
          {total === 0 && (<p className="col-span-full text-ink/50 text-sm py-16 text-center">Sin resultados en esta ubicación.</p>)}
        </div>
        {total > PAGE_SIZE && (
          <div className="mt-6 flex items-center justify-between text-sm text-ink/70">
            <div>Mostrando {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, total)} de {total}</div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={current === 1} className="w-9 h-9 rounded-full border border-ink/15 flex items-center justify-center hover:bg-ink/5 disabled:opacity-30"><ChevronLeft className="size-4" /></button>
              <span className="px-3">{current} / {pageCount}</span>
              <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={current === pageCount} className="w-9 h-9 rounded-full border border-ink/15 flex items-center justify-center hover:bg-ink/5 disabled:opacity-30"><ChevronRight className="size-4" /></button>
            </div>
          </div>
        )}
        </>
          );
        })()
        )}
      </div>

      <aside className="w-[380px] shrink-0 border-l border-ink/10 bg-white flex flex-col h-dvh max-h-dvh overflow-hidden sticky top-0">
        <div className="p-6 border-b border-ink/5 flex items-center gap-2">
          <ShoppingBag className="size-5 text-ink/70" />
          <h2 className="text-2xl">Carrito</h2>
        </div>

        <div className="px-6 py-4 border-b border-ink/5">
          {customer ? (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-moss/70">Cliente</div>
                <div className="text-sm truncate">{customer.name}</div>
                {(customer.email || customer.phone) && (
                  <div className="text-xs text-ink/50 truncate">{customer.email ?? customer.phone}</div>
                )}
              </div>
              <button onClick={() => { setCustomer(null); setPointsOpen(false); setPointsInput(""); }} className="text-ink/40 hover:text-ink"><X className="size-4" /></button>
            </div>
          ) : (
            <button onClick={() => setCustomerModal(true)} className="w-full flex items-center justify-between px-4 py-2.5 rounded-full border border-dashed border-ink/25 text-sm text-ink/70 hover:bg-ink/5">
              <span className="flex items-center gap-2"><UserPlus className="size-4" /> Buscar o crear cliente</span><span>›</span>
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain sheet-scroll bg-white">
        {cart.length === 0 ? (
          <div className="px-6 py-6 text-sm text-ink/50">Agrega productos al carrito</div>
        ) : (
          <div className="divide-y divide-ink/5">
            {cart.map((l) => (
              <div key={l.variantId} className="p-5">
                <div className="flex justify-between gap-2">
                  <div className="text-sm">{l.productName}</div>
                  <button onClick={() => setQty(l.variantId, 0)} className="text-ink/40 hover:text-ink"><Trash2 className="size-3.5" /></button>
                </div>
                <div className="text-xs text-ink/50 mt-0.5">{l.label}</div>
                <div className="flex justify-between items-center mt-3">
                  <div className="flex items-center rounded-full border border-ink/15">
                    <button onClick={() => setQty(l.variantId, l.qty - 1)} className="p-1.5 pl-3"><Minus className="size-3" /></button>
                    <span className="px-3 text-sm">{l.qty}</span>
                    <button onClick={() => setQty(l.variantId, l.qty + 1)} className="p-1.5 pr-3"><Plus className="size-3" /></button>
                  </div>
                  <div className="text-sm font-medium">{formatCOP(l.price * l.qty)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="p-6 space-y-5 border-t border-ink/5">
          {appliedPromo ? (
            <div className="flex items-center justify-between px-4 py-3 rounded-full border border-moss/30 bg-moss/5 text-sm">
              <span className="flex items-center gap-2"><Tag className="size-4 text-moss" /> {appliedPromo.code} · {appliedPromo.kind === "percent" ? `${appliedPromo.value}%` : formatCOP(appliedPromo.value)}</span>
              <button onClick={() => setAppliedPromo(null)} className="text-ink/40 hover:text-ink"><X className="size-4" /></button>
            </div>
          ) : promoOpen ? (
            <div className="space-y-2">
            {posPromos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {posPromos.map((p) => (
                  <button key={p.id} onClick={() => selectPromo(p)} className="px-3 py-2 rounded-full border border-moss/30 bg-moss/5 text-xs hover:bg-moss/15">
                    {p.name} · {p.kind === "percent" ? `${p.value}%` : formatCOP(p.value)}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                autoFocus
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") applyPromo(); }}
                placeholder="Código de descuento"
                className="flex-1 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-mono bg-white"
              />
              <button onClick={applyPromo} disabled={promoBusy || !promoCode.trim()} className="px-4 py-2.5 rounded-full bg-ink text-ivory text-sm disabled:opacity-40">{promoBusy ? "…" : "Aplicar"}</button>
              <button onClick={() => { setPromoOpen(false); setPromoCode(""); }} className="px-3 text-ink/40 hover:text-ink"><X className="size-4" /></button>
            </div>
            </div>
          ) : (
             <button onClick={() => { setPromoOpen(true); setPointsOpen(false); setPointsInput(""); }} className="w-full flex items-center justify-between px-4 py-3 rounded-full border border-ink/15 text-sm text-ink/70 hover:bg-ink/5">
              <span className="flex items-center gap-2"><Tag className="size-4" /> Código de descuento</span><span>›</span>
            </button>
          )}
          {customer?.id && !appliedPromo && !returnCredit && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-ink/60"><span>Puntos Wild Circle</span><span>{pointsBalance.toLocaleString("es-CO")} disponibles</span></div>
              {redeemPts > 0 ? (
                pointsOpen ? (
                  <div className="rounded-2xl border border-ink/15 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="pos-points" className="text-xs text-ink/70">Puntos a gastar</label>
                      <button onClick={() => { setPointsOpen(false); setPointsInput(""); }} className="text-[11px] text-ink/50 hover:text-ink">Cancelar</button>
                    </div>
                    <input
                      id="pos-points"
                      autoFocus
                      inputMode="numeric"
                      value={pointsInput}
                      onChange={(event) => setPointsInput(event.target.value.replace(/\D/g, "").slice(0, 9))}
                      min={minimumPoints}
                      max={redeemPts}
                      onBlur={() => {
                        if (requestedPoints > redeemPts) setPointsInput(String(redeemPts));
                        else if (requestedPoints > 0 && requestedPoints < minimumPoints) setPointsInput(String(minimumPoints));
                      }}
                      placeholder={`Máximo ${redeemPts.toLocaleString("es-CO")}`}
                      className="w-full rounded-full border border-ink/15 px-4 py-2.5 text-sm outline-none focus:border-ink"
                    />
                    <div className="flex justify-between text-[11px] text-ink/50"><span>Máximo {redeemPts.toLocaleString("es-CO")} pts</span><span>{pointsDiscount > 0 ? `− ${formatCOP(pointsDiscount)}` : ""}</span></div>
                    {!validPointRedemption && <div className="text-[11px] text-clay">Ingresa entre {minimumPoints.toLocaleString("es-CO")} y {redeemPts.toLocaleString("es-CO")} puntos.</div>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-moss">Esta compra ganará {earnedPoints.toLocaleString("es-CO")} puntos</span>
                    <Button size="sm" variant="outline" onClick={() => { setPointsOpen(true); setPointsInput(""); setAppliedPromo(null); }} className="rounded-full shrink-0">Pagar con puntos</Button>
                  </div>
                )
              ) : (
                <div className="text-xs text-ink/50">Esta compra ganará {earnedPoints.toLocaleString("es-CO")} puntos.</div>
              )}
              {pointsOpen && <div className="text-xs text-clay">Al pagar con puntos, esta compra no acumula puntos nuevos.</div>}
              {pointsDiscount > 0 && <div className="flex justify-between text-sm"><span className="text-ink/70">Pago con puntos</span><span>− {formatCOP(pointsDiscount)}</span></div>}
            </div>
          )}
          {appliedPromo && customer?.id && (
            <div className="text-xs text-ink/50">Con código de descuento no se pueden usar puntos en la misma compra.</div>
          )}
          {promoDiscount > 0 && <div className="flex justify-between text-sm"><span className="text-ink/70">Descuento {appliedPromo?.code}</span><span>− {formatCOP(promoDiscount)}</span></div>}
          {returnCredit && (
            <div className="rounded-2xl border border-moss/30 bg-moss/5 p-3 space-y-1">
              <div className="flex justify-between text-sm"><span>Saldo a favor · devolución {returnCredit.orderNumber}</span><span>− {formatCOP(returnCredit.amount)}</span></div>
              <div className="text-[11px] text-ink/60">{returnCredit.code}. La prenda nueva debe valer igual o más; no quedan saldos pendientes.</div>
              {creditShort && <div className="text-[11px] text-clay">Faltan {formatCOP(returnCredit.amount - subtotal)} para cubrir el saldo.</div>}
              <button onClick={() => { sessionStorage.removeItem("pos-return-credit"); setReturnCredit(null); }} className="text-[11px] underline text-ink/50">Quitar saldo de esta venta</button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink/70">Total</span>
            <span className="text-3xl">{formatCOP(payable)}</span>
          </div>
          <div>
            <div className="text-xs text-ink/60 mb-2">Factura electrónica</div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setInvoiceMode("final")} className={"py-2.5 rounded-full text-sm transition-colors border " + (invoiceMode === "final" ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/15 hover:bg-ink/5")}>Consumidor final</button>
              <button onClick={() => setInvoiceMode("empresa")} className={"py-2.5 rounded-full text-sm transition-colors border " + (invoiceMode === "empresa" ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/15 hover:bg-ink/5")}>Con datos / NIT</button>
            </div>
            {invoiceMode === "empresa" && (
              <div className="mt-2 space-y-2">
                <input value={invoiceName} onChange={(e) => setInvoiceName(e.target.value)} placeholder="Razón social o nombre" className="w-full rounded-full border border-ink/15 px-4 py-2.5 text-sm outline-none focus:border-ink bg-white" />
                <input value={invoiceNit} onChange={(e) => setInvoiceNit(e.target.value.replace(/[^\w-]/g, ""))} placeholder="NIT, cédula o pasaporte" className="w-full rounded-full border border-ink/15 px-4 py-2.5 text-sm outline-none focus:border-ink bg-white" />
                <input value={invoiceEmail} onChange={(e) => setInvoiceEmail(e.target.value)} type="email" placeholder="Correo para la factura" className="w-full rounded-full border border-ink/15 px-4 py-2.5 text-sm outline-none focus:border-ink bg-white" />
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-ink/60 mb-2">Método de pago {!method && <span className="text-destructive">· elige uno</span>}</div>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => (
                <button key={m.id} onClick={() => { setMethod(m.id); if (method2 === m.id) setMethod2(null); }} className={"py-2.5 rounded-full text-sm transition-colors border " + (method === m.id ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/15 hover:bg-ink/5")}>{m.label}</button>
              ))}
            </div>
            {method !== "credito_15" && (
              <div className="mt-3">
                <label className="flex items-center gap-2 text-xs text-ink/70">
                  <input type="checkbox" checked={splitOn} onChange={(e) => { setSplitOn(e.target.checked); if (!e.target.checked) { setMethod2(null); setAmount2(""); } }} />
                  Pagar con dos medios
                </label>
                {splitOn && (
                  <div className="mt-2 space-y-2 rounded-2xl border border-ink/10 bg-ivory/50 p-3">
                    <div className="text-[11px] text-ink/60">Segundo medio de pago</div>
                    <div className="grid grid-cols-2 gap-2">
                      {METHODS.filter((m) => m.id !== method && m.id !== "credito_15").map((m) => (
                        <button key={m.id} onClick={() => setMethod2(m.id)} className={"py-2 rounded-full text-xs border " + (method2 === m.id ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/15 hover:bg-ink/5")}>{m.label}</button>
                      ))}
                    </div>
                    <input value={amount2} onChange={(e) => setAmount2(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Monto con el segundo medio" className="w-full rounded-full border border-ink/15 px-4 py-2 text-sm bg-white" />
                    <div className="text-[11px] text-ink/70">
                      {METHODS.find((m) => m.id === method)?.label}: <b>{formatCOP(Math.max(0, payable - split2))}</b>
                      {method2 && <> · {METHODS.find((m) => m.id === method2)?.label}: <b>{formatCOP(split2)}</b></>}
                    </div>
                    {splitInvalid && <div className="text-[11px] text-destructive">Elige el segundo medio y un monto mayor a 0 y menor al total.</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
        <div className="shrink-0 p-5 border-t border-ink/10 bg-white">
          <button onClick={charge} disabled={busy || cart.length === 0 || !session || (payable > 0 && !method) || splitInvalid || !validPointRedemption || creditShort} className="w-full bg-ink text-ivory py-3.5 rounded-full text-sm font-medium hover:bg-ink/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {busy ? "Procesando…" : !session ? "Abre la caja para cobrar" : creditShort ? "Agrega prendas por igual o mayor valor" : returnCredit && payable === 0 ? "Cerrar cambio sin excedente" : !method && payable > 0 ? "Elige el método de pago" : `Cobrar ${formatCOP(payable)} · ${methodLabel}`}
          </button>
        </div>
      </aside>

      {openModal && activeLoc && (
        <OpenCajaModal
          locationId={activeLoc}
          onClose={() => setOpenModal(false)}
          onOpened={(s) => { setSession(s); setOpenModal(false); }}
        />
      )}
      {closeModal && session && (
        <CloseCajaModal
          session={session}
          onClose={() => setCloseModal(false)}
          onClosed={() => { setSession(null); setCloseModal(false); }}
        />
      )}
      {customerModal && (
        <CustomerModal
          onClose={() => setCustomerModal(false)}
          onPick={(c) => { setCustomer(c); setInvoiceMode("empresa"); if (c.name) setInvoiceName(c.name); if (c.email) setInvoiceEmail(c.email); if (c.document) setInvoiceNit(c.document); setCustomerModal(false); }}
        />
      )}
      {expenseModal && session && (
        <ExpenseModal
          sessionId={session.id}
          sellerId={session.sellerId}
          onClose={() => setExpenseModal(false)}
        />
      )}
    </div>
  );
}

/* ---------------- Modals ---------------- */

function ModalShell({ title, subtitle, children, footer, onClose }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[86vh] flex flex-col p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full hover:bg-ink/5 flex items-center justify-center"><X className="size-4" /></button>
        <h3 className="text-2xl">{title}</h3>
        {subtitle && <p className="text-sm text-ink/60 mt-1">{subtitle}</p>}
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto sheet-scroll -mr-4 pr-4">{children}</div>
        {footer && <div className="shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

function OpenCajaModal({ locationId, onClose, onOpened }: {
  locationId: string;
  onClose: () => void;
  onOpened: (s: ActiveSession) => void;
}) {
  const [pin, setPin] = useState("");
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const submit = async () => {
    if (!pin || pin.length < 4) return toast.error("Ingresa tu PIN de vendedora");
    setBusy(true);
    try {
      const { data: seller, error } = await supabase
        .from("profiles").select("id, full_name").eq("pos_pin", pin).maybeSingle();
      if (error) throw error;
      if (!seller) { setNotFound(true); throw new Error("PIN no encontrado"); }
      const opening = Math.max(0, Math.round(Number(base) || 0));
      const { data: sess, error: se } = await supabase.from("pos_sessions")
        .insert({ opened_by: seller.id, location_id: locationId, opening_cash_cop: opening })
        .select("id").single();
      if (se) throw se;
      toast.success(`Caja abierta · ${seller.full_name ?? "Vendedora"}`);
      onOpened({ id: sess.id, sellerId: seller.id, sellerName: seller.full_name ?? "Vendedora", openingCash: opening, locationId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al abrir caja");
    } finally { setBusy(false); }
  };

  const claimPin = async () => {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Debes iniciar sesión");
      const { error } = await supabase.from("profiles").update({ pos_pin: pin }).eq("id", u.user.id);
      if (error) throw error;
      toast.success("PIN registrado. Vuelve a intentar abrir caja.");
      setNotFound(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el PIN");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="Abrir caja" subtitle="Identifícate y registra la base inicial en efectivo." onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-ink/60">PIN de vendedora</label>
          <input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setNotFound(false); }} type="password" inputMode="numeric" autoFocus className="w-full mt-1 px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-center text-2xl tracking-[0.4em]" placeholder="••••" />
          {notFound && (
            <button onClick={claimPin} disabled={busy || pin.length < 4} className="mt-2 text-xs text-clay hover:underline disabled:opacity-50">
              ¿Primera vez? Registrar {pin} como tu PIN
            </button>
          )}
        </div>
        <div>
          <label className="text-xs text-ink/60">Base inicial en efectivo (COP)</label>
          <input value={base} onChange={(e) => setBase(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="w-full mt-1 px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-lg" placeholder="0" />
          {base && <p className="text-xs text-ink/50 mt-1">{formatCOP(Number(base))}</p>}
        </div>
        <button onClick={submit} disabled={busy} className="w-full bg-ink text-ivory py-3.5 rounded-full text-sm font-medium hover:bg-ink/85 disabled:opacity-50">
          {busy ? "Abriendo…" : "Abrir caja"}
        </button>
      </div>
    </ModalShell>
  );
}

function PickerModal({ title, options, selectedId, onPick, onClose }: { title: string; options: { id: string; label: string }[]; selectedId: string | null; onPick: (id: string | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const filtered = options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <ModalShell title={title} subtitle="Elige una opción para filtrar los productos." onClose={onClose}>
      <div className="space-y-3">
        <div className="relative">
          <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Buscar…" className="w-full pl-11 pr-4 py-3 rounded-full bg-ivory/60 border border-ink/10 focus:border-ink outline-none text-sm" />
        </div>
        <button onClick={() => onPick(null)} className={"w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm transition " + (!selectedId ? "bg-ink text-ivory border-ink" : "bg-white text-ink border-ink/10 hover:bg-ink/5")}>
          <span>Todos</span>
          {!selectedId && <Check className="size-4" />}
        </button>
        <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
          {filtered.map((o) => (
            <button key={o.id} onClick={() => onPick(o.id)} className={"w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-sm transition " + (selectedId === o.id ? "bg-ink text-ivory border-ink" : "bg-white text-ink border-ink/10 hover:bg-ink/5")}>
              <span className="truncate">{o.label}</span>
              {selectedId === o.id && <Check className="size-4 shrink-0" />}
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-ink/50 text-center py-6">Sin resultados.</p>}
        </div>
      </div>
    </ModalShell>
  );
}

function CloseCajaModal({ session, onClose, onClosed }: {
  session: ActiveSession;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const pickReceipt = (file: File | null) => {
    setReceiptFile(file);
    setReceiptPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return file ? URL.createObjectURL(file) : null; });
  };

  const { data: sales } = useQuery({
    queryKey: ["pos-session-sales", session.id],
    queryFn: async () => (await supabase.from("pos_sales").select("method, amount_cop, created_at, order_id, orders(number)").eq("session_id", session.id).order("created_at")).data ?? [],
  });

  const printClosing = async () => {
    const list = (sales ?? []) as any[];
    const ids = list.map((s) => s.order_id).filter(Boolean);
    const [{ data: invs }, { data: loc }, { data: sess }] = await Promise.all([
      ids.length ? supabase.from("invoices").select("order_id, number, status").in("order_id", ids) : Promise.resolve({ data: [] as any[] }),
      supabase.from("locations").select("name, code").eq("id", session.locationId).maybeSingle(),
      supabase.from("pos_sessions").select("opened_at").eq("id", session.id).maybeSingle(),
    ]);
    const invMap = new Map<string, string>();
    for (const i of (invs ?? []) as any[]) if (i.number && (i.status === "issued" || !invMap.has(i.order_id))) invMap.set(i.order_id, i.number);
    const openedAt = (sess as any)?.opened_at as string | undefined;
    const { data: cns } = openedAt
      ? await supabase.from("pos_credit_notes").select("external_id, numero_dian, invoice_number, total, created_at, orders(pos_sales(pos_sessions(location_id)))").eq("status", "issued").gte("created_at", openedAt).order("created_at")
      : { data: [] as any[] };
    const creditNotes = ((cns ?? []) as any[])
      .filter((n) => (n.orders?.pos_sales ?? []).some((ps: any) => ps.pos_sessions?.location_id === session.locationId))
      .map((n) => ({ time: n.created_at, number: n.numero_dian ?? n.external_id, invoice: n.invoice_number ?? null, amount: Number(n.total ?? 0) }));
    const labels: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", datafono: "Datáfono", transferencia: "Transferencia", wompi: "Wompi", link_pago: "Link de pago", link_wompi: "Link Wompi", link_bold: "Link Bold", credito_15: "Crédito a 15 días" };
    const agg = new Map<string, { amount: number; count: number }>();
    for (const s of list) { const a = agg.get(s.method) ?? { amount: 0, count: 0 }; a.amount += s.amount_cop; a.count++; agg.set(s.method, a); }
    const code = String((loc as any)?.code ?? "").toLowerCase();
    printPosClosing({
      storeName: (loc as any)?.name ?? "",
      storeCode: code.includes("cali") ? "cali" : code.includes("bog") ? "bogota" : code,
      sellerName: session.sellerName,
      openedAt: (sess as any)?.opened_at ?? null,
      sales: list.map((s) => ({ time: s.created_at, number: s.orders?.number ?? "", invoice: invMap.get(s.order_id) ?? null, method: labels[s.method] ?? s.method, amount: s.amount_cop })),
      byMethod: [...agg.entries()].map(([m, a]) => ({ label: labels[m] ?? m, ...a })),
      total: totals.grand,
      openingCash: session.openingCash,
      cashIn, cashOut, expectedCash,
      counted: counted === "" ? null : Number(counted),
      creditNotes,
    });
  };

  const { data: expenses } = useQuery({
    queryKey: ["pos-session-expenses", session.id],
    queryFn: async () => (await supabase.from("pos_expenses").select("amount_cop, reason, category").eq("session_id", session.id)).data ?? [],
  });
  const cashIn = useMemo(() => (expenses ?? []).filter((e) => String(e.category ?? "").startsWith("ingreso")).reduce((s, e) => s + e.amount_cop, 0), [expenses]);
  const cashOut = useMemo(() => (expenses ?? []).filter((e) => !String(e.category ?? "").startsWith("ingreso")).reduce((s, e) => s + e.amount_cop, 0), [expenses]);
  const expensesTotal = cashOut - cashIn;

  const totals = useMemo(() => {
    const t: Record<string, number> = { efectivo: 0, tarjeta: 0, datafono: 0, transferencia: 0, wompi: 0, link_pago: 0, link_wompi: 0, link_bold: 0, credito_15: 0 };
    let grand = 0;
    for (const s of sales ?? []) { t[s.method] = (t[s.method] ?? 0) + s.amount_cop; grand += s.amount_cop; }
    return { byMethod: t, grand };
  }, [sales]);

  const expectedCash = session.openingCash + totals.byMethod.efectivo - expensesTotal;
  const diff = (Number(counted) || 0) - expectedCash;

  const submit = async () => {
    if (counted === "") return toast.error("Indica el efectivo contado");
    setBusy(true);
    try {
      let receiptPath: string | null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop()?.toLowerCase() || "jpg";
        receiptPath = `${session.id}/tirilla-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("pos-receipts").upload(receiptPath, receiptFile, { upsert: true });
        if (upErr) throw upErr;
      }
      const { error } = await supabase.from("pos_sessions").update({
        closed_at: new Date().toISOString(),
        closing_cash_cop: Math.round(Number(counted)),
        notes: notes || null,
        ...(receiptPath ? { closing_receipt_path: receiptPath } : {}),
      }).eq("id", session.id);
      if (error) throw error;
      toast.success("Caja cerrada");
      onClosed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cerrar caja");
    } finally { setBusy(false); }
  };

  const row = (label: string, value: number, muted = false) => (
    <div className={"flex justify-between text-sm " + (muted ? "text-ink/60" : "")}>
      <span>{label}</span><span className="font-medium">{formatCOP(value)}</span>
    </div>
  );

  return (
    <ModalShell title="Cierre de caja" subtitle={`Vendedora: ${session.sellerName}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-ivory/60 border border-ink/10 p-4 space-y-1.5">
          {row("Base inicial", session.openingCash, true)}
          {row("Efectivo", totals.byMethod.efectivo)}
          {row("Tarjeta", totals.byMethod.tarjeta)}
          {row("Datáfono", totals.byMethod.datafono)}
          {row("Transferencia", totals.byMethod.transferencia)}
          {totals.byMethod.wompi > 0 && row("Wompi", totals.byMethod.wompi)}
          {cashIn > 0 && row("Entradas de efectivo", cashIn)}
          {cashOut > 0 && row("Salidas de efectivo", -cashOut)}
          <div className="border-t border-ink/10 pt-2 mt-2">
            {row("Total ventas", totals.grand)}
            {row("Efectivo esperado", expectedCash)}
          </div>
        </div>
        <div>
          <label className="text-xs text-ink/60">Efectivo contado en caja (COP)</label>
          <input value={counted} onChange={(e) => setCounted(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoFocus className="w-full mt-1 px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-lg" placeholder="0" />
          {counted !== "" && (
            <p className={"text-xs mt-1 " + (diff === 0 ? "text-moss" : diff > 0 ? "text-ink/60" : "text-clay")}>
              {diff === 0 ? "Cuadra exactamente." : diff > 0 ? `Sobrante: ${formatCOP(diff)}` : `Faltante: ${formatCOP(Math.abs(diff))}`}
            </p>
          )}
        </div>
        <div>
          <label className="text-xs text-ink/60">Notas (opcional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full mt-1 px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm resize-none" />
        </div>
        <div>
          <label className="text-xs text-ink/60">Foto de la tirilla del datáfono (opcional)</label>
          <input
            ref={receiptInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => pickReceipt(e.target.files?.[0] ?? null)}
          />
          {receiptPreview ? (
            <div className="mt-2 relative rounded-2xl overflow-hidden border border-ink/10">
              <img src={receiptPreview} alt="Tirilla del datáfono" className="w-full max-h-56 object-cover" />
              <button
                type="button"
                onClick={() => pickReceipt(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-ink/70 text-ivory flex items-center justify-center hover:bg-ink"
                aria-label="Quitar foto"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => receiptInputRef.current?.click()}
              className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-ink/20 text-sm text-ink/60 hover:border-ink/40 hover:text-ink transition"
            >
              <ImagePlus className="size-4" /> Tomar o subir foto de la tirilla
            </button>
          )}
        </div>
        <button type="button" onClick={printClosing} className="w-full border border-ink/20 py-3 rounded-full text-sm font-medium hover:border-ink">
          Imprimir tirilla de cierre
        </button>
        <button onClick={submit} disabled={busy} className="w-full bg-ink text-ivory py-3.5 rounded-full text-sm font-medium hover:bg-ink/85 disabled:opacity-50">
          {busy ? "Cerrando…" : "Confirmar cierre"}
        </button>
      </div>
    </ModalShell>
  );
}

function CustomerModal({ onClose, onPick }: { onClose: () => void; onPick: (c: CustomerRef) => void }) {
  const [tab, setTab] = useState<"buscar" | "nuevo">("buscar");
  const [q, setQ] = useState("");
  const [newC, setNewC] = useState({ name: "", email: "", phone: "", document: "", city: "", country: "" });
  const search = useServerFn(searchPosCustomers);
  const saveDoc = useServerFn(savePosCustomerDocument);
  const ensureAccount = useServerFn(ensurePosCustomerAccount);
  const [creating, setCreating] = useState(false);
  const [docFor, setDocFor] = useState<PosCustomerHit | null>(null);
  const [docVal, setDocVal] = useState("");

  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data: results, isFetching: searching } = useQuery({
    queryKey: ["pos-customer-search", dq.toLowerCase()],
    enabled: tab === "buscar" && dq.length >= 2,
    queryFn: () => search({ data: { q: dq } }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const pick = async (c: PosCustomerHit) => {
    if (!c.id && c.email) {
      try {
        const r = await ensureAccount({ data: { name: c.name, email: c.email, phone: c.phone, document: c.document } });
        toast.success(r.created ? "Cuenta creada para acumular puntos" : "Compra asignada a su cuenta");
        c = { ...c, id: r.id, source: "online" };
      } catch { toast.error("No se pudo crear su cuenta; se usará sin cuenta"); }
    }
    if (c.id && !c.document) { setDocFor(c); setDocVal(/^\d{5,}$/.test(q.trim()) ? q.trim() : ""); return; }
    onPick({ id: c.id, name: c.name, email: c.email, phone: c.phone, document: c.document });
  };
  const SOURCE_LABEL = { online: "Cliente online", shopify: "Online Nacional", order: "Compra anterior" } as const;

  if (docFor) {
    return (
      <ModalShell title={docFor.name} subtitle="¿Guardar su cédula para encontrarla más rápido la próxima vez?" onClose={onClose}>
        <div className="space-y-3">
          <input value={docVal} onChange={(e) => setDocVal(e.target.value.replace(/[^\w-]/g, ""))} autoFocus placeholder="Cédula o pasaporte" className="w-full px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm" />
          <div className="flex gap-2">
            <button onClick={() => onPick({ id: docFor.id, name: docFor.name, email: docFor.email, phone: docFor.phone, document: docFor.document })} className="flex-1 py-3 rounded-full border border-ink/15 text-sm">Omitir</button>
            <button
              onClick={async () => {
                if (docVal.trim().length >= 4) {
                  try { await saveDoc({ data: { userId: docFor.id!, document: docVal.trim() } }); toast.success("Cédula guardada en su perfil"); }
                  catch { toast.error("No se pudo guardar la cédula"); }
                }
                onPick({ id: docFor.id, name: docFor.name, email: docFor.email, phone: docFor.phone, document: docVal.trim() || docFor.document });
              }}
              className="flex-1 bg-ink text-ivory py-3 rounded-full text-sm font-medium">Guardar y usar</button>
          </div>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Cliente" subtitle="Búscala en el CRM o crea una nueva." onClose={onClose}>
      <div className="flex gap-1 bg-ivory/60 rounded-full p-1 mb-4">
        {(["buscar", "nuevo"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={"flex-1 text-sm py-2 rounded-full transition " + (tab === t ? "bg-ink text-ivory" : "text-ink/60")}>{t === "buscar" ? "Buscar" : "Nueva"}</button>
        ))}
      </div>
      {tab === "buscar" ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Nombre, correo, cédula o teléfono" className="w-full pl-11 pr-4 py-3 rounded-full border border-ink/15 outline-none focus:border-ink text-sm" />
          </div>
          <div className="max-h-72 overflow-auto divide-y divide-ink/5 rounded-2xl border border-ink/10">
            {q.length < 2 && <p className="p-6 text-sm text-ink/50 text-center">Escribe al menos 2 letras</p>}
            {q.trim().length >= 2 && searching && !results?.length && <p className="p-6 text-sm text-ink/50 text-center">Buscando…</p>}
            {q.trim().length >= 2 && !searching && results?.length === 0 && <p className="p-6 text-sm text-ink/50 text-center">Sin resultados</p>}
            {results?.map((c, i) => (
              <button key={i} onClick={() => pick(c)} className="w-full text-left p-4 hover:bg-ink/5">
                <div className="flex items-center justify-between gap-2 text-sm"><span>{c.name}</span><span className={"text-[10px] uppercase tracking-wider " + (c.id ? "text-moss" : "text-ink/40")}>{SOURCE_LABEL[c.source]}</span></div>
                <div className="text-xs text-ink/50">{[c.email, c.document ? `CC ${c.document}` : null, c.phone].filter(Boolean).join(" · ") || "—"}</div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input value={newC.name} onChange={(e) => setNewC({ ...newC, name: e.target.value })} autoFocus placeholder="Nombre completo" className="w-full px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm" />
          <input value={newC.email} onChange={(e) => setNewC({ ...newC, email: e.target.value })} type="email" placeholder="Email (opcional)" className="w-full px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm" />
          <input value={newC.phone} onChange={(e) => setNewC({ ...newC, phone: e.target.value })} placeholder="Teléfono (opcional)" className="w-full px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm" />
          <input value={newC.document} onChange={(e) => setNewC({ ...newC, document: e.target.value.replace(/[^\w-]/g, "") })} placeholder="Cédula o pasaporte (opcional)" className="w-full px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <CountrySelect value={newC.country} onChange={(v) => setNewC({ ...newC, country: v, city: "" })} />
            </div>
            <div>
              <CitySelect country={newC.country} value={newC.city} onChange={(v) => setNewC({ ...newC, city: v })} />
            </div>
          </div>
          {newC.email.trim() && <p className="text-xs text-moss">Se creará su cuenta con este correo para acumular puntos.</p>}
          <button
            disabled={creating}
            onClick={async () => {
              if (!newC.name.trim()) return toast.error("El nombre es requerido");
              const base = { name: newC.name.trim(), email: newC.email.trim() || null, phone: newC.phone.trim() || null, document: newC.document.trim() || null, city: newC.city.trim() || null, country: newC.country.trim() || null };
              if (!base.email) return onPick(base);
              setCreating(true);
              try {
                const r = await ensureAccount({ data: { name: base.name, email: base.email, phone: base.phone, document: base.document, city: base.city, country: base.country } });
                toast.success(r.created ? "Cuenta creada" : "Ya tenía cuenta: compra asignada a ella");
                onPick({ ...base, id: r.id });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "No se pudo crear la cuenta");
              } finally { setCreating(false); }
            }}
            className="w-full bg-ink text-ivory py-3 rounded-full text-sm font-medium hover:bg-ink/85 disabled:opacity-50">
            {creating ? "Creando cuenta…" : "Usar cliente"}
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function ExpenseModal({ sessionId, sellerId, onClose }: { sessionId: string; sellerId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [dir, setDir] = useState<"out" | "in">("out");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("otro");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const CATS = dir === "out"
    ? [
        { id: "proveedor", label: "Proveedor" },
        { id: "domicilio", label: "Domicilio" },
        { id: "papeleria", label: "Papelería" },
        { id: "aseo", label: "Aseo" },
        { id: "otro", label: "Otro" },
      ]
    : [
        { id: "ingreso_base", label: "Refuerzo de base" },
        { id: "ingreso_cambio", label: "Sencillo / cambio" },
        { id: "ingreso_otro", label: "Otro" },
      ];

  const switchDir = (d: "out" | "in") => { setDir(d); setCategory(d === "out" ? "otro" : "ingreso_otro"); };

  const submit = async () => {
    const amt = Math.round(Number(amount) || 0);
    if (amt <= 0) return toast.error("Ingresa el monto");
    if (!reason.trim()) return toast.error("Indica el motivo");
    setBusy(true);
    try {
      const { error } = await supabase.from("pos_expenses").insert({
        session_id: sessionId,
        amount_cop: amt,
        category,
        reason: reason.trim(),
        created_by: sellerId,
      });
      if (error) throw error;
      toast.success(`${dir === "out" ? "Salida" : "Entrada"} registrada · ${formatCOP(amt)}`);
      qc.invalidateQueries({ queryKey: ["pos-session-expenses", sessionId] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar el movimiento");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="Caja menor" subtitle="Entrada o salida de efectivo. Se refleja en el efectivo esperado del arqueo." onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {([["out", "Salida de efectivo"], ["in", "Entrada de efectivo"]] as const).map(([d, l]) => (
            <button key={d} onClick={() => switchDir(d)} className={"py-2.5 rounded-full text-sm border transition " + (dir === d ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/15 hover:bg-ink/5")}>{l}</button>
          ))}
        </div>
        <div>
          <label className="text-xs text-ink/60">Monto (COP)</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} inputMode="numeric" autoFocus className="w-full mt-1 px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-lg" placeholder="0" />
          {amount && <p className="text-xs text-ink/50 mt-1">{formatCOP(Number(amount))}</p>}
        </div>
        <div>
          <label className="text-xs text-ink/60">Categoría</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {CATS.map((c) => (
              <button key={c.id} onClick={() => setCategory(c.id)} className={"px-3.5 py-1.5 rounded-full text-xs border transition " + (category === c.id ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/15 hover:bg-ink/5")}>{c.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-ink/60">Motivo</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full mt-1 px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm resize-none" placeholder={dir === "out" ? "Ej. Pago de domicilio, compra de bolsas..." : "Ej. Refuerzo de base desde administración..."} />
        </div>
        <button onClick={submit} disabled={busy} className="w-full bg-ink text-ivory py-3.5 rounded-full text-sm font-medium hover:bg-ink/85 disabled:opacity-50">
          {busy ? "Registrando…" : dir === "out" ? "Registrar salida" : "Registrar entrada"}
        </button>
      </div>
    </ModalShell>
  );
}