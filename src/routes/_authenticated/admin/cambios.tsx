import { createFileRoute } from "@tanstack/react-router";
import { ReturnsPanel } from "@/components/admin/returns-panel";
import { ReturnContactsEditor } from "@/components/admin/return-contacts-editor";

export const Route = createFileRoute("/_authenticated/admin/cambios")({
  head: () => ({ meta: [
    { title: "Cambios y devoluciones · Sales Hub Tu Marca" },
    { name: "description", content: "Gestión de cambios y devoluciones de Tu Marca." },
    { property: "og:title", content: "Cambios y devoluciones · Sales Hub Tu Marca" },
    { property: "og:description", content: "Gestión de cambios y devoluciones de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => (
    <>
      <ReturnContactsEditor />
      <ReturnsPanel scope={{ kind: "global" }} title="Cambios y devoluciones" subtitle="Sales Hub · Global" />
    </>
  ),
});
