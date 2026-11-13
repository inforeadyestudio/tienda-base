// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
//
// Dos páginas con el mismo vm (useShopPage):
//  · /tienda → «Todo»: todas las gafas con pestañas por categoría, filtros, orden y cierre editorial.
//  · /tienda/<categoría> (gafas de sol, ópticas…) → página estándar de colección: portada con el nombre, la descripción
//    y la foto de la categoría (Tipos de producto en el panel) y la misma grilla, ya filtrada por esa categoría.
// TODO(logica): /tipo/<slug> y /coleccion/<slug> (cuando no tienen escenas) siguen con su diseño viejo en la ruta;
//   necesito que muestren este mismo diseño: /tipo/<slug> → ShopPageView con useShopPage(slug), y para colecciones
//   un `useShopPage` que acepte una colección (título, subtítulo, portada y sus productos en orden).
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { ShopProductCard } from "@/components/tienda/product-card";
import { SceneRenderer } from "@/components/scenes/scene-renderer";
import { pageBackgroundClass, pageBackgroundStyle } from "@/lib/scenes/page-theme";
import { interleaveBanners, type CatalogBanner } from "@/components/scenes/catalog-banners";
import { emptyFilters, slugify, type ShopProduct } from "@/lib/tienda/catalog";
import type { ShopPageVM } from "@/logic/shop/use-shop-page";
import { SORTS } from "@/logic/shop/use-shop-page";
import { TresPastillas, cx, isVideo } from "@/design/sections/marca/shared";
import { MarcaFilters } from "./marca-filters";
import { MoodboardBody, type MoodPhoto } from "@/design/sections/marca-moodboard";
import { viewOf } from "@/design/sections/marca/views";
import { formatCOP } from "@/logic";

/* --------- grilla: filas centradas (la última fila con menos gafas queda al centro) --------- */
const WIDTH: Record<number, string> = {
  3: "w-[calc((100%-14px)/2)] md:w-[calc((100%-48px)/3)]",
  4: "w-[calc((100%-14px)/2)] md:w-[calc((100%-48px)/3)] lg:w-[calc((100%-72px)/4)]",
  6: "w-[calc((100%-14px)/2)] md:w-[calc((100%-72px)/4)] lg:w-[calc((100%-120px)/6)]",
};

