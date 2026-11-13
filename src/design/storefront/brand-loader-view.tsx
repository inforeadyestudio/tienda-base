// Pantalla de espera de Tu Marca para todo el sistema (tienda, panel, POS, B2B): el isotipo se llena una y otra vez.
// Reemplaza al loader viejo (logo verde con barrita), así solo hay una pantalla de carga y es la de la marca.
// - full: cubre la pantalla con el beige de la tienda, igual que la carga inicial (MarcaLoader), para que al
//   terminar de cargar la página no se note el cambio de una a otra.
// - sin full: va dentro de la página (por ejemplo, dentro del panel mientras carga una sección) y toma los
//   colores del lugar donde está, así funciona en el tema claro y en el de noche.
// Solo presentación.
import { IsoFill } from "./marca-loader";
import { cx } from "@/design/sections/marca/shared";

export function BrandLoaderView({ label = "Cargando", className, full = false }: { label?: string; className?: string; full?: boolean }) {
  if (full) {
    return (
      <div className={cx("marca marca-loader is-js is-wait", className)} role="status" aria-live="polite">
        <div className="grid justify-items-center gap-4">
          <IsoFill pct={0} loop />
          <span className="marca-mono marca-mono-soft">{label}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={cx("marca-wait", className)} role="status" aria-live="polite">
      <IsoFill pct={0} loop />
      <span className="sr-only">{label}</span>
    </div>
  );
}
