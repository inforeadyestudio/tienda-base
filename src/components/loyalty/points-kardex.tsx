import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const KIND: Record<string, string> = { earn: "Acumuló", redeem: "Gastó", adjust: "Ajuste" };
const CHANNEL: Record<string, string> = { pos: "Tienda física", online: "Online", manual: "Manual" };
const cop = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CO");

/** Historial tipo kardex de puntos: fecha, movimiento, compra relacionada, puntos y saldo. */
export function PointsKardex({ userId, admin = false, limit }: { userId: string; admin?: boolean; limit?: number }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["points-kardex", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loyalty_transactions")
        .select("id, kind, points, channel, note, created_at, order_id, orders(number, total_cop)")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const list = useMemo(() => {
    let bal = 0;
    const withBal = rows.map((t) => {
      const delta = t.kind === "redeem" ? -Math.abs(t.points) : Math.abs(t.points);
      bal += delta;
      return { ...t, delta, balance: bal };
    });
    const desc = withBal.reverse();
    return limit ? desc.slice(0, limit) : desc;
  }, [rows, limit]);

  if (isLoading) return <p className="text-xs text-moss/60 py-3">Cargando historial…</p>;
  if (!list.length) return <p className="text-xs text-moss/60 py-3">Sin movimientos de puntos.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-moss/70 border-b border-ink/10">
            <th className="py-2 pr-3 font-normal">Fecha</th>
            <th className="py-2 pr-3 font-normal">Movimiento</th>
            <th className="py-2 pr-3 font-normal">Compra</th>
            <th className="py-2 pr-3 font-normal text-right">Puntos</th>
            <th className="py-2 font-normal text-right">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {list.map((t) => (
            <tr key={t.id} className="border-b border-ink/5 last:border-0 align-top">
              <td className="py-2.5 pr-3 whitespace-nowrap text-moss">
                {new Date(t.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
              </td>
              <td className="py-2.5 pr-3">
                <div className="text-ink">{KIND[t.kind] ?? t.kind}</div>
                <div className="text-[11px] text-moss/70">
                  {CHANNEL[t.channel] ?? t.channel}{t.note ? ` · ${t.note}` : ""}
                </div>
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap">
                {t.order_id && t.orders ? (
                  <>
                    {admin ? (
                      <Link to="/admin/pedido/$id" params={{ id: t.order_id }} className="underline text-ink hover:text-moss">
                        {t.orders.number}
                      </Link>
                    ) : (
                      <Link to="/cuenta/pedidos" className="underline text-ink hover:text-moss">{t.orders.number}</Link>
                    )}
                    <div className="text-[11px] text-moss/70">{cop(t.orders.total_cop)}</div>
                  </>
                ) : (
                  <span className="text-moss/50">—</span>
                )}
              </td>
              <td className={`py-2.5 pr-3 text-right whitespace-nowrap ${t.delta < 0 ? "text-destructive" : "text-moss"}`}>
                {t.delta < 0 ? "−" : "+"}{Math.abs(t.delta)}
              </td>
              <td className="py-2.5 text-right text-ink">{t.balance}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
