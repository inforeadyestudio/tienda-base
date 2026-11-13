import { createFileRoute, Link } from "@tanstack/react-router";
import { useInboxPage } from "@/logic/account/use-inbox-page";
import { InboxView } from "@/design/account/inbox-view";
export const Route = createFileRoute("/_authenticated/cuenta/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox privado · Tu Marca" },
      { name: "description", content: "Mensajes y accesos exclusivos para ti en Tu Marca." },
    ],
  }),
  component: InboxPage,
});

function InboxPage() {
  const vm = useInboxPage();
  return <InboxView vm={vm} />;
}
