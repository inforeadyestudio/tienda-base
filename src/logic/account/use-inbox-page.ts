// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { myMessagesQuery, markMessageRead, type CustomerMessage } from "@/lib/crm/messages";
import { useSession } from "@/lib/auth-hooks";



export function useInboxPage() {
  const { user } = useSession();
  const qc = useQueryClient();
  const { data: messages = [] } = useQuery(myMessagesQuery(user?.id));

  const open = async (m: CustomerMessage) => {
    if (m.read_at) return;
    await markMessageRead(m.id);
    qc.invalidateQueries({ queryKey: ["my-messages", user?.id] });
  };

  return { user, qc, messages, open };
}

export type InboxPageVM = ReturnType<typeof useInboxPage>;