function Banner({ b }: { b: CatalogBanner }) {
  const inner = (
    <figure className="relative m-0 aspect-[4/5] overflow-hidden bg-marca-piedra md:aspect-[21/8]">
      {b.media ? (isVideo(b.media)
        ? <video src={b.media} muted loop playsInline autoPlay className="absolute inset-0 h-full w-full object-cover" />
        : <img src={b.media} alt={b.title || ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />) : null}
      {b.title || b.eyebrow ? (
        <figcaption className="marca-vellum marca-nudge absolute bottom-5 left-1/2 grid w-[min(420px,calc(100%-32px))] -translate-x-1/2 justify-items-center gap-2 px-6 py-5 text-center">
          {b.eyebrow ? <span className="marca-mono marca-mono-soft">{b.eyebrow}</span> : null}
          {b.title ? <span className="marca-t text-[clamp(22px,2.6vw,32px)]">{b.title}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
  return <div className="my-6 w-full md:my-10">{b.href ? <a href={b.href} className="block text-inherit no-underline">{inner}</a> : inner}</div>;
}

function Grid({ products, cols, banners }: { products: ShopProduct[]; cols: number; banners: CatalogBanner[] }) {
  const items = interleaveBanners(products, banners);
  return (
    <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-12 md:gap-x-6 md:gap-y-16">
      {items.map((it, i) =>
        it.kind === "banner" ? <Banner key={`b-${it.b.id}-${i}`} b={it.b} /> : (
          <div key={it.p.id} className={cx("min-w-0", WIDTH[cols] ?? WIDTH[3])}>
            <ShopProductCard product={it.p} imageSizes={`(max-width: 767px) 50vw, ${Math.round(100 / cols)}vw`} />
          </div>
        ),
      )}
    </div>
  );
}

/* --------- cabeceras --------- */
const count = (n: number) => `${n} ${n === 1 ? "referencia" : "referencias"}`;

/** Texto de apoyo mientras la categoría no tenga descripción en el panel. */
function fallbackCopy(_name: string) {
  return "Tu frase de marca va aquí.";
}

function ShopHeader({ total }: { total: number }) {
  return (
    <header className="grid justify-items-center gap-4 px-5 pb-10 pt-14 text-center md:pb-14 md:pt-20">
      <span className="marca-mono marca-mono-soft">Tienda</span>
      <h1 className="marca-t text-[clamp(44px,8vw,112px)] leading-[.9]">Todos los productos</h1>
      <TresPastillas className="mt-1" />
      <span className="marca-mono marca-mono-soft">{count(total)}</span>
    </header>
  );
}

function CollectionHeader({ title, description, cover, total }: { title: string; description: string; cover: string | null; total: number }) {
  if (!cover) {
    return (
      <header className="grid justify-items-center gap-4 px-5 pb-10 pt-14 text-center md:pb-14 md:pt-20">
        <span className="marca-mono marca-mono-soft">Colección</span>
        <h1 className="marca-t text-[clamp(44px,8vw,112px)] leading-[.9]">{title}</h1>
        <TresPastillas className="mt-1" />
        <p className="m-0 max-w-[460px] text-[15px] leading-[1.55]">{description}</p>
        <span className="marca-mono marca-mono-soft">{count(total)}</span>
      </header>
    );
  }
  return (
    <header className="relative h-[72svh] min-h-[440px] overflow-hidden bg-marca-piedra md:h-[78svh]">
      {isVideo(cover)
        ? <video src={cover} muted loop playsInline autoPlay className="absolute inset-0 h-full w-full object-cover" />
        : <img src={cover} alt={title} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover object-[50%_35%]" />}
      <div className="marca-vellum marca-lift marca-nudge absolute bottom-[clamp(20px,5vh,48px)] left-1/2 grid w-[min(520px,calc(100%-32px))] -translate-x-1/2 justify-items-center gap-3 px-6 pb-6 pt-7 text-center md:px-10">
        <span className="marca-mono marca-mono-soft">Colección</span>
        <h1 className="marca-t text-[clamp(38px,6vw,72px)] leading-[.92]">{title}</h1>
        <p className="m-0 max-w-[400px] text-[14px] leading-[1.55]">{description}</p>
        <span className="marca-mono marca-mono-soft">{count(total)}</span>
      </div>
    </header>
  );
}

/* --------- cierre editorial (solo en «Todo») --------- */
function EditorialBreak({ collection }: { collection: any }) {
  const url: string = collection.cover_url ?? "";
  if (!url) return null;
  return (
    <section className="relative mt-20 h-[70svh] min-h-[420px] overflow-hidden bg-marca-piedra md:mt-28">
      {isVideo(url)
        ? <video src={url} muted loop playsInline autoPlay className="absolute inset-0 h-full w-full object-cover" />
        : <img src={url} alt={collection.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="marca-vellum marca-lift marca-nudge absolute bottom-[clamp(20px,5vh,48px)] left-1/2 grid w-[min(440px,calc(100%-32px))] -translate-x-1/2 justify-items-center gap-3 px-6 pb-6 pt-7 text-center">
        <span className="marca-mono marca-mono-soft">Colección</span>
        <h2 className="marca-t text-[clamp(30px,4vw,48px)] leading-[.95]">{collection.title}</h2>
        <Link to="/coleccion/$slug" params={{ slug: collection.slug }} className="marca-bk">Ver colección</Link>
      </div>
    </section>
  );
}

export function ShopPageView({ vm }: { vm: ShopPageVM }) {
  const {
    products, isLoading, isError, isFetching, refetch, pageQ, pageExpQ, pageScenes, banners, setFilters, filters, base,
    panelOpen, setPanelOpen, cols, setCols, sort, setSort, sortOpen, setSortOpen, facets, results, pageSize, visible, setVisible,
    paged, chips, sortLabel, leadCollection, productTypes,
  } = vm;

  // ¿página de colección? la categoría (o etiqueta / color) con la que se entró por /tienda/<slug>
  const facetLabel: string | null = base.types[0] ?? base.tags[0] ?? base.colors[0] ?? (base.q || null);
  const isCollection = !!facetLabel;
  const type: any = facetLabel ? (productTypes ?? []).find((t: any) => slugify(t.name) === slugify(facetLabel) || t.slug === slugify(facetLabel)) : null;
  const title = type?.name ?? (facetLabel ? facetLabel.charAt(0).toUpperCase() + facetLabel.slice(1) : "");
  const resetTo = isCollection ? { ...base } : { ...emptyFilters };
  // las pastillas no muestran la categoría de la página (quitarla dejaría la colección vacía de sentido)
  const shownChips = chips.filter((c) => !isCollection || slugify(c.label) !== slugify(facetLabel!));

  // pestañas: Todo + categorías (cada una abre su página de colección)
  const tabs = facets.types.map((t) => {
    const managed: any = (productTypes ?? []).find((pt: any) => pt.name === t.value);
    return { label: t.value, slug: managed?.slug ?? slugify(t.value) };
  });
  const activeSlug = isCollection ? slugify(base.types[0] ?? "") : "";
  const [sortTop, setSortTop] = useState(false); // en celular el orden se abre desde la barra de abajo

  // moodboard al final de la colección: fotos de modelo/campaña de sus productos (las que no son frente, 3/4 ni lateral)
  // y dos productos sobre pastillas de color. Solo aparece si hay al menos dos fotos.
  // TODO(logica): fotos de campaña por categoría/colección en el panel; hoy salen de las fotos de los productos.
  const mood = (() => {
    if (!isCollection) return null;
    const seen = new Set<string>();
    const photos: MoodPhoto[] = [];
    for (const p of results) for (const u of p.images ?? []) {
      if (photos.length >= 4) break;
      if (viewOf(u) === null && !seen.has(u)) { seen.add(u); photos.push({ src: u, alt: `${p.name} · Tu Marca` }); }
    }
    if (photos.length < 2) return null;
    const products = results.slice(0, 2).map((p) => ({ key: p.id, img: p.images?.[0] ?? p.hero_image_url ?? "", name: p.name, price: p.minPrice ? formatCOP(p.minPrice) : "", href: `/producto/${p.slug}` }));
    return { photos, products };
  })();


  return (
    <div className="marca min-h-screen bg-marca-paper">
      <SiteNav />

      {pageScenes.length > 0 && pageQ.data?.collection && !isCollection ? (
        <div style={pageBackgroundStyle(pageExpQ.data?.theme)} className={pageBackgroundClass(pageExpQ.data?.theme)}>
          <SceneRenderer background={String(pageExpQ.data?.theme?.background ?? "ivory")} sound={(pageExpQ.data?.theme as any)?.sound}
            scenes={pageScenes} ctx={{ collection: pageQ.data.collection as any, products: (pageQ.data.products ?? []) as any }} />
        </div>
      ) : null}

      {isCollection
        ? <CollectionHeader title={title} description={type?.description || fallbackCopy(title)} cover={type?.cover_url ?? null} total={results.length} />
        : <ShopHeader total={results.length} />}

      {/* barra: categorías a la izquierda; filtros, orden y vista a la derecha (fija bajo el menú) */}
      <div className="sticky top-[60px] z-30 border-y border-marca-line bg-marca-paper md:top-[65px]">
        <div className="mx-auto flex max-w-[1500px] items-center gap-6 px-5 md:px-8">
          <nav aria-label="Categorías" className="-mx-1 flex min-w-0 flex-1 gap-5 overflow-x-auto px-1 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link to="/tienda" className="marca-bk whitespace-nowrap" aria-current={!isCollection ? "page" : undefined} aria-pressed={!isCollection}>Todo</Link>
            {tabs.map((t) => (
              <Link key={t.slug} to="/tienda/$facet" params={{ facet: t.slug }} className="marca-bk whitespace-nowrap" aria-current={activeSlug === t.slug ? "page" : undefined} aria-pressed={activeSlug === t.slug}>{t.label}</Link>
            ))}
          </nav>
          <div className="hidden shrink-0 items-center gap-6 md:flex">
            <span className="marca-mono marca-mono-soft">
              Ver{" "}
              {([3, 4, 6] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCols(c)} aria-pressed={cols === c} className={cx("marca-mono bg-transparent px-1.5", cols === c ? "text-marca-cacao underline underline-offset-4" : "")}>{c}</button>
              ))}
            </span>
            <div className="relative">
              <button type="button" className="marca-bk" onClick={() => { setSortTop(true); setSortOpen((v) => !v); }} aria-expanded={sortOpen && sortTop}>
                Ordenar · {sortLabel}
              </button>
              {sortOpen && sortTop ? (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 z-40 mt-2 grid min-w-[230px] border border-marca-line-strong bg-marca-paper py-1.5">
                    {SORTS.map((s) => (
                      <button key={s.value} type="button" onClick={() => { setSort(s.value); setSortOpen(false); }}
                        className={cx("marca-mono bg-transparent px-4 py-2 text-left hover:text-marca-cacao", sort === s.value ? "text-marca-cacao" : "marca-mono-soft")}>
                        {sort === s.value ? "· " : ""}{s.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
            <button type="button" className="marca-bk" onClick={() => setPanelOpen(true)}>Filtros{shownChips.length ? ` · ${shownChips.length}` : ""}</button>
          </div>
        </div>
      </div>

      {shownChips.length ? (
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-1 px-5 pt-5 md:px-8">
          {shownChips.map((chip, i) => (
            <button key={`${chip.label}-${i}`} type="button" className="marca-bk" onClick={() => setFilters(chip.clear(filters))}>{chip.label} ×</button>
          ))}
          <button type="button" className="marca-mono marca-mono-soft bg-transparent underline underline-offset-4" onClick={() => setFilters({ ...resetTo })}>Limpiar filtros</button>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1500px] px-5 pb-28 pt-10 md:px-8 md:pt-14">
        {isLoading ? (
          <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-12 md:gap-x-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className={cx("aspect-[3/4] animate-pulse bg-marca-piedra/50", WIDTH[cols] ?? WIDTH[3])} />)}
          </div>
        ) : isError && !products ? (
          <div role="alert" className="grid justify-items-center gap-4 py-20 text-center">
            <p className="m-0">No pudimos cargar los productos. Intenta de nuevo.</p>
            <button type="button" className="marca-btn" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "Cargando…" : "Reintentar"}</button>
          </div>
        ) : results.length === 0 ? (
          <div className="grid justify-items-center gap-5 py-24 text-center">
            <p className="marca-t m-0 text-[clamp(26px,3.4vw,40px)]">No encontramos productos con esos filtros.</p>
            <button type="button" className="marca-bk" onClick={() => setFilters({ ...resetTo })}>Limpiar filtros</button>
          </div>
        ) : (
          <>
            <Grid products={paged} cols={cols} banners={banners} />
            {visible < results.length ? (
              <div className="mt-16 grid justify-items-center gap-3">
                <span className="marca-mono marca-mono-soft">{paged.length} de {results.length}</span>
                <button type="button" className="marca-btn" onClick={() => setVisible((v) => v + pageSize)}>Ver más</button>
              </div>
            ) : null}
            {/* la colección cierra con su moodboard: primero los productos, al final las fotos */}
            {mood ? (
              <section className="mt-28 md:mt-40" aria-label={title}>
                <MoodboardBody title={title} note={type?.description || undefined} photos={mood.photos} products={mood.products} />
              </section>
            ) : null}
          </>
        )}
      </main>

      {!isCollection && leadCollection ? <EditorialBreak collection={leadCollection} /> : null}

      {/* celular: resultados, orden y filtros siempre a mano */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-marca-line bg-marca-paper px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden">
        {sortOpen && !sortTop ? (
          <div className="mb-3 grid border-b border-marca-line pb-2">
            {SORTS.map((s) => (
              <button key={s.value} type="button" onClick={() => { setSort(s.value); setSortOpen(false); }}
                className={cx("marca-mono bg-transparent py-2 text-left", sort === s.value ? "text-marca-cacao" : "marca-mono-soft")}>
                {sort === s.value ? "· " : ""}{s.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-4">
          <span className="marca-mono marca-mono-soft">{count(results.length)}</span>
          <button type="button" className="marca-bk ml-auto" onClick={() => { setSortTop(false); setSortOpen((v) => !v); }}>Ordenar</button>
          <button type="button" onClick={() => setPanelOpen(true)}
            className="marca-mono border border-marca-cacao bg-marca-cacao px-4 py-2.5 text-[10.5px] tracking-[.14em] text-marca-paper">
            Filtros{shownChips.length ? ` · ${shownChips.length}` : ""}
          </button>
        </div>
      </div>

      <MarcaFilters open={panelOpen} onClose={() => setPanelOpen(false)} facets={facets as any} filters={filters} setFilters={setFilters}
        results={results.length} showTypes={!isCollection} reset={resetTo} />

      <SiteFooter />
    </div>
  );
}
