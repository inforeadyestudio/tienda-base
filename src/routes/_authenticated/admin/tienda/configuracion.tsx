import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SaleEditor } from "@/components/admin/sale-editor";
import { AnnouncementsEditor } from "@/components/admin/announcements-editor";
import { ComingSoonEditor } from "@/lib/coming-soon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteProductType, ensureProductType, productTypesQuery, saveProductType, type ProductType } from "@/lib/product-types";
import { isVideoUrl, optimizeImageFile, uploadOptions } from "@/lib/media";
import { StoresEditor } from "@/components/admin/stores-editor";
import { TryOnEditor } from "@/components/admin/tryon-editor";
import { AssistantTrainingEditor } from "@/components/admin/assistant-training-editor";
import { InternationalEditor } from "@/components/admin/international-editor";
import { IntlShippingEditor } from "@/components/admin/intl-shipping-editor";
import { TypeSizeChart } from "@/components/admin/type-size-chart";
import { BillingEditor } from "@/components/admin/billing-editor";
import { PaymentsEditor } from "@/components/admin/payments-editor";
import { CarriersEditor } from "@/components/admin/carriers-editor";
import { SignupDiscountEditor } from "@/components/admin/signup-discount-editor";
import { DEFAULT_NAV, newNavId, saveSiteNav, siteNavQuery, type NavChild, type NavItem } from "@/lib/site-nav";
import {
  DEFAULT_SHIPPING_SETTINGS, DEFAULT_TAX_SETTINGS, saveShippingSettings, saveTaxSettings,
  shippingSettingsQuery, taxSettingsQuery, type ShippingRate, type ShippingSettings, type TaxSettings,
} from "@/lib/store-settings";

