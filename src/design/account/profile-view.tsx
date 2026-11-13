// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { PageHeader } from "@/components/cuenta/ui";
import { TryOnPhotoManager } from "@/components/tryon/photo-manager";
import type { ProfilePageVM } from "@/logic/account/use-profile-page";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.25em] text-moss">{label}</span>
      {children}
    </label>
  );
}

export function ProfileView({ vm }: { vm: ProfilePageVM }) {
  const { user, fullName, setFullName, phone, setPhone, save } = vm;
  return (
    <>
      <PageHeader title="Mi perfil" subtitle="Tus datos personales y de contacto." />

      <form
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
        className="max-w-lg space-y-5 rounded-2xl border border-ink/5 bg-white/60 p-6"
      >
        <Field label="Nombre completo">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border-b border-ink/15 bg-transparent py-2 text-sm outline-none focus:border-ink"
            placeholder="Tu nombre"
          />
        </Field>
        <Field label="Teléfono">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border-b border-ink/15 bg-transparent py-2 text-sm outline-none focus:border-ink"
            placeholder="+57 300 000 0000"
          />
        </Field>
        <Field label="Correo">
          <p className="py-2 text-sm text-moss">{user?.email}</p>
        </Field>

        <button
          type="submit"
          disabled={save.isPending}
          className="border border-ink px-6 py-3 text-[10px] uppercase tracking-[0.25em] transition hover:bg-ink hover:text-ivory disabled:opacity-50"
        >
          {save.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>

      {user && <TryOnPhotoManager userId={user.id} className="mt-6 max-w-3xl" />}
    </>
  );
}
