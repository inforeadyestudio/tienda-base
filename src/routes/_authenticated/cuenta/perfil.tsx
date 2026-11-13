import { createFileRoute } from "@tanstack/react-router";
import { useProfilePage } from "@/logic/account/use-profile-page";
import { ProfileView } from "@/design/account/profile-view";
export const Route = createFileRoute("/_authenticated/cuenta/perfil")({
  head: () => ({
    meta: [
      { title: "Mi perfil · Tu Marca" },
      { name: "description", content: "Actualiza tus datos personales y preferencias de contacto." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const vm = useProfilePage();
  return <ProfileView vm={vm} />;
}