export const Route = createFileRoute("/_authenticated/admin/tienda/configuracion")({
  head: () => ({ meta: [
    { title: "Configuración de tienda · Tu Marca" },
    { name: "description", content: "Configura navegación, envíos e impuestos de la tienda online." },
    { property: "og:title", content: "Configuración de tienda · Tu Marca" },
    { property: "og:description", content: "Configura navegación, envíos e impuestos de la tienda online." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TiendaConfiguracion,
});

const input = "w-full px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30";
const label = "block text-[10px] uppercase tracking-widest text-moss/70 mb-1";

function TiendaConfiguracion() {
  const qc = useQueryClient();
  const { data } = useQuery(siteNavQuery());
  const { data: savedShipping } = useQuery(shippingSettingsQuery());
  const { data: savedTaxes } = useQuery(taxSettingsQuery());
  const [items, setItems] = useState<NavItem[]>(DEFAULT_NAV);
  const [shipping, setShipping] = useState<ShippingSettings>(DEFAULT_SHIPPING_SETTINGS);
  const [taxes, setTaxes] = useState<TaxSettings>(DEFAULT_TAX_SETTINGS);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { if (data) setItems(data); }, [data]);
  useEffect(() => { if (savedShipping) setShipping(savedShipping); }, [savedShipping]);
  useEffect(() => { if (savedTaxes) setTaxes(savedTaxes); }, [savedTaxes]);

  const { data: destinations } = useQuery({
    queryKey: ["nav-destinations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("collections")
        .select("id, slug, title, is_page, status")
        .order("position");
      return data ?? [];
    },
  });

  const patch = (id: string, p: Partial<NavItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const patchChild = (itemId: string, childId: string, p: Partial<NavChild>) =>
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, children: i.children.map((c) => (c.id === childId ? { ...c, ...p } : c)) } : i)),
    );
  const move = (index: number, dir: -1 | 1) =>
    setItems((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const { data: products } = useQuery({
    queryKey: ["store-settings-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, status").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function save(kind: "nav" | "shipping" | "tax") {
    setSaving(kind);
    try {
      if (kind === "nav") {
        await saveSiteNav(items);
        await qc.invalidateQueries({ queryKey: ["site-nav"] });
        toast.success("Menú actualizado");
      } else if (kind === "shipping") {
        await saveShippingSettings(shipping);
        await qc.invalidateQueries({ queryKey: ["store-settings", "shipping"] });
        toast.success("Tarifas de envío actualizadas");
      } else {
        await saveTaxSettings(taxes);
        await qc.invalidateQueries({ queryKey: ["store-settings", "tax"] });
        toast.success("Impuestos actualizados");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

  const options = (destinations ?? []).map((d: any) => ({
    label: `${d.title}${d.status !== "published" ? " (borrador)" : ""}`,
    href: d.is_page ? (d.slug === "home" ? "/home" : d.slug === "page-tienda" ? "/tienda" : `/${d.slug}`) : `/coleccion/${d.slug}`,
  }));

  const collections = (destinations ?? []).filter((item: any) => !item.is_page);

  return (
    <div className="w-full min-w-0 max-w-[1400px] p-5 pb-24 md:p-10">
      <header className="mb-7">
        <div>
          <h1 className="font-nm text-2xl">Configuración de la tienda</h1>
          <p className="text-sm text-moss/80 mt-1">Administra cómo navegan y compran tus clientas.</p>
        </div>
      </header>

      <Tabs defaultValue="navigation" className="min-w-0">
        <div className="builder-scroll mb-6 min-w-0 max-w-full overflow-x-auto overscroll-x-contain pb-1 touch-pan-x">
          <TabsList className="flex h-auto w-max min-w-full flex-nowrap justify-start gap-1 bg-ink/5 p-1.5 [&>button]:shrink-0">
            <TabsTrigger value="navigation">Navegación</TabsTrigger>
            <TabsTrigger value="lock">Página de bloqueo</TabsTrigger>
            <TabsTrigger value="announcements">Anuncios</TabsTrigger>
            <TabsTrigger value="signup-discount">Inscripción con descuento</TabsTrigger>
            <TabsTrigger value="sale">Sale</TabsTrigger>
            <TabsTrigger value="shipping">Envíos</TabsTrigger>
            <TabsTrigger value="taxes">Impuestos</TabsTrigger>
            <TabsTrigger value="payments">Pagos</TabsTrigger>
            <TabsTrigger value="international">Internacional</TabsTrigger>
            <TabsTrigger value="billing">Facturación</TabsTrigger>
            <TabsTrigger value="types">Tipos de prenda</TabsTrigger>
            <TabsTrigger value="stores">Tiendas</TabsTrigger>
            <TabsTrigger value="tryon">Probador</TabsTrigger>
            <TabsTrigger value="asistente">Tu Marca</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sale"><SaleEditor /></TabsContent>
        <TabsContent value="signup-discount"><SignupDiscountEditor /></TabsContent>
        <TabsContent value="navigation" className="space-y-4">
          <SectionHeading title="Menú de navegación" description="Elige qué aparece, en qué orden y cuáles enlaces tienen submenú." action={<Button onClick={() => save("nav")} disabled={saving !== null}>{saving === "nav" ? "Guardando…" : "Guardar menú"}</Button>} />
        {items.map((item, index) => (
          <div key={item.id} className="rounded-lg border border-ink/10 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-widest text-moss/70">{index + 1} · {item.label || "Sin nombre"}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => patch(item.id, { enabled: !item.enabled })} title={item.enabled ? "Ocultar" : "Mostrar"}>
                  {item.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4 opacity-50" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => move(index, -1)} aria-label="Subir"><ArrowUp /></Button>
                <Button variant="ghost" size="icon" onClick={() => move(index, 1)} aria-label="Bajar"><ArrowDown /></Button>
                <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((i) => i.id !== item.id))} aria-label="Eliminar"><Trash2 /></Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={label}>Nombre en el menú</label>
                <input className={input} value={item.label} onChange={(e) => patch(item.id, { label: e.target.value })} />
              </div>
              <div>
                <label className={label}>Destino</label>
                <input className={input} value={item.href} onChange={(e) => patch(item.id, { href: e.target.value })} placeholder="/tienda" />
              </div>
            </div>

            <div className="rounded-xl bg-cream/60 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-moss/70">Submenú</p>
              {item.children.map((child, childIndex) => (
                <div key={child.id} className="flex flex-wrap items-center gap-2">
                  <input className={input + " flex-1 min-w-40"} value={child.label} onChange={(e) => patchChild(item.id, child.id, { label: e.target.value })} placeholder="Nombre" />
                  <input className={input + " flex-1 min-w-40"} value={child.href} onChange={(e) => patchChild(item.id, child.id, { href: e.target.value })} placeholder="/coleccion/back-to-selva" />
                  <Button variant="ghost" size="icon" disabled={childIndex === 0} aria-label="Subir"
                    onClick={() => { const children = [...item.children]; [children[childIndex - 1], children[childIndex]] = [children[childIndex], children[childIndex - 1]]; patch(item.id, { children }); }}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={childIndex === item.children.length - 1} aria-label="Bajar"
                    onClick={() => { const children = [...item.children]; [children[childIndex + 1], children[childIndex]] = [children[childIndex], children[childIndex + 1]]; patch(item.id, { children }); }}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => patchChild(item.id, child.id, { enabled: !child.enabled })}>
                    {child.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4 opacity-50" />}
                  </Button>
                  <Button variant="ghost" size="icon"
                    onClick={() => patch(item.id, { children: item.children.filter((c) => c.id !== child.id) })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm"
                  onClick={() =>
                    patch(item.id, { children: [...item.children, { id: newNavId(), label: "Nuevo enlace", href: "/", enabled: true }] })
                  }
                >
                  <Plus className="size-3" /> Añadir enlace
                </Button>
                <select
                  className={input + " w-auto"}
                  value=""
                  onChange={(e) => {
                    const opt = options.find((o) => o.href === e.target.value);
                    if (!opt) return;
                    patch(item.id, { children: [...item.children, { id: newNavId(), label: opt.label.replace(" (borrador)", ""), href: opt.href, enabled: true }] });
                  }}
                >
                  <option value="">Añadir colección o página…</option>
                  {options.map((o) => (
                    <option key={o.href} value={o.href}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}

        <Button variant="outline"
          onClick={() => setItems([...items, { id: newNavId(), label: "Nueva sección", href: "/", enabled: true, children: [] }])}
        >
          <Plus className="size-4" /> Añadir sección al menú
        </Button>
        </TabsContent>

        <TabsContent value="shipping" className="space-y-5">
          <SectionHeading title="Tarifas de envío" description="La primera tarifa activa que coincida con país, región y peso será la que se aplique." action={<Button onClick={() => save("shipping")} disabled={saving !== null}>{saving === "shipping" ? "Guardando…" : "Guardar envíos"}</Button>} />
          <div className="space-y-3">
            {shipping.rates.map((rate, index) => <ShippingRateEditor key={rate.id} rate={rate} index={index} onChange={(next) => setShipping((current) => ({ ...current, rates: current.rates.map((item) => item.id === rate.id ? next : item) }))} onMove={(direction) => setShipping((current) => { const rates = [...current.rates]; const target = index + direction; if (target < 0 || target >= rates.length) return current; [rates[index], rates[target]] = [rates[target], rates[index]]; return { ...current, rates }; })} onDelete={() => setShipping((current) => ({ ...current, rates: current.rates.filter((item) => item.id !== rate.id) }))} />)}
            <Button variant="outline" onClick={() => setShipping((current) => ({ ...current, rates: [...current.rates, { id: crypto.randomUUID(), name: "Nueva tarifa", country: "Colombia", regions: [], minWeightKg: 0, maxWeightKg: null, priceCop: 0, enabled: true }] }))}><Plus /> Añadir tarifa</Button>
          </div>

          <section className="rounded-lg border border-ink/10 bg-white p-5">
            <ToggleRow title="Envío gratis" description="Se aplicará cuando el pedido cumpla el mínimo y todos sus productos sean elegibles." checked={shipping.freeShipping.enabled} onCheckedChange={(enabled) => setShipping((current) => ({ ...current, freeShipping: { ...current.freeShipping, enabled } }))} />
            {shipping.freeShipping.enabled && <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Compra mínima (COP)"><input className={input} type="number" min="0" value={shipping.freeShipping.minimumCop} onChange={(event) => setShipping((current) => ({ ...current, freeShipping: { ...current.freeShipping, minimumCop: Math.max(0, Number(event.target.value)) } }))} /></Field>
              <div className="flex items-end"><label className="flex items-center gap-3 pb-2 text-sm"><Switch checked={shipping.freeShipping.allProducts} onCheckedChange={(allProducts) => setShipping((current) => ({ ...current, freeShipping: { ...current.freeShipping, allProducts } }))} /> Todos los productos</label></div>
              {!shipping.freeShipping.allProducts && <>
                <MultiSelect label="Colecciones con envío gratis" options={collections.map((item: any) => ({ id: item.id, label: item.title }))} selected={shipping.freeShipping.collectionIds} onChange={(collectionIds) => setShipping((current) => ({ ...current, freeShipping: { ...current.freeShipping, collectionIds } }))} />
                <MultiSelect label="Productos con envío gratis" options={(products ?? []).map((item: any) => ({ id: item.id, label: `${item.name}${item.status !== "published" ? " · draft" : ""}` }))} selected={shipping.freeShipping.productIds} onChange={(productIds) => setShipping((current) => ({ ...current, freeShipping: { ...current.freeShipping, productIds } }))} />
              </>}
            </div>}
          </section>

          <IntlShippingEditor />

          <SectionHeading title="Transportadoras" description="Conecta Skydropx para cotizar tarifas reales con varias transportadoras." action={null} />
          <CarriersEditor />
        </TabsContent>

        <TabsContent value="taxes" className="space-y-5">
          <SectionHeading title="Impuestos incluidos" description="Estos porcentajes ya están dentro del precio publicado; nunca se sumarán otra vez al total." action={<Button onClick={() => save("tax")} disabled={saving !== null}>{saving === "tax" ? "Guardando…" : "Guardar impuestos"}</Button>} />
          <TaxEditor title="Ventas nacionales" description="Pedidos enviados dentro de Colombia." rule={taxes.national} national onChange={(national) => setTaxes((current) => ({ ...current, national }))} />
          <TaxEditor title="Ventas internacionales" description="Pedidos enviados fuera de Colombia." rule={taxes.international} onChange={(international) => setTaxes((current) => ({ ...current, international }))} />
        </TabsContent>

        <TabsContent value="payments" className="space-y-5">
          <SectionHeading title="Métodos de pago" description="Wompi y Addi en Colombia, transferencia manual con comprobante, PayPal y Páguelo Fácil fuera de Colombia." action={null} />
          <PaymentsEditor />
        </TabsContent>


        <TabsContent value="international" className="space-y-5">
          <SectionHeading title="Versión internacional" description="Moneda, envío fuera de Colombia, pasarelas internacionales y traducciones al inglés." action={null} />
          <InternationalEditor />
        </TabsContent>

        <TabsContent value="billing" className="space-y-5">
          <SectionHeading title="Facturación electrónica" description="Factus para ventas en pesos y eFactura Panamá para ventas en dólares." action={null} />
          <BillingEditor />
        </TabsContent>

        <TabsContent value="types" className="space-y-5">
          <ProductTypesEditor />
        </TabsContent>
        <TabsContent value="stores" className="space-y-5">
          <SectionHeading title="Tiendas físicas" description="Foto, dirección y mapa que se muestran en la página Our Stores." action={null} />
          <StoresEditor />
        </TabsContent>
        <TabsContent value="tryon" className="space-y-5">
          <SectionHeading title="Probador virtual" description="Activa el probador, define la calidad y guarda la clave del proveedor." action={null} />
          <TryOnEditor />
        </TabsContent>
        <TabsContent value="announcements" className="space-y-5">
          <SectionHeading title="Barras de anuncios" description="Textos que se deslizan en la franja verde." action={null} />
          <AnnouncementsEditor />
        </TabsContent>

        <TabsContent value="lock" className="space-y-5">
          <SectionHeading title="Página de bloqueo" description="Cierra la tienda mientras la ajustas: logo, cuenta regresiva y registro de correos." action={null} />
          <ComingSoonEditor />
        </TabsContent>

        <TabsContent value="asistente" className="space-y-5">
          <SectionHeading title="Tu Marca (chat)" description="El chat está oculto para las clientas; entrénalo aquí antes de activarlo." action={null} />
          <AssistantTrainingEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionHeading({ title, description, action }: { title: string; description: string; action: ReactNode }) {
  return <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><h2 className="font-nm text-xl">{title}</h2><p className="mt-1 text-sm text-moss/75">{description}</p></div>{action}</div>;
}

function Field({ label: title, children }: { label: string; children: ReactNode }) { return <label><span className={label}>{title}</span>{children}</label>; }

function ToggleRow({ title, description, checked, onCheckedChange }: { title: string; description: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return <div className="flex items-start justify-between gap-4"><div><p className="font-medium">{title}</p><p className="mt-1 text-xs text-moss/75">{description}</p></div><Switch checked={checked} onCheckedChange={onCheckedChange} /></div>;
}

function ShippingRateEditor({ rate, index, onChange, onMove, onDelete }: { rate: ShippingRate; index: number; onChange: (rate: ShippingRate) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  const patch = (value: Partial<ShippingRate>) => onChange({ ...rate, ...value });
  return <section className="rounded-lg border border-ink/10 bg-white p-4">
    <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><GripVertical className="size-4 text-moss/50" /><span className="text-[10px] uppercase tracking-widest text-moss">Tarifa {index + 1}</span></div><div className="flex items-center gap-1"><Button variant="ghost" size="icon" onClick={() => onMove(-1)} aria-label="Subir tarifa"><ArrowUp /></Button><Button variant="ghost" size="icon" onClick={() => onMove(1)} aria-label="Bajar tarifa"><ArrowDown /></Button><Switch checked={rate.enabled} onCheckedChange={(enabled) => patch({ enabled })} /><Button variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar tarifa"><Trash2 /></Button></div></div>
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      <Field label="Nombre"><input className={input} value={rate.name} onChange={(event) => patch({ name: event.target.value })} /></Field>
      <Field label="País"><input className={input} value={rate.country} onChange={(event) => patch({ country: event.target.value })} placeholder="Colombia" /></Field>
      <Field label="Regiones o departamentos"><input className={input} value={rate.regions.join(", ")} onChange={(event) => patch({ regions: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Vacío = todo el país" /></Field>
      <Field label="Peso mínimo (kg)"><input className={input} type="number" min="0" step="0.1" value={rate.minWeightKg} onChange={(event) => patch({ minWeightKg: Math.max(0, Number(event.target.value)) })} /></Field>
      <Field label="Peso máximo (kg)"><input className={input} type="number" min="0" step="0.1" value={rate.maxWeightKg ?? ""} onChange={(event) => patch({ maxWeightKg: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) })} placeholder="Sin límite" /></Field>
      <Field label="Tarifa (COP)"><input className={input} type="number" min="0" step="1000" value={rate.priceCop} onChange={(event) => patch({ priceCop: Math.max(0, Number(event.target.value)) })} /></Field>
    </div>
  </section>;
}

function MultiSelect({ label: title, options, selected, onChange }: { label: string; options: { id: string; label: string }[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <div><span className={label}>{title}</span><div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-ink/10 bg-cream/40 p-2">{options.length === 0 ? <p className="p-2 text-xs text-moss">No hay opciones disponibles.</p> : options.map((option) => <label key={option.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-white"><input type="checkbox" checked={selected.includes(option.id)} onChange={(event) => onChange(event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))} />{option.label}</label>)}</div></div>;
}

function TaxEditor({ title, description, rule, national = false, onChange }: { title: string; description: string; rule: TaxSettings["national"]; national?: boolean; onChange: (rule: TaxSettings["national"]) => void }) {
  return <section className="rounded-lg border border-ink/10 bg-white p-5"><ToggleRow title={title} description={description} checked={rule.enabled} onCheckedChange={(enabled) => onChange({ ...rule, enabled })} />{rule.enabled && <div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Porcentaje incluido"><div className="relative"><input className={input + " pr-10"} type="number" min="0" max="100" step="0.01" value={rule.ratePct} onChange={(event) => onChange({ ...rule, ratePct: Math.min(100, Math.max(0, Number(event.target.value))) })} /><span className="absolute right-3 top-2 text-sm text-moss">%</span></div></Field>{!national && <Field label="Países (vacío = todos)"><input className={input} value={rule.countries.join(", ")} onChange={(event) => onChange({ ...rule, countries: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Estados Unidos, México" /></Field>}</div>}</section>;
}


function ProductTypesEditor() {
  const qc = useQueryClient();
  const { data } = useQuery(productTypesQuery());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const types = data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["product-types"] });

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await ensureProductType(name);
      setName("");
      await refresh();
      toast.success("Tipo creado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear");
    } finally { setBusy(false); }
  }

  async function patch(type: ProductType, changes: Partial<ProductType>) {
    try {
      await saveProductType({ id: type.id, ...changes });
      await refresh();
      await qc.invalidateQueries({ queryKey: ["product-type", type.slug] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    }
  }

  async function uploadCover(type: ProductType, file: File) {
    if (!file.type.startsWith("image/") && !["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) {
      toast.error("Selecciona una imagen o un video MP4, WebM o MOV");
      return;
    }
    setUploading(type.id);
    try {
      const media = file.type.startsWith("image/") ? await optimizeImageFile(file, { maxDim: 1920, quality: 0.78 }) : file;
      const ext = media.name.split(".").pop()?.toLowerCase() || (media.type.startsWith("video/") ? "mp4" : "webp");
      const path = `product-types/${type.id}/${crypto.randomUUID()}.${ext}`;
      const bucket = supabase.storage.from("product-media");
      const { error } = await bucket.upload(path, media, uploadOptions(media));
      if (error) throw error;
      const url = bucket.getPublicUrl(path).data.publicUrl;
      try {
        await saveProductType({ id: type.id, cover_url: url });
      } catch (saveError) {
        await bucket.remove([path]);
        throw saveError;
      }
      await refresh();
      await qc.invalidateQueries({ queryKey: ["product-type", type.slug] });
      toast.success("Portada actualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo subir la portada");
    } finally {
      setUploading(null);
    }
  }

  async function remove(type: ProductType) {
    if (!confirm(`¿Eliminar el tipo "${type.name}"?`)) return;
    try {
      await deleteProductType(type.id);
      await refresh();
      toast.success("Tipo eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar");
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeading
        title="Tipos de prenda"
        description="Cada tipo tiene su propia página pública y aparece en el tablero de colecciones."
        action={
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nuevo tipo" className={input} />
            <Button onClick={() => void create()} disabled={busy}><Plus className="size-4" /> Agregar</Button>
          </div>
        }
      />
      <div className="space-y-3">
        {types.map((type) => (
          <div key={type.id} className="rounded-xl border border-ink/10 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] md:items-end">
              <label><span className={label}>Nombre</span>
                <input defaultValue={type.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== type.name) void patch(type, { name: v }); }} className={input} />
              </label>
              <div className="min-w-0">
                <span className={label}>Portada (foto o video)</span>
                <div className="flex items-center gap-2">
                  {type.cover_url && <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-cream">
                    {isVideoUrl(type.cover_url) ? <video src={type.cover_url} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <img src={type.cover_url} alt="" className="h-full w-full object-cover" />}
                  </div>}
                  <Button variant="outline" size="sm" asChild className={uploading === type.id ? "pointer-events-none opacity-50" : ""}>
                    <label className="cursor-pointer whitespace-nowrap"><Upload className="size-4" /> {uploading === type.id ? "Subiendo…" : "Subir archivo"}
                      <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" disabled={uploading !== null} className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void uploadCover(type, file); }} />
                    </label>
                  </Button>
                </div>
                <input key={`${type.id}-${type.cover_url ?? "empty"}`} aria-label={`URL de portada de ${type.name}`} defaultValue={type.cover_url ?? ""} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== type.cover_url) void patch(type, { cover_url: v }); }} placeholder="O pega una URL" className={`${input} mt-2`} />
              </div>
              <label><span className={label}>Forma</span>
                <select value={type.board_shape ?? "oval"} onChange={(e) => void patch(type, { board_shape: e.target.value })} className={input}>
                  <option value="oval">Óvalo</option>
                  <option value="rect">Rectangular</option>
                </select>
              </label>
              <div className="flex items-center gap-3 pb-1">
                <Switch checked={type.active} onCheckedChange={(v) => void patch(type, { active: v })} />
                <Button variant="ghost" size="sm" onClick={() => void remove(type)}><Trash2 className="size-4" /></Button>
              </div>
            </div>
            <div className="mt-3 max-w-[12rem]">
              <label><span className={label}>Peso para envío online (g)</span>
                <input key={`${type.id}-w-${type.weight_grams ?? ""}`} type="number" min="0" step="1" defaultValue={type.weight_grams ?? ""} className={input}
                  onBlur={(e) => { const raw = e.target.value.trim(); const v = raw === "" ? null : Math.round(Math.max(0, Number(raw))); if (v !== (type.weight_grams ?? null)) void patch(type, { weight_grams: v }); }} />
              </label>
            </div>
            <TypeSizeChart key={`${type.id}-chart`} chart={type.size_chart} onSave={async (size_chart) => { await patch(type, { size_chart } as any); toast.success(`Tabla aplicada a todas las prendas de ${type.name}`); }} />
            <p className="mt-2 text-[11px] text-moss/60">/tipo/{type.slug}</p>
          </div>
        ))}
        {!types.length && <p className="text-sm text-moss/70">Todavía no hay tipos de prenda.</p>}
      </div>
    </div>
  );
}
