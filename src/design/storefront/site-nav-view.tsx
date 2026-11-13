// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
// Tu Marca: franja de avisos que rota, header centrado con isotipo animado y logotipo,
// papel parafinado al bajar, menú lateral y newsletter del 10 %.
import { collectionSlugFromHref } from "@/logic/storefront/nav-helpers";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { SearchModal } from "@/components/storefront/search-modal";
import { SelectionToast } from "@/components/storefront/selection-toast";
import { LocaleSwitcher } from "@/components/storefront/locale-switcher";
import { type NavItem } from "@/lib/site-nav";
import { NavChildProducts } from "@/design/storefront/nav-products-view";
import { type SiteNavVM } from "@/logic/storefront/use-site-nav";
import { MarcaMark } from "@/design/storefront/marca-mark";
import { AnnouncementStrip, GrainOverlay, NewsletterPopup } from "@/design/storefront/marca-chrome";
import { MarcaLoader } from "@/design/storefront/marca-loader";

const LINK = "marca-mono whitespace-nowrap text-[11px] tracking-[.1em] text-marca-cacao no-underline";

function NavHref({ href, className, onClick, onMouseEnter, children }: { href: string; className?: string; onClick?: () => void; onMouseEnter?: () => void; children: React.ReactNode }) {
  if (/^https?:\/\//i.test(href)) {
    return <a href={href} className={className} onClick={onClick} onMouseEnter={onMouseEnter} target="_blank" rel="noreferrer">{children}</a>;
  }
  return <Link to={href as string as never} className={className} onClick={onClick} onMouseEnter={onMouseEnter}>{children}</Link>;
}

function DesktopDropdown({ item }: { item: NavItem }) {
  const firstCollection = item.children.find((c) => collectionSlugFromHref(c.href));
  const [hoveredHref, setHoveredHref] = useState<string | null>(firstCollection?.href ?? item.children[0]?.href ?? null);
  return (
    <div className="invisible absolute left-0 top-full z-50 pt-3 opacity-0 transition-opacity duration-200 [transition-timing-function:steps(2,end)] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
      <div className="marca-vellum marca-lift grid w-[560px] grid-cols-[190px_1fr] border border-marca-line">
        <div className="border-r border-marca-line py-2">
          {item.children.map((child) => {
            const isCollection = !!collectionSlugFromHref(child.href);
            return (
              <NavHref key={child.id} href={child.href} onMouseEnter={isCollection ? () => setHoveredHref(child.href) : undefined}
                className={`${LINK} block px-5 py-2.5 ${hoveredHref === child.href ? "" : "text-marca-suave"} hover:text-marca-cacao`}>
                {child.label}
              </NavHref>
            );
          })}
        </div>
        <div className="p-4"><NavChildProducts href={hoveredHref} /></div>
      </div>
    </div>
  );
}

