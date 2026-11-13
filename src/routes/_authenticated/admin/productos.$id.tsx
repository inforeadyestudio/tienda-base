import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ProductEditorModal } from "@/components/admin/product-editor-modal";

export const Route = createFileRoute("/_authenticated/admin/productos/$id")({
  head: () => ({
    meta: [
      { title: "Editar producto · Tu Marca Sales Hub" },
      { name: "description", content: "Edita información, multimedia, precios, canales y FAQs de un producto." },
      { property: "og:title", content: "Editar producto · Tu Marca Sales Hub" },
      { property: "og:description", content: "Editor interno de productos para el catálogo omnicanal de Tu Marca." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductEditor,
});

function ProductEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else navigate({ to: "/admin/productos", search: { edit: undefined } });
  };
  return (
    <div className="min-h-screen bg-shell p-10">
      <ProductEditorModal
        productId={id}
        onClose={back}
        onSaved={back}
        onDeleted={() => navigate({ to: "/admin/productos", search: { edit: undefined } })}
      />
    </div>
  );
}
