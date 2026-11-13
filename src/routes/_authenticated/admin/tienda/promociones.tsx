import { redirect, createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/tienda/promociones")({
  beforeLoad: () => { throw redirect({ to: "/admin/promociones" }); },
  component: () => (
    <div className="p-10">
      <header className="mb-6"><p className="text-[10px] uppercase tracking-widest text-moss/70">Web</p><h1 className="font-serif italic text-4xl mt-1">Promociones</h1></header>
      <p className="text-sm text-moss max-w-xl">Los códigos multi-canal se administran desde el Sales Hub. <Link to="/admin/promociones" className="underline">Ir a promociones globales →</Link></p>
    </div>
  ),
});