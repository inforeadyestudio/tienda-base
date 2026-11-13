// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
// Tu Marca: bolsa en papel parafinado que entra cuadro a cuadro desde la derecha.
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { CartLinePrice } from "@/components/storefront/product-sale";
import { displaySize } from "@/lib/size-order";
import { type CartDrawerVM } from "@/logic/storefront/use-cart-drawer";
import { available } from "@/logic/storefront/use-cart-drawer";
import { Iso } from "@/design/sections/marca/shared";

const ROW = "flex justify-between gap-3 marca-mono text-[10.5px] tracking-[.1em] [font-variant-numeric:tabular-nums]";
const CHIP = "marca-mono border px-2.5 py-1.5 text-[10px] transition-colors [transition-timing-function:steps(2,end)] disabled:opacity-40";

export function CartDrawerView({ vm }: { vm: CartDrawerVM }) {
  const { open, onOpenChange, money, items, setQty, remove, subtotal, count, savings, locale, showRecommendations, setShowRecommendations, quick, setQuick, color, setColor, variantId, setVariantId, colors, sizes, suggestions, user, freeMinimum, remaining, progress, subtotalUsd, shipping, shippingUsd, canEarnFreeShipping, selectRecommendation, addRecommendation, goToCheckout } = vm;
  const total = money(subtotal + shipping, subtotalUsd + shippingUsd);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="marca-scrim fixed inset-0 z-[80] bg-marca-cacao/20 backdrop-blur-[3px]" />
        <Dialog.Content aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="marca marca-drawer fixed inset-y-0 right-0 z-[90] w-full outline-none sm:w-[440px]">
          <div className="marca-vellum flex h-full flex-col pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
            <header className="flex items-center justify-between border-b border-marca-line-strong px-[26px] pb-4 pt-[22px]">
              <Dialog.Title className="marca-t text-[22px]">Bolsa ({count})</Dialog.Title>
              <Dialog.Close className="marca-mono text-[10.5px] text-marca-cacao">Cerrar</Dialog.Close>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-1">
              {items.length === 0 ? (
                <div className="grid justify-items-center gap-4 px-2.5 py-20 text-center">
                  <Iso className="w-[58px] text-marca-cacao" />
                  <h3 className="marca-t text-[20px]">Tu bolsa está vacía</h3>
                  <Dialog.Close asChild><Link to="/tienda" className="marca-bk">Ver la tienda</Link></Dialog.Close>
                </div>
              ) : (
                <ul className="m-0 list-none p-0">
                  {items.map((item) => (
                    <li key={item.variantId} className="marca-fade grid grid-cols-[86px_minmax(0,1fr)_auto] items-start gap-3.5 border-b border-marca-line py-4">
                      <div className="relative aspect-square overflow-hidden bg-marca-piedra">
                        {item.imageUrl && <img src={item.imageUrl} alt={item.productName} className="absolute left-[3%] top-1/2 w-[94%] -translate-y-1/2 mix-blend-multiply" />}
                      </div>
                      <div className="min-w-0">
                        <h3 className="marca-tr mb-1 truncate text-[13px]">{item.productName}</h3>
                        {item.variantLabel ? <p className="marca-mono marca-mono-soft m-0 truncate text-[9.5px]">{item.variantLabel}</p> : null}
                        <div className="mt-2.5 flex items-center gap-3.5">
                          <span className="inline-flex items-center border border-marca-line-strong">
                            <button type="button" className="marca-mono h-7 w-7 text-[13px]" onClick={() => setQty(item.variantId, item.qty - 1)} aria-label="Restar cantidad">−</button>
                            <output className="marca-mono min-w-[22px] text-center text-[11px]" aria-live="polite">{item.qty}</output>
                            <button type="button" className="marca-mono h-7 w-7 text-[13px]" onClick={() => setQty(item.variantId, item.qty + 1)} aria-label="Sumar cantidad">+</button>
                          </span>
                          <button type="button" className="marca-bk" onClick={() => remove(item.variantId)} aria-label={`Quitar ${item.productName}`}>Quitar</button>
                        </div>
                      </div>
                      <span className="marca-mono whitespace-nowrap text-[11px] tracking-[.06em]"><CartLinePrice item={item} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {items.length > 0 && suggestions.length > 0 && (
              <section className="shrink-0 border-t border-marca-line px-[26px] py-3">
                <button type="button" className="marca-mono flex w-full items-center justify-between text-[10.5px]"
                  onClick={() => setShowRecommendations((value) => { if (value) setQuick(null); return !value; })} aria-expanded={showRecommendations || !!quick}>
                  <span>Para completar</span><span aria-hidden="true">{showRecommendations || quick ? "−" : "+"}</span>
                </button>
                {(showRecommendations || quick) && (
                  <div className="marca-fade mt-3">
                    {quick ? (
                      <div>
                        <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-start gap-3">
                          <div className="relative aspect-square overflow-hidden bg-marca-piedra">{quick.hero_image_url && <img src={quick.hero_image_url} alt={quick.name} className="absolute left-[3%] top-1/2 w-[94%] -translate-y-1/2 mix-blend-multiply" />}</div>
                          <div className="min-w-0"><p className="marca-tr m-0 truncate text-[12px]">{quick.name}</p><p className="marca-mono marca-mono-soft m-0 text-[9.5px]">Elige el color</p></div>
                          <button type="button" className="marca-mono text-[10px]" onClick={() => setQuick(null)} aria-label="Cerrar recomendación">Cerrar</button>
                        </div>
                        {colors.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{colors.map((c) => <button key={c} type="button" className={`${CHIP} ${color === c ? "border-marca-cacao bg-marca-cacao text-marca-paper" : "border-marca-line-strong"}`} onClick={() => { setColor(c); setVariantId(null); }}>{c}</button>)}</div>}
                        {sizes.length > 1 && <div className="mt-2 flex flex-wrap gap-2">{sizes.map((variant) => <button key={variant.id} type="button" disabled={available(variant) <= 0} className={`${CHIP} ${variantId === variant.id ? "border-marca-cacao bg-marca-cacao text-marca-paper" : "border-marca-line-strong"}`} onClick={() => setVariantId(variant.id)}>{displaySize(variant.size)}</button>)}</div>}
                        {sizes.length === 1 && !variantId ? <button type="button" className="marca-bk mt-2" onClick={() => setVariantId(sizes[0].id)}>Elegir</button> : null}
                        <button type="button" className="marca-btn mt-3 w-full disabled:opacity-40" disabled={!variantId} onClick={addRecommendation}>Agregar a la bolsa</button>
                      </div>
                    ) : (
                      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {suggestions.map((product) => {
                          const prices = product.product_variants.map((v: any) => v.price_cop).filter(Boolean);
                          const minVariant = product.product_variants.find((v: any) => v.price_cop === Math.min(...prices));
                          return (
                            <button key={product.id} type="button" className="group w-24 shrink-0 text-left" onClick={() => selectRecommendation(product)}>
                              <span className="relative block aspect-square overflow-hidden bg-marca-piedra">
                                {product.hero_image_url && <img src={product.hero_image_url} alt={product.name} className="absolute left-[3%] top-1/2 w-[94%] -translate-y-1/2 mix-blend-multiply" />}
                              </span>
                              <span className="marca-tr mt-2 block truncate text-[11px]">{product.name}</span>
                              <span className="marca-mono marca-mono-soft block text-[10px]">{prices.length ? money(Math.min(...prices), minVariant?.price_usd ?? null) : ""}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {items.length > 0 && (
              <footer className="grid shrink-0 gap-[9px] border-t border-marca-line-strong px-[26px] pb-[22px] pt-4">
                {canEarnFreeShipping && (
                  <div className="mb-1">
                    <p className="marca-mono m-0 text-[10px] leading-[1.6]">
                      {!user
                        ? <><Dialog.Close asChild><Link to="/auth" className="underline underline-offset-2">Ingresa o crea tu cuenta</Link></Dialog.Close> y tu envío en Colombia es gratis{remaining > 0 ? <> desde {money(freeMinimum)}</> : null}</>
                        : remaining > 0 ? <>Te faltan {money(remaining)} para el envío gratis</> : <>Tu envío es gratis</>}
                    </p>
                    <div className="mt-2 h-px bg-marca-line"><div className="h-px bg-marca-cacao transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
                  </div>
                )}
                {savings.any && <div className={`${ROW} text-marca-burdeos`}><span>Ahorras</span><span>{money(savings.cop, savings.usd)}</span></div>}
                <div className={ROW}><span>Subtotal</span><span>{money(subtotal, subtotalUsd)}</span></div>
                <div className={ROW}><span>Envío</span><span>{shipping === 0 ? "Gratis" : money(shipping, shippingUsd)}</span></div>
                <div className="marca-tr flex justify-between border-t border-marca-line pt-2 text-[17px] [font-variant-numeric:tabular-nums]"><span>Total</span><span>{total}</span></div>
                <button type="button" className="marca-btn mt-1.5 w-full" onClick={goToCheckout}>{locale.t("Finalizar compra")}</button>
                <p className="marca-mono marca-mono-soft m-0 text-center text-[9.5px]">Garantía 6 meses · Cambios 5 días hábiles</p>
              </footer>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
