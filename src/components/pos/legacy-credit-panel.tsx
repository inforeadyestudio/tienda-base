import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { colombiaMonth, legacyCreditSchema, type LegacyCreditInput } from "@/lib/returns/legacy-credit";
import { issueLegacyPosCredit, refreshLegacyPosCredit } from "@/lib/returns/legacy-credit.functions";

type Line = LegacyCreditInput["lines"][number];
type Variant = { sku: string | null; size: string | null; products: { name: string } | null };
type Note = { id: string; sale_month: string; external_id: string; status: string; resolution: string; total: number; numero_dian: string | null; cude: string | null; public_url: string | null; error: string | null; inventory_applied_at: string | null; created_at: string; lines: Line[]; locations: { name: string } | null };
const fieldClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";

export function LegacyCreditPanel({ locationId, locationName }: { locationId: string; locationName: string }) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const refresh = useServerFn(refreshLegacyPosCredit);
  const qc = useQueryClient();
  const { data: notes = [], isLoading, error } = useQuery({
    queryKey: ["legacy-pos-notes", locationId],
    queryFn: () => fetchAll<Note>((from, to) => (supabase as any).from("pos_legacy_credit_notes").select("*, locations!location_id(name)").eq("location_id", locationId).order("created_at", { ascending: false }).order("id").range(from, to)),
  });
  const consult = async (id: string) => {
    setRefreshing(id);
    try {
      const r = await refresh({ data: { id } });
      toast[r.status === "issued" ? "success" : "warning"](r.status === "issued" ? r.inventoryApplied ? "Nota aprobada e inventario actualizado" : "Nota aprobada; reingreso pendiente" : r.error ?? "La nota sigue pendiente");
      await qc.invalidateQueries({ queryKey: ["legacy-pos-notes"] });
      await qc.invalidateQueries({ queryKey: ["pos-inventory"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo consultar"); }
    finally { setRefreshing(null); }
  };
  return <section className="px-4 pb-8 sm:px-10">
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
      <h2 className="font-nm text-xl">Notas crédito · sistema anterior</h2>
      <Button variant="outline" onClick={() => setOpen(true)}><Plus />Sin factura (sistema anterior)</Button>
    </div>
    {isLoading && <p className="py-4 text-sm text-muted-foreground">Cargando notas…</p>}
    {error && <p role="alert" className="py-4 text-sm text-destructive">No se pudieron cargar las notas.</p>}
    {!isLoading && !error && !notes.length && <p className="py-4 text-sm text-muted-foreground">Sin notas crédito del sistema anterior.</p>}
    <div className="mt-4 space-y-3">
      {notes.map((n) => <article key={n.id} className="rounded-md border border-border p-4">
        <div className="flex flex-wrap justify-between gap-2">
          <div><p className="font-medium">{n.numero_dian ?? n.external_id}</p><p className="text-sm text-muted-foreground">Sin factura (sistema anterior) · {n.sale_month} · {n.resolution === "cambio" ? "Cambio" : "Reembolso"}</p></div>
          <div className="text-right"><p>{formatCOP(n.total)}</p><p className="text-sm text-muted-foreground">{n.status === "issued" ? "Aprobada DIAN" : n.status === "error" ? "Error DIAN" : "Pendiente DIAN"}</p></div>
        </div>
        <p className="mt-2 text-sm">{n.lines.map((l) => `${l.quantity} × ${l.sku}`).join(" · ")}</p>
        {n.cude && <details className="mt-2 text-xs text-muted-foreground"><summary>Código de validación</summary><p className="break-all">{n.cude}</p></details>}
        {n.error && <p role="status" className="mt-2 text-sm text-destructive">{n.error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {n.public_url?.startsWith("https://") && <Button asChild variant="outline" size="sm"><a href={n.public_url} target="_blank" rel="noopener noreferrer">Ver PDF</a></Button>}
          {(n.status !== "issued" || !n.inventory_applied_at) && <Button variant="outline" size="sm" disabled={refreshing === n.id} onClick={() => consult(n.id)}><RefreshCw className={refreshing === n.id ? "animate-spin" : ""} />Consultar estado</Button>}
        </div>
      </article>)}
    </div>
    {open && <LegacyCreditModal locationId={locationId} locationName={locationName} onClose={() => setOpen(false)} />}
  </section>;
}

function LegacyCreditModal({ locationId, locationName, onClose }: { locationId: string; locationName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const issue = useServerFn(issueLegacyPosCredit);
  const [requestId] = useState(() => crypto.randomUUID());
  const [saleMonth, setSaleMonth] = useState("");
  const [destination, setDestination] = useState(locationId);
  const [resolution, setResolution] = useState<LegacyCreditInput["resolution"]>("reembolso");
  const [payment, setPayment] = useState<NonNullable<LegacyCreditInput["paymentMethod"]>>("efectivo");
  const [legacyInvoice, setLegacyInvoice] = useState("");
  const [notes, setNotes] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [document, setDocument] = useState("");
  const [documentType, setDocumentType] = useState<"CC" | "NIT" | "CE" | "PAS">("CC");
  const [email, setEmail] = useState("");
  const [q, setQ] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const { data: wildHouse } = useQuery({ queryKey: ["legacy-return-wild-house"], queryFn: async () => {
    const { data, error } = await supabase.from("locations").select("id, name").eq("code", "bodega").eq("active", true).maybeSingle();
    if (error) throw error; return data;
  } });
  const search = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const term = q.trim().replace(/[%_,()]/g, "");
      const { data: products, error: pe } = await supabase.from("products").select("id").ilike("name", `%${term}%`).limit(100);
      if (pe) throw pe;
      let query = supabase.from("product_variants").select("sku, size, products(name)").eq("active", true);
      query = query.or(`sku.ilike.%${term}%${products?.length ? `,product_id.in.(${products.map((p) => p.id).join(",")})` : ""}`);
      const { data, error } = await query.order("sku").limit(50);
      if (error) throw error;
      setVariants((data ?? []) as Variant[]);
    } catch { toast.error("No se pudieron buscar las prendas"); }
    finally { setSearching(false); }
  };
  const changeLine = (index: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, i) => i === index ? { ...l, ...patch } : l));
  const submit = async () => {
    const parsed = legacyCreditSchema.safeParse({ requestId, locationId, destinationLocationId: destination, saleMonth, resolution, paymentMethod: payment, legacyInvoiceNumber: legacyInvoice || undefined, notes: notes || undefined,
      customer: customerName || document || email ? { name: customerName, document_number: document, document_type: documentType, email } : undefined, lines });
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message ?? "Revisa los datos"); return; }
    if (!window.confirm(`¿Emitir ante la DIAN una nota sin factura por ${formatCOP(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0))}?`)) return;
    setBusy(true); setFormError("");
    try {
      setSubmitted(true);
      const r = await issue({ data: parsed.data });
      if (r.status === "issued") toast[r.inventoryApplied ? "success" : "warning"](r.inventoryApplied ? `Nota emitida: ${r.numero_dian}` : "Nota aprobada; reingreso pendiente. Consulta el estado.");
      else toast.warning(r.error ?? "La DIAN todavía no aprobó la nota; no se cambió el inventario.");
      await qc.invalidateQueries({ queryKey: ["legacy-pos-notes"] });
      await qc.invalidateQueries({ queryKey: ["pos-inventory"] });
      await qc.invalidateQueries({ queryKey: ["pos-variants"] });
      onClose();
    } catch (e) { setFormError(e instanceof Error ? e.message : "No se pudo emitir. Consulta las notas antes de repetir."); await qc.invalidateQueries({ queryKey: ["legacy-pos-notes"] }); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}><DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
    <DialogTitle>Sin factura (sistema anterior)</DialogTitle><DialogDescription>{locationName}</DialogDescription>
    <fieldset disabled={busy || submitted} className="space-y-4 min-w-0">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Mes de la venta original<input aria-label="Mes de la venta original" type="month" max={colombiaMonth()} value={saleMonth} onChange={(e) => setSaleMonth(e.target.value)} className={fieldClass} /></label>
        <label className="text-sm">Destino de las prendas<select aria-label="Destino de las prendas" value={destination} onChange={(e) => setDestination(e.target.value)} className={fieldClass}><option value={locationId}>{locationName}</option>{wildHouse && <option value={wildHouse.id}>Bodega Central</option>}</select></label>
        <label className="text-sm">Resolución<select value={resolution} onChange={(e) => setResolution(e.target.value as typeof resolution)} className={fieldClass}><option value="reembolso">Devolución de dinero</option><option value="cambio">Cambio</option></select></label>
        {resolution === "reembolso" && <label className="text-sm">Medio de pago original<select value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)} className={fieldClass}>{[["efectivo", "Efectivo"], ["transferencia", "Transferencia"], ["datafono", "Datáfono"], ["tarjeta_credito", "Tarjeta de crédito"], ["tarjeta_debito", "Tarjeta de débito"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>}
      </div>
      <div className="flex gap-2"><input aria-label="Buscar prenda" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder="Nombre o código de la prenda" className={fieldClass} /><Button variant="outline" size="icon" aria-label="Buscar prendas" onClick={search} disabled={searching}><Search /></Button></div>
      {variants.length > 0 && <div className="max-h-40 overflow-y-auto divide-y divide-border">{variants.map((v) => <div key={v.sku} className="flex items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0 break-words">{v.products?.name} · {v.size}<small className="block text-muted-foreground">{v.sku}</small></span><Button size="icon" variant="ghost" aria-label={`Agregar ${v.sku}`} disabled={!v.sku || lines.some((l) => l.sku === v.sku)} onClick={() => { if (v.sku) setLines((prev) => [...prev, { sku: v.sku ?? "", quantity: 1, unit_price: 0, tax_rate: 19, reason: "talla", condition: "buena" }]); }}><Plus /></Button></div>)}</div>}
      {lines.map((l, index) => <div key={l.sku} className="rounded-md border border-border p-3 space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-medium">{l.sku}</span><Button variant="ghost" size="icon" aria-label={`Quitar ${l.sku}`} onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}><Trash2 /></Button></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="text-xs">Cantidad<input aria-label={`Cantidad ${l.sku}`} type="number" min="1" step="1" value={l.quantity} onChange={(e) => changeLine(index, { quantity: Number(e.target.value) })} className={fieldClass} /></label>
        <label className="text-xs">Precio pagado con IVA<input aria-label={`Precio pagado ${l.sku}`} type="number" min="1" value={l.unit_price || ""} onChange={(e) => changeLine(index, { unit_price: Number(e.target.value) })} className={fieldClass} /></label>
        <label className="text-xs">Motivo<select value={l.reason} onChange={(e) => changeLine(index, { reason: e.target.value as Line["reason"] })} className={fieldClass}><option value="talla">Talla</option><option value="decision_propia">Decisión propia</option><option value="defecto">Defecto</option></select></label>
        <label className="text-xs">Estado<select value={l.condition} onChange={(e) => changeLine(index, { condition: e.target.value as Line["condition"] })} className={fieldClass}><option value="buena">Buena</option><option value="defectuosa">Defectuosa · Calidad C</option></select></label>
      </div></div>)}
      <details><summary className="text-sm cursor-pointer">Factura vieja y clienta (opcional)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Factura del sistema anterior<input value={legacyInvoice} onChange={(e) => setLegacyInvoice(e.target.value)} className={fieldClass} /></label>
        <label className="text-sm">Nombre de la clienta<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={fieldClass} /></label>
        <label className="text-sm">Tipo de documento<select value={documentType} onChange={(e) => setDocumentType(e.target.value as typeof documentType)} className={fieldClass}><option value="CC">Cédula</option><option value="CE">Cédula de extranjería</option><option value="NIT">NIT</option><option value="PAS">Pasaporte</option></select></label>
        <label className="text-sm">Documento<input value={document} onChange={(e) => setDocument(e.target.value)} className={fieldClass} /></label>
        <label className="text-sm">Correo<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} /></label>
      </div></details>
      <label className="block text-sm">Nota (opcional)<textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={fieldClass} rows={2} /></label>
    </fieldset>
    {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><strong>{formatCOP(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0))}</strong><Button disabled={busy || submitted || !lines.length} onClick={submit}>{busy ? "Emitiendo…" : "Emitir nota crédito"}</Button></div>
  </DialogContent></Dialog>;
}