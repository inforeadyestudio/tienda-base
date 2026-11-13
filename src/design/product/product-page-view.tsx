// Diseño de la página de producto (editable desde Claude).
// Todos los datos y acciones llegan en `vm` desde @/logic (useProductPage).
// No calcules aquí precios, stock ni tallas: solo muéstralos.
//
// Estándar Tu Marca: visor 360° que gira la gafa con sus tres fotos (frente · 3/4 · lateral), fotos sobre el fondo beige
// como PNG, ficha a la derecha (fija al bajar) con versión, color, precio y bolsa; detalles plegables y relacionados.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { ProductSalePrice, ProductSaleNotice } from "@/components/storefront/product-sale";
import { FavoriteButton } from "@/components/storefront/favorite-button";
import { LookbookProductPage } from "@/components/storefront/lookbook-product";
import { ProductReviewsStrip } from "@/components/storefront/product-reviews-strip";
import { TryOnModal } from "@/components/tryon/try-on-modal";
import { sizeAvailability, type ProductPageVM } from "@/logic";
import { BracketOptions, CampaignMedia, ColorSwatches, Details, GiroViewer, RelatedRow } from "./marca-product";
import { model3dFor } from "./glasses3d-match";

export function ProductPageView({ vm }: { vm: ProductPageVM }) {
  const {
    data, money, colors, color, sizesForColor, variantId, setVariantId, selected, saleState, availability, stock,
    tryOnGarment, mediaTrack, sizeTouched, setSizeTouched, setColorTouched, videoOpen, setVideoOpen, tryOnOpen, setTryOnOpen,
    canTryOn, productVideo, buyNow, addToCart, pickColor, mobileSizes, lookItems, activeLook, lookPieces,
    setLooksGallery, onlineStock, storeWithStock, setRequestOpen, setSizeGuide, setSizeFinder, lookbookOn, lookbookConfig,
    versions, pickVersion,
  } = vm;

  // barra fija en celular cuando el botón principal ya no se ve
  const cta = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState(false);
  useEffect(() => {
    const el = cta.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setBar(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // la ficha queda fija al bajar; si es más alta que la pantalla, primero sube hasta mostrar su final
  const side = useRef<HTMLElement>(null);
  const [sideTop, setSideTop] = useState(80);
  useEffect(() => {
    const el = side.current;
    if (!el) return;
    const fit = () => setSideTop(Math.min(80, window.innerHeight - el.offsetHeight - 24));
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    window.addEventListener("resize", fit);
    fit();
    return () => { ro?.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  const soldOut = !selected || stock <= 0;
  const price = selected ? money(selected.price_cop, selected.price_usd ?? null) : "";
  const kicker = [(data as any).product_type, data.materials?.split(/[·,\n]/)[0]?.trim()].filter(Boolean).join(" · ");
  const pick = (c: string) => { pickColor(c); setColorTouched(true); };
  // 3D: si la referencia tiene modelo, va en el espacio del visor; el color elegido decide el material
  const model3d = model3dFor({ name: data.name, slug: data.slug, productType: (data as any).product_type, color, sku: (selected as { sku?: string | null } | null | undefined)?.sku });

  if (lookbookOn) {
    return (
      <div className="min-h-screen bg-ink">
        <SiteNav />
        <LookbookProductPage
          config={lookbookConfig}
          name={data.name}
          description={data.description}
          story={data.story}
          materials={data.materials}
          care={data.care}
          priceCop={selected?.price_cop ?? 0}
          priceUsd={selected?.price_usd ?? null}
          compareAtCop={selected?.compare_at_cop}
          compareAtUsd={selected?.compare_at_usd}
          saleState={saleState}
          gallery={mediaTrack.filter((m) => m.type !== "video").map((m) => ({ url: m.url, alt: m.alt }))}
          colors={colors}
          color={color}
          onPickColor={pick}
          sizes={mobileSizes}
          variantId={selected?.id ?? null}
          sizeTouched={sizeTouched}
          onPickSize={(id) => { setVariantId(id); setSizeTouched(true); }}
          availabilityLabel={availability.label}
          urgent={availability.urgent}
          soldOut={availability.status === "out"}
          onAdd={() => addToCart()}
          onBuyNow={buyNow}
          onSizeGuide={() => setSizeGuide(true)}
          onSizeFinder={() => setSizeFinder(true)}
          onOpenLooks={activeLook ? () => setLooksGallery(true) : undefined}
          lookCount={lookPieces}
          onRequestInStore={onlineStock <= 0 && storeWithStock ? () => setRequestOpen(true) : undefined}
        />
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="marca min-h-screen bg-marca-paper">
      <SiteNav />

      <main className="mx-auto max-w-[1760px] px-5 pb-10">
        <nav aria-label="Ruta" className="marca-mono marca-mono-soft flex flex-wrap gap-2 py-5 md:py-7">
          <Link to="/tienda" className="text-inherit no-underline hover:text-marca-cacao">Tienda</Link>
          <span aria-hidden="true">/</span>
          {(data as any).product_type ? <><span>{(data as any).product_type}</span><span aria-hidden="true">/</span></> : null}
          <span className="text-marca-cacao">{data.name}</span>
        </nav>

        <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] md:gap-x-14 md:gap-y-0 lg:gap-x-20">
          {/* visor 360°: la gafa gira arrastrando, con scroll horizontal o con el control de abajo (en 3D si la referencia lo tiene) */}
          <div className="min-w-0 md:col-start-1 md:row-start-1">
            <GiroViewer media={mediaTrack} name={data.name} model3d={model3d} />
          </div>

          {/* ficha */}
          <aside ref={side} style={{ top: sideTop }} className="min-w-0 md:sticky md:col-start-2 md:row-span-2 md:row-start-1 md:self-start">
            {kicker ? <p className="marca-mono marca-mono-soft m-0">{kicker}</p> : null}
            <h1 className="marca-t mt-3 text-[clamp(34px,4.4vw,58px)] leading-[0.95]">{data.name}</h1>
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3 border-b border-marca-line-strong pb-5">
              {selected ? <div className="marca-price"><ProductSalePrice variant={selected} /></div> : <span />}
              <span className={`marca-mono ${availability.status === "out" ? "marca-mono-soft" : availability.urgent ? "text-marca-burdeos" : ""}`}>{availability.label}</span>
            </div>

            <div className="mt-6 grid gap-6">
              {versions.length > 1 ? (
                <BracketOptions label="Versión" options={versions.map((v) => ({ value: v.slug, label: v.label, on: v.current }))} onPick={pickVersion} />
              ) : null}
              <ColorSwatches colors={colors} color={color} onPick={pick} />
              {sizesForColor.length > 1 ? (
                <BracketOptions label="Talla" onPick={(id) => { setVariantId(id); setSizeTouched(true); }}
                  options={sizesForColor.map((v) => ({ value: v.id, label: v.size ?? "Única", on: variantId === v.id, disabled: sizeAvailability(v).status === "out" }))} />
              ) : null}
            </div>

            <ProductSaleNotice state={saleState} className="mt-6" />

            <div ref={cta} className="mt-7 grid gap-3">
              <button type="button" onClick={() => addToCart()} disabled={soldOut}
                className="marca-mono flex w-full items-center justify-between gap-4 border border-marca-cacao bg-marca-cacao px-5 py-4 text-[11.5px] tracking-[.14em] text-marca-paper transition-colors duration-200 marca-steps hover:bg-transparent hover:text-marca-cacao disabled:cursor-not-allowed disabled:border-marca-line-strong disabled:bg-transparent disabled:text-marca-suave">
                <span>{soldOut ? "Agotado" : "Agregar a la bolsa"}</span>
                {soldOut ? null : <span>{price}</span>}
              </button>
              <div className="flex items-center justify-between gap-4">
                <button type="button" className="marca-bk" onClick={buyNow} disabled={soldOut}>Comprar ahora</button>
                <div className="flex items-center gap-4">
                  {canTryOn ? <button type="button" className="marca-bk" onClick={() => setTryOnOpen(true)}>Probármelas</button> : null}
                  {productVideo ? <button type="button" className="marca-bk" onClick={() => setVideoOpen(true)}>Ver video</button> : null}
                  <FavoriteButton variantId={variantId} tone="ink" className="size-9 shrink-0 text-marca-cacao" />
                </div>
              </div>
            </div>

            <div className="mt-9">
              <Details items={[
                { title: "Descripción", body: data.story || data.description ? <p>{data.story || data.description}</p> : null, open: true },
                { title: "Materiales", body: data.materials ? <p>{data.materials}</p> : null },
                { title: "Cuidado", body: data.care ? <p>{data.care}</p> : null },
                { title: "Envíos, cambios y garantía", body: <><p>Envíos a toda Colombia.</p><p>Cambios hasta 5 días hábiles después de recibir tu pedido.</p><p>Garantía de 6 meses.</p></> },
              ]} />
            </div>

          </aside>

          {/* debajo: fotos de modelo y campaña */}
          <CampaignMedia media={mediaTrack} name={data.name} className="min-w-0 md:col-start-1 md:row-start-2 md:mt-20" />
        </div>

        <RelatedRow title="También te pueden gustar" products={(lookItems ?? []) as any[]} money={money} />

        <div className="mt-20">
          <ProductReviewsStrip productId={data.id} />
        </div>
      </main>

      {/* celular: la bolsa queda a mano al bajar */}
      <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-marca-line bg-marca-paper/80 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-300 marca-steps md:hidden ${bar ? "translate-y-0" : "translate-y-full"}`} aria-hidden={!bar}>
        <button type="button" onClick={() => addToCart()} disabled={soldOut} tabIndex={bar ? 0 : -1}
          className="marca-mono flex w-full items-center justify-between gap-4 bg-marca-cacao px-5 py-3.5 text-[11px] tracking-[.14em] text-marca-paper disabled:bg-transparent disabled:text-marca-suave">
          <span>{soldOut ? "Agotado" : "Agregar a la bolsa"}</span>
          {soldOut ? null : <span>{price}</span>}
        </button>
      </div>

      <TryOnModal
        open={tryOnOpen}
        onClose={() => setTryOnOpen(false)}
        productId={data.id}
        productName={data.name}
        productImage={tryOnGarment.image}
        garmentSlot={tryOnGarment.slot}
        garmentFit={tryOnGarment.fit}
      />

      <Dialog.Root open={videoOpen} onOpenChange={setVideoOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="marca-scrim fixed inset-0 z-[90] bg-marca-cacao/40" />
          <Dialog.Content aria-describedby={undefined} className="marca fixed left-1/2 top-1/2 z-[91] w-[min(960px,calc(100%-32px))] outline-none [transform:translate(-50%,-50%)]">
            <Dialog.Title className="sr-only">{data.name} · video</Dialog.Title>
            <Dialog.Close className="marca-mono absolute -top-8 right-0 text-marca-paper">Cerrar</Dialog.Close>
            {productVideo ? <video src={productVideo.url} controls autoPlay playsInline className="block max-h-[80vh] w-full bg-marca-cacao" /> : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <SiteFooter />
    </div>
  );
}
