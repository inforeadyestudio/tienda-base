import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useB2BAccounts } from "@/lib/b2b/admin";
import { formatCOP, formatDate } from "@/lib/format";
import { B2BAccountForm } from "@/components/admin/b2b-account-form";

export const Route = createFileRoute("/_authenticated/admin/b2b/clientes")({
  component: B2BClientes,
});

function B2BClientes() {
  const { data, isLoading } = useB2BAccounts();
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const rows = (data ?? []).filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 md:p-10">
      <header className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">CRM mayorista</p>
        <h1 className="font-serif text-3xl md:text-4xl text-ink mt-1">Clientes B2B</h1>
      </header>

      <B2BAccountForm label="Nuevo cliente" />


      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar cuenta…"
        className="w-full max-w-sm mb-5 px-4 py-2.5 rounded-full bg-white border border-ink/10 text-sm outline-none focus:border-ink/30"
      />

      <div className="bg-white rounded-3xl border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-ink/45 border-b border-ink/8">
              <th className="px-5 py-3">Cuenta</th>
              <th className="px-5 py-3">Teléfono</th>
              <th className="px-5 py-3">Pedidos</th>
              <th className="px-5 py-3">Facturado</th>
              <th className="px-5 py-3">Última compra</th>
              <th className="px-5 py-3">Cliente desde</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.userId} onClick={() => navigate({ to: "/admin/cliente/$id", params: { id: a.userId } })} className="border-b border-ink/5 last:border-0 cursor-pointer hover:bg-ink/[0.03]">
                <td className="px-5 py-3 font-medium underline decoration-ink/20">{a.name}</td>
                <td className="px-5 py-3 text-ink/60">{a.phone ?? "—"}</td>
                <td className="px-5 py-3">{a.orders}</td>
                <td className="px-5 py-3">{formatCOP(a.total)}</td>
                <td className="px-5 py-3 text-ink/60">{a.last ? formatDate(a.last) : "—"}</td>
                <td className="px-5 py-3 text-ink/60">{formatDate(a.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && !rows.length && <div className="px-5 py-8 text-sm text-ink/50">Sin cuentas mayoristas todavía.</div>}
        {isLoading && <div className="px-5 py-8 text-sm text-ink/50">Cargando…</div>}
      </div>
    </div>
  );
}
