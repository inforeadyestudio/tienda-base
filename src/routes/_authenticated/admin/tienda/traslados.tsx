import { redirect, createFileRoute } from "@tanstack/react-router";
import { TrasladosPanel } from "../../pos/$sede/traslados";

export const Route = createFileRoute("/_authenticated/admin/tienda/traslados")({
  beforeLoad: () => { throw redirect({ to: "/admin/traslados" }); },
  head: () => ({ meta: [{ title: "Traslados · Tienda Online" }] }),
  component: () => <TrasladosPanel info={{ code: "ecom", label: "Bodega Ecommerce" }} />,
});
