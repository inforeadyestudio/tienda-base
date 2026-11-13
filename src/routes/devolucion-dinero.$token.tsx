import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getRefundRequest } from "@/lib/returns/returns.functions";
import { formatCOP, formatDate } from "@/lib/format";
import { seoHead, SEO_DEFAULT_DESCRIPTION } from "@/lib/seo";
import { BRAND } from "@/config/brand";

export const Route = createFileRoute("/devolucion-dinero/$token")({
  loader: async ({ params }) => {
    const ok = /^[0-9a-f-]{36}$/i.test(params.token);
    return ok ? await getRefundRequest({ data: { token: params.token } }) : null;
  },
  head: () => seoHead({ title: "Devolución de dinero | Tu Marca", description: SEO_DEFAULT_DESCRIPTION, path: "/devolucion-dinero", noindex: true }),
  errorComponent: () => <Shell><p className="text-sm">No pudimos cargar tu solicitud. Intenta de nuevo más tarde.</p></Shell>,
  notFoundComponent: () => <Shell><p className="text-sm">Enlace no válido.</p></Shell>,
  component: RefundLetterPage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-ivory text-ink px-6 py-16"><div className="max-w-2xl mx-auto">{children}</div></main>;
}

function RefundLetterPage() {
  const req = Route.useLoaderData();
  const [f, setF] = useState({ name: req?.name ?? "", doc: "", city: "", bank: "", accType: "Ahorros", account: "", phone: "", email: "", reason: "" });
  const [ready, setReady] = useState(false);
  if (!req) return <Shell><p className="text-sm">Este enlace no es válido o la solicitud ya no está disponible.</p></Shell>;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const complete = f.name && f.doc && f.bank && f.account && f.city;
  const today = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });

  if (ready) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl p-10 text-sm leading-relaxed print:p-0 print:shadow-none">
          <p>{f.city}, {today}</p>
          <p className="mt-6">Señores<br />{BRAND.legalName}<br />Área de Contabilidad</p>
          <p className="mt-6"><b>Asunto:</b> Solicitud de devolución de dinero · pedido {req.orderNumber}</p>
          <p className="mt-6">Yo, {f.name}, identificado(a) con cédula n.º {f.doc}, solicito la devolución de {formatCOP(req.amount)} correspondiente a la devolución de las siguientes prendas del pedido {req.orderNumber}, recibidas el {formatDate(req.date)}:</p>
          <ul className="mt-3 list-disc pl-6">{req.items.map((i, k) => <li key={k}>{i.name} {i.label} · {i.qty} und</li>)}</ul>
          {f.reason && <p className="mt-3">Motivo: {f.reason}</p>}
          <p className="mt-4">Solicito que el valor sea consignado en la cuenta {f.accType.toLowerCase()} n.º {f.account} del banco {f.bank}, a mi nombre.</p>
          <p className="mt-4">Adjunto fotocopia de mi cédula y certificación bancaria.</p>
          <p className="mt-10">Atentamente,</p>
          <p className="mt-12">______________________________<br />{f.name}<br />C.C. {f.doc}<br />{f.phone}{f.email ? ` · ${f.email}` : ""}</p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 print:hidden">
          <button onClick={() => window.print()} className="rounded-full bg-ink text-ivory px-6 py-3 text-sm">Imprimir o guardar PDF</button>
          <button onClick={() => setReady(false)} className="rounded-full border border-ink/15 px-6 py-3 text-sm">Editar datos</button>
        </div>
        <p className="mt-6 text-sm print:hidden">Firma la carta y envíala{req.accountingEmail ? <> a <b>{req.accountingEmail}</b></> : " al correo de contabilidad"} junto con la fotocopia de tu cédula y la certificación bancaria a tu nombre.</p>
      </Shell>
    );
  }

  const input = "w-full rounded-full border border-ink/15 px-4 py-2.5 text-sm bg-white outline-none focus:border-ink";
  return (
    <Shell>
      <p className="text-[10px] uppercase tracking-widest text-moss/70">Tu Marca</p>
      <h1 className="font-nm text-4xl mt-2">Solicitud de devolución de dinero</h1>
      <p className="text-sm text-moss mt-3">Pedido {req.orderNumber} · {formatCOP(req.amount)}. Completa tus datos para generar la carta.</p>
      <div className="mt-8 grid sm:grid-cols-2 gap-3">
        <input className={input} placeholder="Nombre completo" value={f.name} onChange={set("name")} maxLength={120} />
        <input className={input} placeholder="Cédula" value={f.doc} onChange={set("doc")} maxLength={20} />
        <input className={input} placeholder="Ciudad" value={f.city} onChange={set("city")} maxLength={60} />
        <input className={input} placeholder="Teléfono" value={f.phone} onChange={set("phone")} maxLength={20} />
        <input className={input} placeholder="Correo" value={f.email} onChange={set("email")} maxLength={120} />
        <input className={input} placeholder="Banco" value={f.bank} onChange={set("bank")} maxLength={60} />
        <select className={input} value={f.accType} onChange={set("accType")}><option>Ahorros</option><option>Corriente</option></select>
        <input className={input} placeholder="Número de cuenta" value={f.account} onChange={set("account")} maxLength={30} />
      </div>
      <textarea className="mt-3 w-full rounded-2xl border border-ink/15 px-4 py-3 text-sm bg-white" rows={3} placeholder="Motivo (opcional)" value={f.reason} onChange={set("reason")} maxLength={500} />
      <button disabled={!complete} onClick={() => setReady(true)} className="mt-4 rounded-full bg-ink text-ivory px-6 py-3 text-sm disabled:opacity-40">Generar carta</button>
      <div className="mt-10 text-sm space-y-1">
        <p className="font-medium">Debes enviar{req.accountingEmail ? ` a ${req.accountingEmail}` : " a contabilidad"}:</p>
        <p>1. Esta carta firmada.</p>
        <p>2. Fotocopia de tu cédula.</p>
        <p>3. Certificación bancaria a tu nombre.</p>
      </div>
    </Shell>
  );
}
