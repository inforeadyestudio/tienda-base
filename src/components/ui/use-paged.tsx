import { useState } from "react";

/** Pagina una lista en memoria (50 por página) y devuelve la barra de navegación. */
export function usePaged<T>(items: T[], size = 50) {
  const [page, setPage] = useState(0);
  const count = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(page, count - 1);
  const pageItems = items.slice(p * size, (p + 1) * size);
  const pager =
    items.length > size ? (
      <div className="mt-4 flex items-center justify-between px-2 text-xs text-ink/60">
        <span>
          {p * size + 1}–{Math.min((p + 1) * size, items.length)} de {items.length}
        </span>
        <div className="flex items-center gap-2">
          <button disabled={p === 0} onClick={() => setPage(p - 1)} className="rounded-full border border-ink/10 bg-white px-4 py-1.5 disabled:opacity-40">Anterior</button>
          <span>Página {p + 1} de {count}</span>
          <button disabled={p >= count - 1} onClick={() => setPage(p + 1)} className="rounded-full border border-ink/10 bg-white px-4 py-1.5 disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    ) : null;
  return { pageItems, pager };
}
