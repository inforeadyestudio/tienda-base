import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Instagram } from "lucide-react";
import { SiteNav } from "@/components/storefront/site-nav";
import { seoHead } from "@/lib/seo";
import { BRAND } from "@/config/brand";

export const Route = createFileRoute("/contacto")({
  head: () =>
    seoHead({
      title: "Contacto | Tu Marca",
      description:
        "Escríbenos sobre productos, pedidos o cualquier duda.",
      path: "/contacto",
    }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <div className="min-h-screen bg-shell text-ink">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <p className="font-nm text-[11px] uppercase tracking-[0.22em] text-moss/70">Estamos para ti</p>
        <h1 className="mt-3 font-nm text-4xl tracking-tight md:text-5xl">Contacto</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink/70">
          ¿Dudas con tu pedido, tu talla o una devolución? Escríbenos y te respondemos lo antes posible.
        </p>

        <div className="mt-12 grid gap-px border border-ink/10 bg-ink/10 sm:grid-cols-3">
          <a
            href={`mailto:${BRAND.contactEmail}`}
            className="group flex flex-col gap-3 bg-shell p-6 transition-colors hover:bg-ink/5"
          >
            <Mail className="size-5 text-moss" strokeWidth={1.5} />
            <p className="font-nm text-[11px] uppercase tracking-[0.16em]">Correo</p>
            <p className="text-sm text-ink/70 group-hover:text-ink">{BRAND.contactEmail}</p>
          </a>
          <a
            href="https://www.instagram.com/tumarca"
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col gap-3 bg-shell p-6 transition-colors hover:bg-ink/5"
          >
            <Instagram className="size-5 text-moss" strokeWidth={1.5} />
            <p className="font-nm text-[11px] uppercase tracking-[0.16em]">Instagram</p>
            <p className="text-sm text-ink/70 group-hover:text-ink">@tumarca</p>
          </a>
        </div>
      </main>
    </div>
  );
}
