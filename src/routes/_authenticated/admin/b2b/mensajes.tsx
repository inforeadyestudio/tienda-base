import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { useB2BAccounts } from "@/lib/b2b/admin";

export const Route = createFileRoute("/_authenticated/admin/b2b/mensajes")({
  component: B2BMensajes,
});

function B2BMensajes() {
  const { data } = useB2BAccounts();

  return (
    <div className="p-6 md:p-10">
      <header className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Comunicación</p>
        <h1 className="font-serif text-3xl md:text-4xl text-ink mt-1">Mensajes</h1>
      </header>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <aside className="bg-white rounded-3xl border border-ink/10 p-3">
          {(data ?? []).map((a) => (
            <div key={a.userId} className="px-3 py-2.5 rounded-2xl text-sm hover:bg-ink/5 cursor-default">
              <div className="truncate">{a.name}</div>
              <div className="text-[11px] text-ink/45">Sin mensajes</div>
            </div>
          ))}
          {!data?.length && <div className="px-3 py-6 text-sm text-ink/50">Sin cuentas mayoristas.</div>}
        </aside>

        <div className="bg-white rounded-3xl border border-ink/10 flex flex-col items-center justify-center text-center p-12 min-h-[320px]">
          <MessageSquare className="size-6 text-ink/30" />
          <div className="font-serif text-2xl text-ink mt-4">Bandeja vacía</div>
          <p className="text-sm text-ink/55 mt-2 max-w-sm">
            Aquí verás las conversaciones con cada cuenta mayorista cuando activemos la mensajería del portal B2B.
          </p>
        </div>
      </div>
    </div>
  );
}
