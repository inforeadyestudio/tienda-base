import { useCallback, useMemo, useState } from "react";

/** Nombre compartido para la View Transition entre la tarjeta y la PDP. */
export function productVT(slug: string) {
  return `product-${slug.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * Solo un elemento puede tener un `view-transition-name` dado a la vez.
 * Este hook marca únicamente la tarjeta con la que el usuario está
 * interactuando (hover / pointer down), evitando nombres duplicados.
 */
export function useVTTarget() {
  const [active, setActive] = useState<string | null>(null);

  const bind = useCallback(
    (slug: string) => ({
      onMouseEnter: () => setActive(slug),
      onPointerDown: () => setActive(slug),
      onFocus: () => setActive(slug),
    }),
    [],
  );

  const vtStyle = useCallback(
    (slug: string) => (active === slug ? { viewTransitionName: productVT(slug) } : undefined),
    [active],
  );

  return useMemo(() => ({ bind, vtStyle }), [bind, vtStyle]);
}
