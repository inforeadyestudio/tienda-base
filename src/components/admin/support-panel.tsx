import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, LifeBuoy, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUPPORT_URL = "https://www.readytowork.dev/soporte/ticket";

export function AdminSupportPanel({ placement = "floating", collapsed = false }: { placement?: "floating" | "sidebar"; collapsed?: boolean }) {
  const inSidebar = placement === "sidebar";
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant={inSidebar ? "ghost" : "outline"} size={inSidebar ? "default" : "icon"} aria-label="Abrir soporte" title="Soporte" className={inSidebar ? `flex w-[calc(100%-1.5rem)] gap-3 mx-3 py-2.5 h-auto rounded-full text-sm font-normal text-ink/70 hover:bg-sidebar-accent hover:text-ink ${collapsed ? "justify-center px-0" : "justify-start px-4"}` : "size-10 rounded-full bg-sidebar border-ink/10 shadow-md text-ink/70 hover:text-ink"}>
          <LifeBuoy className="size-4" />
          {inSidebar && !collapsed && <span>Soporte</span>}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-ink/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <Dialog.Content aria-describedby={undefined} className="admin-scope fixed inset-y-0 right-0 z-[121] flex h-dvh w-full max-w-2xl flex-col border-l border-sidebar-border bg-sidebar shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-300 motion-reduce:animate-none">
          <header className="flex shrink-0 items-center gap-3 border-b border-sidebar-border px-5 py-3">
            <LifeBuoy className="size-5 text-moss" />
            <Dialog.Title className="flex-1 text-lg font-medium text-ink">Soporte</Dialog.Title>
            <Button asChild variant="ghost" size="icon">
              <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" aria-label="Abrir soporte en otra pestaña" title="Abrir en otra pestaña"><ExternalLink className="size-4" /></a>
            </Button>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Cerrar soporte" title="Cerrar soporte"><X className="size-4" /></Button>
            </Dialog.Close>
          </header>
          <iframe src={SUPPORT_URL} title="Formulario de soporte Ready" className="min-h-0 w-full flex-1 border-0" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}