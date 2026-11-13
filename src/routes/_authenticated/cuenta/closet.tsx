import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-hooks";
import { ClosetSection } from "@/components/closet/closet-section";
import { PageHeader } from "@/components/cuenta/ui";

export const Route = createFileRoute("/_authenticated/cuenta/closet")({
  head: () => ({
    meta: [
      { title: "Mi Closet · Tu Marca" },
      { name: "description", content: "Tu guardarropa completo: lo que compraste y lo que ya tenías, en un solo lugar." },
    ],
  }),
  component: ClosetPage,
});

function ClosetPage() {
  const { user } = useSession();
  return (
    <>
      <PageHeader
        title="Mi Closet"
        subtitle="Sube una foto de una prenda que ya tengas y la convertimos en foto de producto para combinarla con la colección."
      />
      {user && <ClosetSection userId={user.id} />}
    </>
  );
}
