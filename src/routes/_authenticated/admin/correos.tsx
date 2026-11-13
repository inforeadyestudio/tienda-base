import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmailContentEditor } from "@/components/admin/email-content-editor";
import { CUSTOMIZABLE_EVENTS, type EmailContent } from "@/lib/email/custom-content";

export const Route = createFileRoute("/_authenticated/admin/correos")({
  head: () => ({ meta: [{ title: "Correos automáticos · Tu Marca Sales Hub" }, { name: "description", content: "Configura los correos automáticos a clientes y al equipo." }] }),
  component: CorreosPage,
});

const LABELS: Record<string, { title: string; detail: string; team?: boolean }> = {
  customer_online_confirmed: { title: "Confirmación de compra online", detail: "Al cliente cuando se aprueba el pago en la tienda online." },
  customer_pos_receipt: { title: "Compra en tienda (POS)", detail: "Al cliente con correo registrado, al cobrar en Tienda Cali o Tienda Bogotá." },
  customer_b2b_order: { title: "Pedido B2B / preventa recibido", detail: "Al cliente mayorista cuando se crea su pedido." },
  customer_b2b_confirmed: { title: "Pedido B2B confirmado", detail: "Al cliente cuando se cierra el pedido y se prepara la lista de empaque." },
  customer_b2b_shipped: { title: "Pedido B2B enviado", detail: "Al cliente cuando se registra la guía y se despacha." },
  customer_b2b_delivered: { title: "Pedido B2B entregado", detail: "Al cliente cuando se confirma la entrega." },
  customer_manual_order: { title: "Pedido manual", detail: "Al cliente cuando se registra o confirma un pedido manual." },
  customer_abandoned_cart: { title: "Carrito abandonado", detail: "A quien escribió su correo en el checkout y no pagó, 4 horas después." },
  customer_welcome: { title: "Bienvenida", detail: "Al cliente la primera vez que crea su cuenta en la tienda." },
  customer_review_request: { title: "Invitación a dejar reseña", detail: "Al cliente con cuenta, 12 días después de que su pedido pasa a Entregado. Ofrece 10.000 puntos por reseñar desde su perfil." },
  customer_shipping_label: { title: "Guía de envío generada", detail: "Al cliente con la transportadora y el número de guía." },
  team_online_sale: { title: "Venta confirmada (online y manual)", detail: "Aviso al equipo por cada venta online o pedido manual pagado, en pesos o dólares según el pedido.", team: true },
  team_b2b_preorder: { title: "Nuevo pedido preventa B2B", detail: "Aviso al equipo cuando entra un pedido mayorista.", team: true },
  team_pos_closing: { title: "Cierre de caja POS", detail: "Reporte al equipo cada vez que se cierra una caja.", team: true },
  team_transfer_bodega: { title: "Traslado hacia Bodega Central", detail: "Apenas se crea un traslado con destino Bodega Central, con la lista de prendas.", team: true },
  team_transfer_bogota: { title: "Traslado hacia Bogotá", detail: "Apenas se crea un traslado con destino Tienda Bogotá, con la lista de prendas.", team: true },
  team_transfer_cali: { title: "Traslado hacia Cali", detail: "Apenas se crea un traslado con destino Tienda Cali, con la lista de prendas.", team: true },
  team_store_web_cali: { title: "Pedido web para despachar desde Cali", detail: "Cuando un pedido de la tienda online toma prendas de Tienda Cali.", team: true },
  team_store_web_bogota: { title: "Pedido web para despachar desde Bogotá", detail: "Cuando un pedido de la tienda online toma prendas de Tienda Bogotá.", team: true },
  team_credit_reminder: { title: "Recordatorio de cobro a crédito", detail: "Cada mañana, lista de pedidos manuales a crédito que vencen en 3 días o menos o ya vencieron sin pago.", team: true },
  team_inventory_backup: { title: "Copia de seguridad (cada 2 días)", detail: "Excel con inventario por bodega, pedidos y productos con precios, descripciones y variantes.", team: true },
};

type Row = { event: string; enabled: boolean; recipients: string[]; content?: EmailContent };

