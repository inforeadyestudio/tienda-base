// Marca del panel (Sales Hub, Tienda Online, B2B, POS): el logotipo TU MARCA de la tienda, que al plegar el menú se va en
// remolino y deja el isotipo (la misma transición del header de la tienda). Toma el color del texto del panel, así que
// sirve en el tema claro y en el de noche. Solo presentación: recibe lo mismo que AdminBrand.
import { Link } from "@tanstack/react-router";
import { MarcaMark } from "@/design/storefront/marca-mark";
import { cx } from "@/design/sections/marca/shared";

export type AdminBrandViewProps = {
  /** Texto bajo el logo: "Sales Hub", "Tienda Online", "B2B"… */
  subtitle: string;
  /** Menú plegado: queda el isotipo */
  collapsed?: boolean;
  to?: "/admin";
};

export function AdminBrandView({ subtitle, collapsed = false, to = "/admin" }: AdminBrandViewProps) {
  return (
    <div className={cx("marca-admin-brand", collapsed && "is-collapsed")}>
      <Link to={to} aria-label="Tu Marca · inicio del panel" className="marca-admin-brand-link text-foreground no-underline">
        <MarcaMark iso={collapsed} logoClassName="h-[38px]" isoClassName="w-[36px]" />
      </Link>
      <span className="marca-admin-brand-sub" aria-hidden={collapsed || undefined}>{subtitle}</span>
    </div>
  );
}
