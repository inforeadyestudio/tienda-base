import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Search, X, ShieldCheck, KeyRound, Save, UserPlus, Lock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { adminCreateUser, adminSetPassword, adminListEmails, adminUpdateUser } from "@/lib/admin/users.functions";
import { useIsAdmin } from "@/lib/auth-hooks";
import { ActivityLog } from "@/components/admin/activity-log";
import { BoldTerminalsSettings } from "@/components/admin/bold-terminals-settings";
import { Constants } from "@/integrations/supabase/types";
import { OrphanPaymentsBanner } from "@/components/admin/orphan-payments-banner";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/admin/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración · Tu Marca Sales Hub" },
      { name: "description", content: "Gestión de usuarios, roles y accesos del Sales Hub." },
    ],
  }),
  component: ConfiguracionPage,
});

type AppRole = Database["public"]["Enums"]["app_role"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];

const ROLE_LABELS: Record<AppRole, string> = {
  superadmin: "Administrador master",
  admin_ecommerce: "Admin tienda online",
  admin_inventario: "Admin inventario",
  staff_cali: "Cajero / Admin POS Eventos",
  staff_bogota: "Cajero / Admin POS Bogotá (antiguo)",
  mercadeo: "Mercadeo",
  servicio: "Servicio al cliente",
  contabilidad: "Contabilidad",
  bodega: "Jefe de bodega",
  jefe_tiendas: "Jefe de tiendas",
  b2b: "Cliente B2B",
};

// Solo roles del equipo Tu Marca; los clientes B2B se gestionan en Accesos B2B.
const ALL_ROLES: readonly AppRole[] = Constants.public.Enums.app_role.filter((r) => r !== "b2b");