function CorreosPage() {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin", "email-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_notification_settings" as any).select("event,enabled,recipients,content");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const { data: log } = useQuery({
    queryKey: ["admin", "email-log"],
    queryFn: async () => {
      const { data } = await supabase.from("email_send_log" as any).select("event,recipients,status,error,created_at").order("created_at", { ascending: false }).limit(100);
      return (data ?? []) as unknown as { event: string; recipients: string[]; status: string; error: string | null; created_at: string }[];
    },
  });
  const rows = Object.keys(LABELS).map((k) => data?.find((r) => r.event === k) ?? { event: k, enabled: true, recipients: [], content: {} });

  const save = async (r: Row) => {
    const { error } = await supabase.from("email_notification_settings" as any).upsert({ ...r, updated_at: new Date().toISOString() });
    if (error) return toast.error("No se pudo guardar");
    toast.success("Guardado");
    qc.invalidateQueries({ queryKey: ["admin", "email-settings"] });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-6">
      <header>
        <h1 className="font-nm text-3xl uppercase">Correos automáticos</h1>
        <p className="mt-2 text-sm text-ink/70">Se envían desde el remitente configurado en la marca (variable EMAIL_FROM).</p>
      </header>
      <Section title="A clientes">{rows.filter((r) => !LABELS[r.event].team).map((r) => <EventRow key={r.event} row={r} onSave={save} />)}</Section>
      <Section title="Al equipo Tu Marca">{rows.filter((r) => LABELS[r.event].team).map((r) => <EventRow key={r.event} row={r} onSave={save} />)}</Section>
      <Section title="Últimos envíos">
        {!log?.length ? <p className="text-sm text-ink/60">Aún no hay envíos.</p> : (
          <>
            {(showAll ? log : log.slice(0, 10)).map((l, i) => (
              <div key={i} className="flex flex-wrap justify-between gap-2 border-b border-ink/10 py-2 text-xs">
                <span>{LABELS[l.event]?.title ?? l.event} · {l.recipients.join(", ")}</span>
                <span className={l.status === "error" ? "text-destructive" : "text-ink/60"} title={l.error ?? ""}>{l.status === "sent" ? "Enviado" : l.status === "error" ? "Error" : "Enviando"} · {new Date(l.created_at).toLocaleString("es-CO")}</span>
              </div>
            ))}
            {log.length > 10 && (
              <button onClick={() => setShowAll((v) => !v)} className="mt-3 border border-ink px-4 py-2 text-xs uppercase tracking-[0.14em]">
                {showAll ? "Ver menos" : `Ver más (${log.length - 10} envíos más)`}
              </button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/60">{title}</h2><div className="divide-y divide-ink/10 border-y border-ink/10">{children}</div></section>;
}

function EventRow({ row, onSave }: { row: Row; onSave: (r: Row) => void }) {
  const meta = LABELS[row.event];
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.recipients.join(", "));
  useEffect(() => setText(row.recipients.join(", ")), [row.recipients]);
  const parse = () => text.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
  return (
    <div className="space-y-2 py-4">
      {editing && <EmailContentEditor event={row.event} title={meta.title} content={row.content ?? {}} onClose={() => setEditing(false)} onSave={async (content) => onSave({ ...row, content })} />}
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-sm font-medium">{meta.title}</p><p className="text-xs text-ink/60">{meta.detail}</p></div>
        <div className="flex shrink-0 items-center gap-4">
        {(CUSTOMIZABLE_EVENTS as readonly string[]).includes(row.event) && <button onClick={() => setEditing(true)} className="text-xs underline">Personalizar</button>}
        <label className="flex shrink-0 items-center gap-2 text-xs">
          <input type="checkbox" checked={row.enabled} onChange={(e) => onSave({ ...row, enabled: e.target.checked })} /> {row.enabled ? "Activo" : "Apagado"}
        </label>
        </div>
      </div>
      {meta.team && (
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="correo1@ejemplo.com, correo2@…" className="h-9 flex-1 border border-ink/20 bg-transparent px-3 text-sm" />
          <button onClick={() => onSave({ ...row, recipients: parse() })} className="h-9 border border-ink px-4 text-xs uppercase tracking-[0.14em]">Guardar</button>
        </div>
      )}
    </div>
  );
}
