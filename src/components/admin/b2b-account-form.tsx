import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { createB2BAccount } from "@/lib/b2b/admin.functions";
import { Button } from "@/components/ui/button";

const input = "w-full border border-ink/15 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-ink/40";
const empty = { email: "", fullName: "", company: "", password: "", phone: "", documentId: "", country: "Colombia", city: "", department: "", address: "", postalCode: "" };

export function B2BAccountForm({ label = "Crear cuenta de cliente", onCreated, defaults, startOpen = false }: { label?: string; onCreated?: (customer: { userId: string; name: string }) => void; defaults?: Partial<typeof empty>; startOpen?: boolean }) {
  const create = useServerFn(createB2BAccount);
  const qc = useQueryClient();
  const [open, setOpen] = useState(startOpen);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ ...empty, ...defaults });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const opt = (v: string) => v.trim() || undefined;
      const r = await create({
        data: {
          email: f.email, fullName: f.fullName, company: f.company, password: f.password,
          phone: opt(f.phone), country: opt(f.country), city: opt(f.city), department: opt(f.department),
           address: opt(f.address), postalCode: opt(f.postalCode), documentId: f.documentId,
        },
      });
      toast.success(r.existed ? "Cuenta existente habilitada para el portal" : "Cliente B2B creado");
      if (r.userId) onCreated?.({ userId: r.userId, name: f.company.trim() || f.fullName.trim() });
      setF(empty);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-b2b-accounts"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setSaving(false);
    }
  };

  if (!open)
    return (
      <Button type="button" onClick={() => setOpen(true)} className="mb-4 rounded-full bg-ink text-ivory text-xs">
        <UserPlus className="size-4" /> {label}
      </Button>
    );

  return (
    <form onSubmit={submit} className="mb-6 bg-white border border-ink/10 rounded-3xl p-5 grid md:grid-cols-2 gap-3 max-w-3xl">
      <input required placeholder="Nombre del contacto" value={f.fullName} onChange={set("fullName")} className={input} />
      <input required placeholder="Nombre de la empresa" value={f.company} onChange={set("company")} className={input} />
      <input required type="email" placeholder="Correo" value={f.email} onChange={set("email")} className={input} />
      <input placeholder="Teléfono" value={f.phone} onChange={set("phone")} className={input} />
      <input required placeholder="Pasaporte o DNI" value={f.documentId} onChange={set("documentId")} className={input} maxLength={60} />
      <input placeholder="País" value={f.country} onChange={set("country")} className={input} />
      <input placeholder="Ciudad" value={f.city} onChange={set("city")} className={input} />
      <input placeholder="Departamento / estado" value={f.department} onChange={set("department")} className={input} />
      <input placeholder="Código postal" value={f.postalCode} onChange={set("postalCode")} className={input} />
      <input placeholder="Dirección" value={f.address} onChange={set("address")} className={`${input} md:col-span-2`} />
      <input required minLength={8} type="text" placeholder="Clave de acceso (mín. 8)" value={f.password} onChange={set("password")} className={input} autoComplete="new-password" />
      <div className="flex gap-2 md:justify-end">
        <Button variant="outline" type="button" onClick={() => setOpen(false)} className="rounded-full text-xs">Cancelar</Button>
        <Button type="submit" disabled={saving} className="rounded-full bg-ink text-ivory text-xs">{saving ? "Creando…" : "Crear y dar acceso"}</Button>
      </div>
      <p className="md:col-span-2 text-[11px] text-ink/50">La dirección se guarda como principal si incluyes ciudad y dirección. El cliente entra en /auth con este correo y clave y llega a su portal B2B.</p>
    </form>
  );
}
