import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";

type ProductHit = {
  id: string;
  slug: string;
  name: string;
  hero_image_url: string | null;
  price: number | null;
};

type CollectionHit = { id: string; slug: string; title: string; cover_url: string | null };

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [term, setTerm] = useState("");
  const q = useDebounced(term.trim());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTerm("");
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ["site-search", q],
    enabled: open && q.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const [prods, cols] = await Promise.all([
        supabase
          .from("products")
          .select("id, slug, name, hero_image_url, product_variants(price_cop)")
          .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
          .ilike("name", like)
          .limit(8),
        supabase
          .from("collections")
          .select("id, slug, title, cover_url")
          .eq("status", "published")
          .ilike("title", like)
          .limit(5),
      ]);
      const products: ProductHit[] = ((prods.data ?? []) as any[]).map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        hero_image_url: p.hero_image_url ?? null,
        price: (p.product_variants ?? []).find((v: any) => v.price_cop != null)?.price_cop ?? null,
      }));
      return { products, collections: (cols.data ?? []) as CollectionHit[] };
    },
  });

  const products = useMemo(() => data?.products ?? [], [data]);
  const collections = useMemo(() => data?.collections ?? [], [data]);
  const hasResults = products.length > 0 || collections.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[8svh] pb-4 md:items-center md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="relative flex max-h-[78svh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-ink/10 bg-ivory shadow-[0_24px_70px_-18px_rgba(0,0,0,0.45)]"
            role="dialog"
            aria-label="Buscar"
          >
            <div className="flex items-center gap-3 border-b border-ink/10 px-5 py-4">
              <Search className="size-4 shrink-0 text-ink/50" strokeWidth={1.5} />
              <input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Busca productos o colecciones…"
                className="w-full bg-transparent font-nm text-base text-ink outline-none placeholder:text-ink/35"
              />
              <button onClick={onClose} aria-label="Cerrar búsqueda" className="shrink-0 text-ink/60 hover:text-ink">
                <X className="size-4" />
              </button>
            </div>

            <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
              {q.length < 2 ? (
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/40">
                  Escribe al menos 2 letras para buscar
                </p>
              ) : !hasResults && !isFetching ? (
                <p className="font-serif text-[15px] text-ink/60">Sin resultados para “{q}”.</p>
              ) : (
                <div className="space-y-6">
                  {collections.length > 0 && (
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">Colecciones</p>
                      <div className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
                        {collections.map((c) => (
                          <Link
                            key={c.id}
                            to="/coleccion/$slug"
                            params={{ slug: c.slug }}
                            onClick={onClose}
                            className="flex items-center gap-3 py-2.5 hover:bg-ink/[0.03]"
                          >
                            <div className="h-10 w-10 shrink-0 overflow-hidden bg-ink/5">
                              {c.cover_url && <img src={c.cover_url} alt={c.title} className="h-full w-full object-cover" loading="lazy" />}
                            </div>
                            <p className="font-nm text-sm text-ink">{c.title}</p>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  {products.length > 0 && (
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">Productos</p>
                      <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
                        {products.map((p) => (
                          <Link
                            key={p.id}
                            to="/producto/$slug"
                            params={{ slug: p.slug }}
                            onClick={onClose}
                            className="group block"
                          >
                            <div className="aspect-[3/4] overflow-hidden bg-ink/5">
                              {p.hero_image_url && (
                                <img
                                  src={p.hero_image_url}
                                  alt={p.name}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                                />
                              )}
                            </div>
                            <p className="mt-2 font-nm text-[12px] text-ink">{p.name}</p>
                            {p.price != null && (
                              <p className="font-mono text-[10px] tracking-[0.1em] text-ink/50">{formatCOP(p.price)}</p>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
