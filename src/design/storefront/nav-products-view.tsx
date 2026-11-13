// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { Link } from "@tanstack/react-router";
import { NavProductsVM, useNavProducts } from "@/logic/storefront/use-nav-products";
const copFmt = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

export function NavProductsView({ vm }: { vm: NavProductsVM }) {
  const { slug, products } = vm;
  if (!slug) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center px-6">
        <p className="marca-mono marca-mono-soft">Tu Marca</p>
      </div>
    );
  }
  if (!products || products.length === 0) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center px-6">
        <p className="marca-mono marca-mono-soft">Pronto disponible</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {products.map((p) => (
        <Link key={p.id} to="/producto/$slug" params={{ slug: p.slug }} className="group/card block">
          <div className="relative aspect-[4/5] overflow-hidden bg-marca-piedra">
            {p.hero_image_url && (
              <img
                src={p.hero_image_url}
                alt={p.name}
                loading="lazy"
                className="absolute left-[3%] top-1/2 w-[94%] -translate-y-1/2 mix-blend-multiply transition-transform duration-200 [transition-timing-function:steps(2,end)] group-hover/card:-translate-y-[52%]"
              />
            )}
          </div>
          <p className="marca-tr mt-2 text-[11px] text-marca-cacao">{p.name}</p>
          {p.price != null && <p className="marca-mono text-[10px] text-marca-suave">{copFmt.format(p.price)}</p>}
        </Link>
      ))}
    </div>
  );
}

export function NavChildProducts({ href }: { href: string | null }) {
  const vm = useNavProducts({ href });
  return <NavProductsView vm={vm} />;
}
