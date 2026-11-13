import { createFileRoute, Link } from "@tanstack/react-router";
import { useTryOnPage } from "@/logic/account/use-try-on-page";
import { TryOnView } from "@/design/account/try-on-view";
export const Route = createFileRoute("/_authenticated/cuenta/try-on")({
  head: () => ({
    meta: [
      { title: "Virtual Try-On · Tu Marca" },
      { name: "description", content: "Prueba los looks de Tu Marca con tus propias fotos antes de comprar." },
      { property: "og:title", content: "Virtual Try-On · Tu Marca" },
      { property: "og:description", content: "Prueba los looks de Tu Marca con tus propias fotos antes de comprar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TryOnPage,
});

function TryOnPage() {
  const vm = useTryOnPage();
  return <TryOnView vm={vm} />;
}
