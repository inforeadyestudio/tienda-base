import { Link } from "@tanstack/react-router";
import type { ReadyUiAction } from "@/lib/ready/actions";

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

function ProductStrip({ products }: { products: any[] }) {
  if (!products?.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {products.slice(0, 3).map((p) =>
        p.slug ? (
          <Link
            key={p.id}
            to="/producto/$slug"
            params={{ slug: p.slug }}
            className="group text-left"
            aria-label={`Ver ${p.name}`}
          >
            <div className="aspect-[3/4] overflow-hidden bg-muted">
              {p.image ? (
                <img
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              ) : null}
            </div>
            <p className="mt-2 text-[10px] leading-tight uppercase tracking-[0.08em]">{p.name}</p>
            {typeof p.from_price_cop === "number" ? (
              <p className="text-[10px] text-muted-foreground">{cop(p.from_price_cop)}</p>
            ) : null}
          </Link>
        ) : null,
      )}
    </div>
  );
}

function Metrics({ title, metrics }: { title?: string; metrics: any[] }) {
  return (
    <div>
      {title ? <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{title}</p> : null}
      <div className="grid grid-cols-3 gap-px bg-border">
        {(metrics ?? []).map((m, i) => (
          <div key={i} className="bg-background p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{m.label}</p>
            <p className="font-nm mt-1 text-lg leading-none">
              {m.format === "cop" ? cop(Number(m.value) || 0) : String(m.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Rows({ rows, columns }: { rows: any[]; columns: string[] }) {
  if (!rows?.length) return null;
  return (
    <div className="overflow-x-auto border border-border">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border text-left uppercase tracking-[0.12em] text-muted-foreground">
            {columns.map((c) => (
              <th key={c} className="px-2 py-1.5 font-normal">
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {columns.map((c) => (
                <td key={c} className="px-2 py-1.5">
                  {typeof r[c] === "number" && c.includes("cop") ? cop(r[c]) : String(r[c] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderLinks({ orders }: { orders: any[] }) {
  if (!orders?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {orders.slice(0, 20).map((o, k) =>
        o.id && (o.kind === "b2b" || o.kind === "admin") ? (
          <Link
            key={k}
            to={o.kind === "b2b" ? "/admin/b2b/pedido/$id" : "/admin/pedido/$id"}
            params={{ id: o.id }}
            className="inline-block border-b border-ink text-[11px] uppercase tracking-[0.16em]"
          >
            Ver pedido {o.number}
          </Link>
        ) : (
          <span key={k} className="text-[11px] uppercase tracking-[0.12em]">
            {o.number}
            {o.status ? <span className="text-muted-foreground"> · {o.status}</span> : null}
            {typeof o.total_cop === "number" ? <span className="text-muted-foreground"> · {cop(o.total_cop)}</span> : null}
          </span>
        ),
      )}
    </div>
  );
}

function CartBlock({ items }: { items: any[] }) {
  if (!items?.length) return <p className="text-[11px] text-muted-foreground">Tu bolsa está vacía.</p>;
  const total = items.reduce((s, i) => s + (i.price_cop ?? 0) * (i.qty ?? 1), 0);
  return (
    <div className="border border-border">
      {items.map((i, k) => (
        <div key={k} className="flex items-baseline justify-between border-b border-border/50 px-3 py-2 last:border-0">
          <span className="text-[11px] uppercase tracking-[0.08em]">
            {i.name} {i.variant ? <span className="text-muted-foreground">· {i.variant}</span> : null}
          </span>
          <span className="text-[11px] text-muted-foreground">×{i.qty}</span>
        </div>
      ))}
      {total ? (
        <div className="flex justify-between px-3 py-2 text-[11px] uppercase tracking-[0.12em]">
          <span>Subtotal</span>
          <span>{cop(total)}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Renderiza únicamente acciones validadas. Nunca ejecuta contenido del modelo. */
export function ReadyResults({ actions }: { actions: ReadyUiAction[] }) {
  if (!actions.length) return null;
  return (
    <div className="space-y-4">
      {actions.map((a, i) => {
        const p = a.payload ?? {};
        switch (a.type) {
          case "show_products":
          case "open_cross_sell":
          case "show_look":
            return <ProductStrip key={i} products={p["products"] ?? []} />;
          case "show_product":
            return p["slug"] ? (
              <Link
                key={i}
                to="/producto/$slug"
                params={{ slug: p["slug"] }}
                className="inline-block border-b border-ink text-[11px] uppercase tracking-[0.16em]"
              >
                Ver producto
              </Link>
            ) : null;
          case "show_metrics":
            return <Metrics key={i} title={p["title"]} metrics={p["metrics"] ?? []} />;
          case "show_cart":
            return <CartBlock key={i} items={p["items"] ?? []} />;
          case "cart_add":
            return (
              <p key={i} className="text-[11px] uppercase tracking-[0.12em]">
                Agregado a la bolsa
              </p>
            );
          case "show_inventory":
            return (
              <Rows
                key={i}
                rows={p["rows"] ?? []}
                columns={Object.keys((p["rows"] ?? [{}])[0] ?? {}).slice(0, 5)}
              />
            );
          case "show_order":
            return <OrderLinks key={i} orders={p["orders"] ?? []} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
