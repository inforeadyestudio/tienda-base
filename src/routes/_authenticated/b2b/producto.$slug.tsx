import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { B2BTopBar } from "@/components/b2b/b2b-topbar";
import { addB2BItem, openB2BCart } from "@/lib/b2b/cart";
import { ecomAvailable, formatMoney, isRestockProduct, useB2BCollections, useB2BProduct, useB2BSettings, wholesalePrice } from "@/lib/b2b/portal";
import { optimizedImageUrl } from "@/lib/media";
import { StockBadge } from "@/components/b2b/stock-badge";

export const Route = createFileRoute("/_authenticated/b2b/producto/$slug")({
  head: () => ({
    meta: [
      { title: "Ficha de producto mayorista · Tu Marca" },
      { name: "description", content: "Detalle, tallas, colores y precios mayoristas de la referencia." },
      { property: "og:title", content: "Ficha de producto mayorista · Tu Marca" },
      { property: "og:description", content: "Detalle, tallas, colores y precios mayoristas de la referencia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BProductPage,
});

function plainHtml(html?: string | null) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}


function B2BProductPage() {
  const { slug } = Route.useParams();
  const { isLoading: collectionsLoading } = useB2BCollections();
  const { data: product, isLoading } = useB2BProduct(slug);
  const { data: settings } = useB2BSettings();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [slide, setSlide] = useState(0);


  const images = useMemo(() => {
    const list = [...((product as any)?.product_images ?? [])].sort((a: any, b: any) => a.position - b.position).map((i: any) => i.url);
    const hero = (product as any)?.hero_image_url;
    return [...new Set([hero, ...list].filter(Boolean))] as string[];
  }, [product]);

  if (collectionsLoading || isLoading) {
    return <div className="flex-1"><B2BTopBar /><p className="p-6 text-sm text-ink/50">Cargando referencia…</p></div>;
  }
  if (!product || !settings) {
    return (
      <div className="flex-1">
        <B2BTopBar />
        <div className="p-6">
          <p className="text-sm text-ink/60">No encontramos esta referencia.</p>
          <Link to="/b2b/productos" className="text-[12px] underline mt-2 inline-block">Volver al catálogo</Link>
        </div>
      </div>
    );
  }

  const variants = ((product as any).product_variants ?? []).filter((v: any) => v.active !== false);
  const fitRows = Array.isArray((product as any).fit_spec?.measurements_by_size) ? (product as any).fit_spec.measurements_by_size as { size: string; bust?: number[]; waist?: number[]; hip?: number[]; length?: number }[] : [];
  const sizes = [...new Set(variants.map((v: any) => String(v.size ?? "").trim()).filter(Boolean))] as string[];
  const orderedSizes = sizes.sort((a, b) => { const order = ["XS", "S", "M", "L", "XL", "XXL", "U"]; const ai = order.indexOf(a.toUpperCase()), bi = order.indexOf(b.toUpperCase()); return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b, "es"); });
  const units = variants.reduce((s: number, v: any) => s + (qty[v.id] ?? 0), 0);
  const total = variants.reduce((s: number, v: any) => s + (qty[v.id] ?? 0) * wholesalePrice(v, settings), 0);

  const restock = isRestockProduct(product as any);
  const add = () => {
    variants.forEach((v: any) => {
      const n = qty[v.id] ?? 0;
      if (n <= 0) return;
      addB2BItem({
        variantId: v.id,
        productId: (product as any).id,
        productName: (product as any).name,
        variantLabel: [v.size, v.color].filter(Boolean).join(" · ") || "Única",
        sku: v.sku ?? "—",
        imageUrl: images[0] ?? null,
        unitPrice: wholesalePrice(v, settings),
        priceCop: wholesalePrice(v, settings, "COP"),
        qty: Math.min(n, ecomAvailable(v)),
        restock: true,
      });
    });
    setQty({});
    openB2BCart();
  };

  return (
    <div className="flex-1 flex flex-col">
      <B2BTopBar />
      <div className="p-4 md:p-6">
        <Link to="/b2b/productos" className="text-[11px] text-ink/60 hover:text-ink flex items-center gap-1 mb-4">
          <ArrowLeft className="size-3" /> Volver al catálogo
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_380px] gap-5">
          <div className="lg:hidden -mx-4">
            <div
              onScroll={(e) => {
                const el = e.currentTarget;
                const step = el.clientWidth * 0.82 + 8;
                setSlide(Math.round(el.scrollLeft / step));
              }}
              className="flex gap-2 overflow-x-auto snap-x snap-mandatory px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {images.map((src) => (
                <div key={src} className="shrink-0 w-[82%] snap-center rounded-2xl overflow-hidden bg-[#f0e6d2]">
                  <img src={optimizedImageUrl(src, 1200)} alt={(product as any).name} loading="lazy" className="w-full aspect-[3/4] object-cover" />
                </div>
              ))}
              {!images.length && <div className="shrink-0 w-[82%] aspect-[3/4] rounded-2xl bg-[#f0e6d2]" />}
            </div>
            {images.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {images.map((src, i) => (
                  <span key={src} className={"size-1.5 rounded-full transition-colors " + (i === slide ? "bg-ink" : "bg-ink/20")} />
                ))}
              </div>
            )}
          </div>

          <div className="hidden lg:columns-2 gap-3 [column-fill:_balance]">
            {images.map((src) => (
              <div key={src} className="mb-3 break-inside-avoid rounded-2xl overflow-hidden bg-[#f0e6d2]">
                <img src={optimizedImageUrl(src, 1200)} alt={(product as any).name} loading="lazy" className="w-full h-auto object-cover" />
              </div>
            ))}
            {!images.length && <div className="aspect-[3/4] rounded-2xl bg-[#f0e6d2]" />}
          </div>


          <div className="lg:sticky lg:top-20 h-fit space-y-4">
            <div className="bg-white rounded-3xl border border-ink/8 p-5">
              <div className="text-[10px] tracking-[0.18em] text-ink/45 uppercase">{(product as any).product_type ?? "—"}</div>
              <h1 className="font-serif italic text-3xl mt-1">{(product as any).name}</h1>
              <StockBadge restock={restock} className="mt-2" />
              {(product as any).reference_code && <div className="text-[11px] text-ink/45 mt-1">Ref. {(product as any).reference_code}</div>}

              <div className="mt-5 space-y-2">
                <div className="text-[10px] tracking-[0.16em] text-ink/50">TALLAS Y COLORES</div>
                {variants.map((v: any) => {
                  const stock = ecomAvailable(v);
                  const soldOut = stock <= 0;
                  return (
                    <div key={v.id} className="flex items-center gap-3 border border-ink/10 rounded-xl px-3 py-2 bg-[#faf6ee]">
                      {v.color_hex && <span className="size-3.5 rounded-full border border-ink/10 shrink-0" style={{ background: v.color_hex }} />}
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] truncate">{[v.size, v.color].filter(Boolean).join(" · ") || "Única"}</div>
                        <div className="text-[10px] text-ink/45">{formatMoney(wholesalePrice(v, settings), settings.currency)} · {soldOut ? "Agotado" : `${stock} disp. en Ecommerce`}</div>
                      </div>
                      <input
                        type="number" min={0} max={stock} disabled={soldOut} value={qty[v.id] ?? ""} placeholder="0"
                        onChange={(e) => setQty((s) => ({ ...s, [v.id]: Math.min(stock, Math.max(0, Number(e.target.value) || 0)) }))}
                        className="w-16 bg-white border border-ink/12 rounded-lg px-2 py-1 text-[12px] outline-none text-right"
                      />
                    </div>
                  );
                })}
                {!variants.length && <p className="text-[12px] text-ink/45">Sin variantes activas.</p>}
              </div>

              <div className="flex items-center justify-between mt-5 text-[12px]">
                <span className="text-ink/60">{units} unidades</span>
                <strong className="font-serif italic text-lg">{formatMoney(total, settings.currency)}</strong>
              </div>
              <button onClick={add} disabled={!units} className="w-full mt-3 bg-ink text-ivory text-[12px] py-3 rounded-full hover:bg-moss disabled:opacity-30">
                Agregar al pedido
              </button>
            </div>

             {((product as any).description || (product as any).materials || (product as any).composition || (product as any).care) && (
              <div className="bg-white rounded-3xl border border-ink/8 p-5 space-y-3 text-[12px] text-ink/70 leading-relaxed">
                {(product as any).description && <p className="whitespace-pre-line">{plainHtml((product as any).description)}</p>}

                {(product as any).materials && <p><strong className="text-ink">Materiales:</strong> {(product as any).materials}</p>}
                 {(product as any).composition && <p><strong className="text-ink">Composición:</strong> {(product as any).composition}</p>}
                {(product as any).care && <p><strong className="text-ink">Cuidados:</strong> {(product as any).care}</p>}
              </div>
            )}
             {(orderedSizes.length > 0 || fitRows.length > 0) && <section className="border-t border-ink/10 pt-4 text-xs"><h2 className="text-sm font-medium text-ink">Curva de tallas</h2><p className="mt-2 text-ink/70">{orderedSizes.join(" · ")}</p>{fitRows.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-ink/10"><th className="py-2">Talla</th><th>Busto</th><th>Cintura</th><th>Cadera</th><th>Largo</th></tr></thead><tbody>{fitRows.map((row, i) => <tr key={`${row.size}-${i}`} className="border-b border-ink/5"><td className="py-2">{row.size}</td>{(["bust", "waist", "hip", "length"] as const).map((key) => <td key={key}>{Array.isArray(row[key]) ? (row[key] as number[]).join("–") : row[key] ?? "—"}</td>)}</tr>)}</tbody></table><p className="mt-2 text-ink/50">Medidas en cm</p></div>}</section>}
          </div>
        </div>
      </div>
    </div>
  );
}
