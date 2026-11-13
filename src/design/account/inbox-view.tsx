// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/cuenta/ui";
import envelopeBg from "@/assets/envelope-bg.png";
import { formatDate } from "@/lib/format";
import { type InboxPageVM } from "@/logic/account/use-inbox-page";


export function InboxView({ vm }: { vm: InboxPageVM }) {
  const { messages, open } = vm;
  return (
    <>
      <PageHeader title="Inbox privado" subtitle="Mensajes exclusivos, accesos anticipados y notas del estudio." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              onClick={() => open(m)}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink/5 bg-white/60 p-5"
            >
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.read_at ? "bg-ink/15" : "bg-clay"}`} />
              <div className="min-w-0 flex-1">
                <p className="font-nm text-lg leading-tight">{m.title}</p>
                {m.body && <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-moss/80">{m.body}</p>}
                {m.image_url && (
                  <img
                    src={m.image_url}
                    alt={m.title}
                    loading="lazy"
                    className="mt-3 w-full max-w-sm rounded-xl object-cover"
                  />
                )}
                {m.cta_url && (
                  <Link
                    to={m.cta_url.startsWith("http") ? undefined : m.cta_url}
                    href={m.cta_url.startsWith("http") ? m.cta_url : undefined}
                    className="mt-3 inline-block rounded-full bg-ink px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-ivory"
                  >
                    {m.cta_label || "Ver más"}
                  </Link>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-moss/60">{formatDate(m.created_at)}</span>
            </li>
          ))}
          {messages.length === 0 && (
            <li className="rounded-2xl border border-ink/5 bg-white/60 p-8 text-center text-[11px] text-moss/70">
              Todavía no tienes mensajes.
            </li>
          )}
        </ul>

        <div
          className="flex aspect-[3/2] flex-col items-center justify-center rounded-2xl bg-cream bg-contain bg-center bg-no-repeat px-6 text-center"
          style={{ backgroundImage: `url(${envelopeBg})` }}
        >
          <p className="font-serif italic text-xl">Tu espacio privado</p>
          <p className="mt-2 text-[11px] leading-relaxed text-moss">
            Aquí llegan los mensajes<br />y accesos que el estudio te envía.
          </p>
        </div>
      </div>
    </>
  );
}