export function SiteNavView({ vm }: { vm: SiteNavVM }) {
  const { hideAnnouncement, ann, count, user, cartOpen, setCartOpen, menuOpen, setMenuOpen, collapsed, setCollapsed, searchOpen, setSearchOpen, nav } = vm;
  const [scrolled, setScrolled] = useState(false);
  const [bump, setBump] = useState(0);
  const prevCount = useRef(count);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 30);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (count > prevCount.current) setBump((b) => b + 1);
    prevCount.current = count;
  }, [count]);

  const general = ann?.general;
  const strip = !hideAnnouncement && general && general.enabled !== false ? general.items ?? [] : [];

  return (
    <>
      <GrainOverlay />
      <MarcaLoader />
      {strip.length ? <AnnouncementStrip items={strip} /> : null}
      <header className={`marca marca-hdr sticky top-0 z-50 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 py-3 ${scrolled ? "is-scrolled" : ""}`}>
        <div className="flex min-w-0 items-center gap-3.5 md:gap-[22px]">
          <nav aria-label="Principal" className="hidden min-w-0 items-center gap-6 md:flex">
            {nav.map((item) => (
              <div key={item.id} className="group relative">
                <NavHref href={item.href} className={`${LINK} marca-bk p-0 py-1.5`}>{item.label}</NavHref>
                {item.children.length > 0 && <DesktopDropdown item={item} />}
              </div>
            ))}
          </nav>
          <button type="button" onClick={() => setMenuOpen(true)} className={`${LINK} py-1.5 md:hidden`} aria-expanded={menuOpen}>Menú</button>
        </div>

        {/* solo la marca: logotipo arriba; al bajar parpadea y queda el isotipo animado */}
        <Link to="/" aria-label="Tu Marca, inicio" className="block text-marca-cacao">
          <MarcaMark />
        </Link>

        <div className="flex min-w-0 items-center justify-end gap-4 md:gap-6">
          <div className="hidden lg:block"><LocaleSwitcher /></div>
          <button type="button" onClick={() => setSearchOpen(true)} className={`${LINK} hidden py-1.5 sm:inline`} aria-expanded={searchOpen}>Buscar</button>
          <Link to={user ? "/cuenta" : "/auth"} className={`${LINK} hidden py-1.5 md:inline`}>{user ? "Cuenta" : "Ingresar"}</Link>
          <button type="button" onClick={() => setCartOpen(true)} className={`${LINK} py-1.5`} aria-expanded={cartOpen}>
            Bolsa (<span key={bump} className={bump ? "marca-bump" : "inline-block"}>{count}</span>)
          </button>
        </div>
      </header>

      <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="marca-scrim fixed inset-0 z-[60] bg-marca-cacao/20 backdrop-blur-[3px]" />
          <Dialog.Content aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} className="marca marca-sheet-l fixed inset-y-0 left-0 z-[61] w-[min(380px,92%)] outline-none">
            <div className="marca-vellum flex h-full flex-col gap-5 overflow-y-auto px-[26px] pb-[max(28px,env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+22px)]">
              <div className="flex items-center justify-between">
                <Dialog.Title className="marca-mono marca-mono-soft">Menú</Dialog.Title>
                <Dialog.Close className="marca-mono text-[10.5px] text-marca-cacao">Cerrar</Dialog.Close>
              </div>
              <nav className="mt-5 grid gap-2" aria-label="Menú">
                {nav.map((item) => {
                  const isCollapsed = collapsed.has(item.id);
                  return (
                    <div key={item.id}>
                      <div className="flex items-center justify-between gap-3">
                        <NavHref href={item.href} onClick={() => setMenuOpen(false)} className="marca-t block text-[26px] leading-[1.2] text-marca-cacao no-underline">{item.label}</NavHref>
                        {item.children.length > 0 && (
                          <button type="button" aria-expanded={!isCollapsed} aria-label={isCollapsed ? `Expandir ${item.label}` : `Minimizar ${item.label}`} className="marca-mono p-2 text-marca-suave"
                            onClick={() => setCollapsed((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>
                            {isCollapsed ? "+" : "−"}
                          </button>
                        )}
                      </div>
                      {item.children.length > 0 && !isCollapsed && (
                        <div className="grid gap-1 pb-2 pl-1 pt-1">
                          {item.children.map((child) => (
                            <NavHref key={child.id} href={child.href} onClick={() => setMenuOpen(false)} className={`${LINK} block py-1 text-marca-suave`}>{child.label}</NavHref>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <Link to={user ? "/cuenta" : "/auth"} onClick={() => setMenuOpen(false)} className="marca-t mt-2 block text-[26px] leading-[1.2] text-marca-cacao no-underline">{user ? "Mi cuenta" : "Ingresar"}</Link>
              </nav>
              <button type="button" className="marca-bk self-start" onClick={() => { setMenuOpen(false); setSearchOpen(true); }}>Buscar</button>
              <div className="mt-auto"><LocaleSwitcher variant="mobile" /></div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
      <SelectionToast onOpenSelection={() => setCartOpen(true)} />
      {/* TODO(logica): necesito subscribeNewsletter(email) → { code } en @/logic para pasarlo como onSubscribe. */}
      <NewsletterPopup blocked={cartOpen || menuOpen || searchOpen} />
    </>
  );
}
