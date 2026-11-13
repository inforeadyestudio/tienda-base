// Marca del header: arriba el logotipo TU MARCA; al bajar, sus letras se van en remolino hacia el centro y de ahí sale
// el isotipo girando. Queda el ojo vivo (trazo que hierve, un temblor leve, la pupila sigue el cursor y parpadea).
// Al volver arriba el ojo se recoge en remolino y las letras vuelven a su sitio.
import { useEffect, useState, type CSSProperties } from "react";
import { LOGO_LETTERS, LOGO_VIEWBOX } from "./marca-logo";
import { Iso, cx } from "@/design/sections/marca/shared";

/** `iso` controla la transición desde afuera (p. ej. el menú del panel al plegarse); sin `iso`, la decide el scroll. */
export function MarcaMark({ className, threshold = 40, iso: isoProp, logoClassName = "h-7 md:h-[34px]", isoClassName = "w-[30px] md:w-[36px]" }: {
  className?: string; threshold?: number; iso?: boolean; logoClassName?: string; isoClassName?: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  const controlled = isoProp !== undefined;
  useEffect(() => {
    if (controlled) return;
    const on = () => setScrolled(window.scrollY > threshold);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [threshold, controlled]);
  const iso = controlled ? isoProp : scrolled;
  return (
    <span className={cx("marca-hmark", iso && "is-iso", className)}>
      <span className="marca-hmark-logo" aria-hidden={iso || undefined}>
        <svg viewBox={LOGO_VIEWBOX} fill="currentColor" className={cx("block w-auto overflow-visible", logoClassName)} role="img" aria-label="Tu Marca" focusable="false">
          {LOGO_LETTERS.map((d, i) => (
            <path key={i} d={d} className="marca-hmark-l" style={{ "--i": i, "--k": Math.abs(i - 2) } as CSSProperties} />
          ))}
        </svg>
      </span>
      <span className="marca-hmark-iso" aria-hidden="true">
        <Iso className={isoClassName} spin={false} alive />
      </span>
    </span>
  );
}
