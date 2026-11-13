import { createFileRoute } from "@tanstack/react-router";
import { useGiftLists } from "@/logic/account/use-gift-lists";
import { GiftListsView } from "@/design/account/gift-lists-view";
export const Route = createFileRoute("/_authenticated/cuenta/regalos")({
  head: () => ({
    meta: [
      { title: "Lista de regalos · Tu Marca" },
      { name: "description", content: "Arma tu lista de regalos Tu Marca y compártela con quien tú quieras." },
    ],
  }),
  component: GiftListsPage,
});


function GiftListsPage() {
  const vm = useGiftLists();
  return <GiftListsView vm={vm} />;
}