function ConfiguracionPage() {
  const [section, setSection] = useState<"usuarios" | "actividad" | "datafonos" | "auditoria">("usuarios");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const listEmails = useServerFn(adminListEmails);
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();

  const { data: emails } = useQuery({
    queryKey: ["admin-user-emails"],
    queryFn: () => listEmails(),
    retry: false,
  });

  const emailById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of emails ?? []) if (u.email) map.set(u.id, u.email);
    return map;
  }, [emails]);


  const { data: roles } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data as UserRoleRow[];
    },
  });

  // Solo el equipo interno: is_staff o con algún rol distinto de b2b. Clientes quedan en Clientes.
  const { data: profiles, isLoading } = useQuery({
    queryKey: ["admin-profiles", "team", (roles ?? []).length],
    enabled: !!roles,
    queryFn: async () => {
      const teamIds = [...new Set((roles ?? []).filter((r) => r.role !== "b2b").map((r) => r.user_id))];
      const [a, b] = await Promise.all([
        supabase.from("profiles").select("*").eq("is_staff", true),
        teamIds.length ? supabase.from("profiles").select("*").in("id", teamIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (a.error) throw a.error;
      if (b.error) throw b.error;
      const map = new Map<string, Profile>();
      for (const p of [...(a.data ?? []), ...((b.data ?? []) as Profile[])]) map.set(p.id, p as Profile);
      return [...map.values()].sort((x, y) => (y.created_at ?? "").localeCompare(x.created_at ?? ""));
    },
  });

  const rolesByUser = useMemo(() => {
    const map = new Map<string, AppRole[]>();
    for (const r of roles ?? []) {
      const list = map.get(r.user_id) ?? [];
      list.push(r.role);
      map.set(r.user_id, list);
    }
    return map;
  }, [roles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return profiles ?? [];
    return (profiles ?? []).filter(
      (p) =>
        (p.full_name ?? "").toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (emailById.get(p.id) ?? "").toLowerCase().includes(q),
    );
  }, [profiles, query, emailById]);

  if (adminLoading) {
    return <div className="p-10 text-sm text-ink/50">Cargando…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-6 lg:p-10 max-w-2xl">
        <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Configuración</div>
        <h1 className="font-serif text-3xl text-ink mt-1">Acceso restringido</h1>
        <p className="text-sm text-ink/60 mt-3">
          Solo los administradores pueden gestionar usuarios y roles. Pide acceso a un superadmin.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Configuración</div>
          <h1 className="font-serif text-3xl lg:text-4xl text-ink mt-1">
            {section === "usuarios" ? "Usuarios y roles" : section === "datafonos" ? "Datáfonos Bold" : section === "auditoria" ? "Auditoría" : "Registro de actividad"}
          </h1>
          <p className="text-sm text-ink/60 mt-2">
            {section === "usuarios"
              ? "Solo el equipo Tu Marca: quién entra al Sales Hub y al POS, con qué rol y su PIN. Los clientes se gestionan en Clientes."
              : section === "datafonos" ? "Cada caja del POS envía el cobro directo a su datáfono Bold." : section === "auditoria" ? "Cobros que la pasarela confirmó pero que no generaron pedido en la tienda." : "Todo lo que pasa en inventario, traslados y ediciones queda guardado aquí."}
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white p-1">
          {(["usuarios", "actividad", "datafonos", "auditoria"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`px-4 py-2 rounded-full text-[11px] uppercase tracking-[0.15em] transition-colors ${
                section === s ? "bg-ink text-ivory" : "text-ink/55 hover:text-ink"
              }`}
            >
              {s === "usuarios" ? "Usuarios" : s === "datafonos" ? "Datáfonos" : s === "auditoria" ? "Auditoría" : "Actividad"}
            </button>
          ))}
        </div>
      </div>

      {section === "auditoria" ? (
        <div className="mt-8"><OrphanPaymentsBanner showEmpty /></div>
      ) : section === "datafonos" ? (
        <div className="mt-8"><BoldTerminalsSettings /></div>
      ) : section === "actividad" ? (
        <div className="mt-8">
          <ActivityLog />
        </div>
      ) : (
      <>
      <div className="mt-8 flex items-center justify-end gap-3">
          <div className="relative">
            <Search className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o email…"
              className="pl-10 pr-4 py-2.5 rounded-full border border-ink/15 bg-white text-sm w-64 outline-none focus:border-ink"
            />
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-ink text-ivory text-[11px] uppercase tracking-[0.18em] px-5 py-3 rounded-full hover:opacity-90"
          >
            <UserPlus className="size-4" /> Nuevo usuario
          </button>
      </div>


      <div className="mt-8 rounded-3xl border border-ink/10 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-ink/40 border-b border-ink/10">
              <th className="px-6 py-4 font-medium">Usuario</th>
              <th className="px-4 py-4 font-medium">Roles</th>
              <th className="px-4 py-4 font-medium">Staff</th>
              <th className="px-4 py-4 font-medium">PIN POS</th>
              <th className="px-6 py-4" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-ink/40">Cargando usuarios…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-ink/40">Sin resultados.</td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-ivory/60">
                <td className="px-6 py-4">
                  <div className="font-medium text-ink">{p.full_name || "Sin nombre"}</div>
                  <div className="text-xs text-ink/45">{emailById.get(p.id) ?? `${p.id.slice(0, 8)}…`}</div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {(rolesByUser.get(p.id) ?? []).length === 0 ? (
                      <span className="text-xs text-ink/35">Sin roles</span>
                    ) : (
                      (rolesByUser.get(p.id) ?? []).map((r) => (
                        <span key={r} className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-cream text-ink/70">
                          {ROLE_LABELS[r] ?? r}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  {p.is_staff ? (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-ink text-ivory">Staff</span>
                  ) : (
                    <span className="text-xs text-ink/35">Cliente</span>
                  )}
                </td>
                <td className="px-4 py-4 text-ink/60">{p.pos_pin ? "••••" : "—"}</td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => setEditing(p)}
                    className="text-xs px-4 py-2 rounded-full border border-ink/15 hover:bg-ink hover:text-ivory transition-colors"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <EditUserModal profile={editing} roles={rolesByUser.get(editing.id) ?? []} onClose={() => setEditing(null)} />}
      {creating && <CreateUserModal onClose={() => setCreating(false)} />}
      </>
      )}
    </div>
  );
}

type UserKind = "staff" | "b2b" | "cliente";

const KINDS: { id: UserKind; label: string; hint: string }[] = [];

function randomPassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const createUser = useServerFn(adminCreateUser);
  const [kind, setKind] = useState<UserKind>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [posPin, setPosPin] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);

  const chooseKind = (k: UserKind) => {
    setKind(k);
    setSelectedRoles(k === "b2b" ? ["b2b"] : []);
    if (k !== "staff") setPosPin("");
  };

  const toggleRole = (r: AppRole) =>
    setSelectedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const create = useMutation({
    mutationFn: async () =>
      createUser({
        data: {
          email,
          password,
          fullName: fullName || undefined,
          phone: phone || undefined,
          isStaff: kind === "staff",
          posPin: kind === "staff" ? posPin || undefined : undefined,
          roles: selectedRoles,
        },
      }),
    onSuccess: async () => {
      toast.success("Usuario creado");
      await qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      await qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      await qc.invalidateQueries({ queryKey: ["admin-user-emails"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo crear el usuario"),
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Configuración</div>
            <div className="font-serif text-2xl text-ink mt-1">Nuevo usuario</div>
          </div>
          <button onClick={onClose} className="size-9 rounded-full flex items-center justify-center text-ink/60 hover:bg-ink/5" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <div className="hidden">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => chooseKind(k.id)}
              className={
                "text-left rounded-2xl border px-3 py-3 transition-colors " +
                (kind === k.id ? "border-ink bg-ivory" : "border-ink/15 hover:border-ink/40")
              }
            >
              <div className="text-xs font-medium text-ink">{k.label}</div>
              <div className="text-[10px] text-ink/45 mt-0.5 leading-tight">{k.hint}</div>
            </button>
          ))}
        </div>

        <div className="space-y-4 mt-5">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="off"
              className="mt-1 w-full border border-ink/15 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-ink bg-transparent" />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.15em] text-ink/50 flex items-center gap-1.5">
              <Lock className="size-3" /> Contraseña (mín. 8 caracteres)
            </span>
            <div className="mt-1 flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                className="flex-1 border border-ink/15 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-ink bg-transparent" />
              <button onClick={() => setPassword(randomPassword())}
                className="text-[10px] uppercase tracking-[0.15em] px-4 rounded-xl border border-ink/15 hover:bg-ink hover:text-ivory transition-colors">
                Generar
              </button>
            </div>
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Nombre completo</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full border border-ink/15 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-ink bg-transparent" />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Teléfono</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full border border-ink/15 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-ink bg-transparent" />
          </label>

          {kind === "staff" && (
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.15em] text-ink/50 flex items-center gap-1.5">
                <KeyRound className="size-3" /> PIN de POS (4 dígitos)
              </span>
              <input value={posPin} onChange={(e) => setPosPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric" placeholder="••••"
                className="mt-1 w-full border border-ink/15 rounded-xl px-4 py-2.5 text-sm tracking-[0.5em] outline-none focus:border-ink bg-transparent" />
            </label>
          )}

          {kind !== "cliente" && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-ink/50 mb-2">Roles</div>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map((r) => {
                  const active = selectedRoles.includes(r);
                  return (
                    <button key={r} onClick={() => toggleRole(r)}
                      className={
                        "text-xs px-3 py-2 rounded-full border transition-colors " +
                        (active ? "bg-ink text-ivory border-ink" : "border-ink/15 text-ink/70 hover:border-ink")
                      }>
                      {ROLE_LABELS[r] ?? r}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-ink text-ivory text-[11px] uppercase tracking-[0.2em] py-3.5 rounded-full hover:opacity-90 disabled:opacity-50"
        >
          <UserPlus className="size-4" /> {create.isPending ? "Creando…" : "Crear usuario"}
        </button>
        <p className="text-[11px] text-ink/45 mt-3 text-center">
          El usuario queda confirmado y puede iniciar sesión de inmediato con esta contraseña.
        </p>
      </div>
    </div>
  );
}

function EditUserModal({ profile, roles, onClose }: { profile: Profile; roles: AppRole[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [posPin, setPosPin] = useState(profile.pos_pin ?? "");
  const [isStaff, setIsStaff] = useState(profile.is_staff);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>(roles);

  const toggleRole = (r: AppRole) =>
    setSelectedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const updateUser = useServerFn(adminUpdateUser);

  const save = useMutation({
    mutationFn: async () =>
      updateUser({
        data: {
          userId: profile.id,
          fullName: fullName || null,
          phone: phone || null,
          posPin: posPin || null,
          isStaff,
          roles: selectedRoles,
        },
      }),
    onSuccess: async () => {
      toast.success("Usuario actualizado");
      await qc.invalidateQueries({ queryKey: ["admin-profiles"] });
      await qc.invalidateQueries({ queryKey: ["admin-user-roles"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo guardar"),
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Editar usuario</div>
            <div className="font-serif text-2xl text-ink mt-1">{profile.full_name || "Sin nombre"}</div>
          </div>
          <button onClick={onClose} className="size-9 rounded-full flex items-center justify-center text-ink/60 hover:bg-ink/5" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Nombre completo</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full border border-ink/15 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-ink bg-transparent" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Teléfono</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full border border-ink/15 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-ink bg-transparent" />
          </label>

          <div className="flex items-center justify-between rounded-2xl border border-ink/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-ink/60" />
              <div>
                <div className="text-sm text-ink">Acceso staff</div>
                <div className="text-xs text-ink/50">Puede entrar al Sales Hub y POS.</div>
              </div>
            </div>
            <button
              onClick={() => setIsStaff(!isStaff)}
              className={"w-11 h-6 rounded-full transition-colors relative " + (isStaff ? "bg-ink" : "bg-ink/15")}
              aria-pressed={isStaff}
            >
              <span className={"absolute top-0.5 size-5 rounded-full bg-white transition-all " + (isStaff ? "left-[22px]" : "left-0.5")} />
            </button>
          </div>

          {isStaff && (
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.15em] text-ink/50 flex items-center gap-1.5">
                <KeyRound className="size-3" /> PIN de POS (4 dígitos)
              </span>
              <input
                value={posPin}
                onChange={(e) => setPosPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                placeholder="••••"
                className="mt-1 w-full border border-ink/15 rounded-xl px-4 py-2.5 text-sm tracking-[0.5em] outline-none focus:border-ink bg-transparent"
              />
            </label>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-ink/50 mb-2">Roles</div>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map((r) => {
                const active = selectedRoles.includes(r);
                return (
                  <button
                    key={r}
                    onClick={() => toggleRole(r)}
                    className={
                      "text-xs px-3 py-2 rounded-full border transition-colors " +
                      (active ? "bg-ink text-ivory border-ink" : "border-ink/15 text-ink/70 hover:border-ink")
                    }
                  >
                    {ROLE_LABELS[r] ?? r}
                  </button>
                );
              })}
            </div>
          </div>

          <PasswordResetBlock userId={profile.id} />
        </div>

        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-ink text-ivory text-[11px] uppercase tracking-[0.2em] py-3.5 rounded-full hover:opacity-90 disabled:opacity-50"
        >
          <Save className="size-4" /> {save.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

function PasswordResetBlock({ userId }: { userId: string }) {
  const setPasswordFn = useServerFn(adminSetPassword);
  const [password, setPassword] = useState("");

  const reset = useMutation({
    mutationFn: async () => setPasswordFn({ data: { userId, password } }),
    onSuccess: () => {
      toast.success("Contraseña actualizada");
      setPassword("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar la contraseña"),
  });

  return (
    <div className="rounded-2xl border border-ink/10 p-4">
      <div className="text-[10px] uppercase tracking-[0.15em] text-ink/50 flex items-center gap-1.5">
        <Lock className="size-3" /> Contraseña
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="Nueva contraseña (mín. 8)"
          className="flex-1 border border-ink/15 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-ink bg-transparent"
        />
        <button
          onClick={() => setPassword(randomPassword())}
          className="text-[10px] uppercase tracking-[0.15em] px-4 rounded-xl border border-ink/15 hover:bg-ink hover:text-ivory transition-colors"
        >
          Generar
        </button>
      </div>
      <button
        onClick={() => reset.mutate()}
        disabled={reset.isPending || password.length < 8}
        className="mt-3 w-full text-[11px] uppercase tracking-[0.18em] py-2.5 rounded-full border border-ink/15 hover:bg-ink hover:text-ivory transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink"
      >
        {reset.isPending ? "Actualizando…" : "Asignar contraseña"}
      </button>
    </div>
  );
}
