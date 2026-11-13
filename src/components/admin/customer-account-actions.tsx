import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCustomer, setCustomerPassword } from "@/lib/admin/customer-contact.functions";

export function CustomerAccountActions({ userId, name, backTo = "/admin/clientes" }: { userId: string; name: string; backTo?: string }) {
  const navigate = useNavigate();
  const setPwd = useServerFn(setCustomerPassword);
  const del = useServerFn(deleteCustomer);
  const [open, setOpen] = useState(false);
  const [pwd, setPwdValue] = useState("");
  const [busy, setBusy] = useState<"pwd" | "del" | null>(null);

  async function savePwd() {
    if (pwd.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres");
    setBusy("pwd");
    try {
      await setPwd({ data: { id: userId, password: pwd } });
      toast.success("Contraseña actualizada. Compártela con el cliente.");
      setOpen(false); setPwdValue("");
    } catch (e: any) { toast.error(e?.message ?? "No se pudo cambiar"); }
    finally { setBusy(null); }
  }

  async function remove() {
    if (!confirm(`¿Eliminar a ${name}? Se borra su cuenta de acceso, direcciones y puntos. Sus pedidos se conservan sin cliente asignado.`)) return;
    setBusy("del");
    try {
      await del({ data: { id: userId } });
      toast.success("Cliente eliminado");
      navigate({ to: backTo as any });
    } catch (e: any) { toast.error(e?.message ?? "No se pudo eliminar"); setBusy(null); }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {open ? (
        <div className="flex items-center gap-2">
          <input type="text" autoFocus value={pwd} onChange={(e) => setPwdValue(e.target.value)} placeholder="Nueva contraseña (mín. 8)"
            className="h-9 rounded-full border border-ink/15 bg-white px-4 text-sm text-ink" />
          <button onClick={savePwd} disabled={busy !== null} className="h-9 rounded-full bg-ink px-4 text-xs text-ivory disabled:opacity-50">
            {busy === "pwd" ? <Loader2 className="size-3.5 animate-spin" /> : "Guardar"}
          </button>
          <button onClick={() => { setOpen(false); setPwdValue(""); }} className="h-9 px-3 text-xs text-ink/60">Cancelar</button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/15 bg-white px-4 text-xs text-ink hover:bg-ink/5">
          <KeyRound className="size-3.5" /> Cambiar contraseña
        </button>
      )}
      <button onClick={remove} disabled={busy !== null} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/30 bg-white px-4 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50">
        {busy === "del" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Eliminar cliente
      </button>
    </div>
  );
}
