import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminCreateUser } from "@/lib/admin/users.functions";
import { CustomerDrawer } from "@/components/crm/customer-drawer";
import { ShopifyCustomersImport } from "@/components/crm/shopify-customers-import";
import type { CrmCustomer } from "@/lib/crm/customers";
import { formatCOP, formatDate } from "@/lib/format";
import { useCrmCustomers, STORE_LABEL, type StoreFilter } from "@/lib/crm/customers";
import {
  DEFAULT_RULES,
  describeRules,
  matchesSegment,
  type CustomerSegment,
  type SegmentRules,
} from "@/lib/crm/segments";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  title?: string;
  eyebrow?: string;
  lockTo?: StoreFilter;
}

export function GlobalCRM({ title = "Clientes", eyebrow = "CRM global", lockTo }: Props) {
  const [section, setSection] = useState<"clientes" | "segmentos">("clientes");
  const [filter, setFilter] = useState<StoreFilter>(lockTo ?? "all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CrmCustomer | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const { customers, isLoading } = useCrmCustomers();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return customers
      .filter((c) => filter === "all" || (filter === "b2b" ? c.isB2B : c.stores.includes(filter)))
      .filter((c) => (term ? [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(term)) : true));
  }, [customers, filter, q]);

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const tabs: { id: StoreFilter; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "ecom_nac", label: "Online Nacional" },
    { id: "ecom_intl", label: "Online Internacional" },
    { id: "cali", label: "POS Eventos" },
    { id: "b2b", label: "B2B" },
  ];

  return (
    <div className="p-10">
      <header className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">{eyebrow}</p>
        <h1 className="text-4xl mt-1">{title}</h1>
        <p className="text-sm text-moss mt-2 max-w-xl">
          {section === "clientes"
            ? "Todas las clientas unificadas por contacto, con canales de compra."
            : "Grupos de clientas guardados para usarlos en campañas de correo."}
        </p>
      </header>

      <div className="flex gap-1 bg-white border border-ink/10 rounded-full p-1 w-fit mb-5">
        {(["clientes", "segmentos"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`text-xs px-5 py-1.5 rounded-full capitalize transition ${
              section === s ? "bg-ink text-ivory" : "text-ink/70 hover:text-ink"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {section === "segmentos" ? (
        <SegmentsPanel />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {!lockTo && (
              <div className="flex gap-1 bg-white border border-ink/10 rounded-full p-1">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setFilter(t.id); setPage(0); }}
                    className={`text-xs px-4 py-1.5 rounded-full transition ${
                      filter === t.id ? "bg-ink text-ivory" : "text-ink/70 hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Buscar por nombre, email o teléfono"
              className="flex-1 min-w-[240px] max-w-md bg-white border border-ink/10 rounded-full px-4 py-2 text-sm outline-none focus:border-ink/30"
            />
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-full bg-ink text-ivory px-5 py-2 text-xs"
            >
              <Plus className="size-3.5" /> Nuevo cliente
            </button>
            {!lockTo && (
              <button
                onClick={() => setImporting(true)}
                className="inline-flex items-center gap-2 rounded-full border border-ink/20 px-5 py-2 text-xs hover:border-ink"
              >
                Importar clientes
              </button>
            )}
            {importing && <ShopifyCustomersImport onClose={() => setImporting(false)} />}
            <span className="text-xs text-moss/70 ml-auto">{rows.length} clientas</span>
          </div>

          <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-moss/70">
                <tr>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left">Contacto</th>
                  <th className="text-left">Canales</th>
                  <th className="text-right">Pedidos</th>
                  <th className="text-right">Total</th>
                  <th className="text-left px-4">Última compra</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => (
                  <tr
                    key={c.key}
                    onClick={() => setSelected(c)}
                    className="border-t border-ink/5 cursor-pointer hover:bg-ink/[0.03]"
                  >
                    <td className="px-4 py-3">{c.name || "—"}</td>
                    <td className="text-xs text-moss">
                      {c.email && <div>{c.email}</div>}
                      {c.phone && <div>{c.phone}</div>}
                      {!c.email && !c.phone && <span className="text-ink/40">—</span>}
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap items-center">
                        {c.isB2B && (
                          <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-moss/15 text-moss">
                            B2B
                          </span>
                        )}
                        {c.stores.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-ink/5 text-ink/70"
                          >
                            {STORE_LABEL[s] ?? s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-right">{c.count}</td>
                    <td className="text-right">{formatCOP(c.total)}</td>
                    <td className="text-xs text-moss px-4">{formatDate(c.last)}</td>
                  </tr>
                ))}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-moss/60">
                      Sin clientas registradas.
                    </td>
                  </tr>
                )}
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-moss/60">
                      Cargando…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {pageCount > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-ink/5 text-xs text-moss">
                <span>
                  Página {safePage + 1} de {pageCount}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, safePage - 1))}
                    disabled={safePage === 0}
                    className="rounded-full border border-ink/15 px-4 py-1.5 disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                    disabled={safePage >= pageCount - 1}
                    className="rounded-full border border-ink/15 px-4 py-1.5 disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {selected && <CustomerDrawer customer={selected} onClose={() => setSelected(null)} />}
      {creating && <NewCustomerModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewCustomerModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const createUser = useServerFn(adminCreateUser);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [address, setAddress] = useState("");
  const [isB2B, setIsB2B] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!email.includes("@")) return toast.error("Escribe un correo válido");
    if (password.length < 8) return toast.error("La contraseña debe tener al menos 8 caracteres");
    setSaving(true);
    try {
      await createUser({
        data: {
          email: email.trim(),
          password,
          fullName: fullName.trim() || undefined,
          phone: phone.trim() || undefined,
          documentId: documentId.trim() || undefined,
          address: address.trim() || undefined,
          isStaff: false,
          roles: isB2B ? (["b2b"] as never) : [],
        },
      });
      toast.success("Cliente creado");
      qc.invalidateQueries({ queryKey: ["crm-profiles"] });
      qc.invalidateQueries({ queryKey: ["crm-emails"] });
      qc.invalidateQueries({ queryKey: ["b2b-user-ids"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear el cliente");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-7">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-moss/70">CRM</div>
            <div className="text-2xl mt-1">Nuevo cliente</div>
          </div>
          <button onClick={onClose} className="size-9 rounded-full hover:bg-ink/5 flex items-center justify-center">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <Field label="Nombre">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Correo">
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Teléfono">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Cédula / documento">
            <input value={documentId} onChange={(e) => setDocumentId(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Dirección">
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Contraseña inicial">
            <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-xs text-moss">
            <input type="checkbox" checked={isB2B} onChange={(e) => setIsB2B(e.target.checked)} />
            Cliente mayorista (B2B)
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="rounded-full border border-ink/15 px-5 py-2 text-xs">Cancelar</button>
          <button onClick={save} disabled={saving} className="rounded-full bg-ink text-ivory px-6 py-2 text-xs disabled:opacity-50">
            {saving ? "Creando…" : "Crear cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SegmentsPanel() {
  const qc = useQueryClient();
  const { customers } = useCrmCustomers();
  const [editing, setEditing] = useState<CustomerSegment | "new" | null>(null);

  const { data: segments = [] } = useQuery({
    queryKey: ["customer-segments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_segments")
        .select("id, name, description, rules, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CustomerSegment[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_segments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Segmento eliminado");
      qc.invalidateQueries({ queryKey: ["customer-segments"] });
    },
  });

  return (
    <div>
      <button
        onClick={() => setEditing("new")}
        className="mb-5 inline-flex items-center gap-2 rounded-full bg-ink text-ivory px-5 py-2 text-xs"
      >
        <Plus className="size-3.5" /> Nuevo segmento
      </button>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {segments.map((s) => {
          const count = customers.filter((c) => matchesSegment(c, s.rules ?? {})).length;
          return (
            <div key={s.id} className="bg-white border border-ink/10 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base">{s.name}</div>
                  {s.description && <div className="text-xs text-moss mt-1">{s.description}</div>}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditing(s)}
                    className="size-8 rounded-full hover:bg-ink/5 flex items-center justify-center text-ink/60"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => remove.mutate(s.id)}
                    className="size-8 rounded-full hover:bg-red-50 flex items-center justify-center text-red-500"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="text-[11px] text-moss/80 mt-3">{describeRules(s.rules ?? {})}</div>
              <div className="mt-4 text-2xl">{count}</div>
              <div className="text-[10px] uppercase tracking-widest text-moss/60">clientas</div>
            </div>
          );
        })}
        {segments.length === 0 && (
          <div className="text-sm text-moss/60">Aún no hay segmentos guardados.</div>
        )}
      </div>

      {editing && (
        <SegmentModal
          segment={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SegmentModal({ segment, onClose }: { segment: CustomerSegment | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { customers } = useCrmCustomers();
  const [name, setName] = useState(segment?.name ?? "");
  const [description, setDescription] = useState(segment?.description ?? "");
  const [rules, setRules] = useState<SegmentRules>(segment?.rules ?? DEFAULT_RULES);
  const [saving, setSaving] = useState(false);

  const preview = customers.filter((c) => matchesSegment(c, rules));

  const save = async () => {
    if (!name.trim()) {
      toast.error("Ponle un nombre al segmento");
      return;
    }
    setSaving(true);
    const payload = { name: name.trim(), description: description.trim() || null, rules: rules as never };
    const { error } = segment
      ? await supabase.from("customer_segments").update(payload).eq("id", segment.id)
      : await supabase.from("customer_segments").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Segmento guardado");
    qc.invalidateQueries({ queryKey: ["customer-segments"] });
    onClose();
  };

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-moss/70">Segmento</div>
            <div className="text-2xl mt-1">{segment ? "Editar segmento" : "Nuevo segmento"}</div>
          </div>
          <button onClick={onClose} className="size-9 rounded-full hover:bg-ink/5 flex items-center justify-center">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <Field label="Nombre">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Clientas VIP" />
          </Field>
          <Field label="Descripción">
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mínimo de pedidos">
              <input
                type="number"
                value={rules.min_orders ?? ""}
                onChange={(e) => setRules({ ...rules, min_orders: num(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label="Gasto mínimo (COP)">
              <input
                type="number"
                value={rules.min_spend ?? ""}
                onChange={(e) => setRules({ ...rules, min_spend: num(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label="Compras históricas mín. (Online Nacional)">
              <input
                type="number"
                value={rules.min_shopify_orders ?? ""}
                onChange={(e) => setRules({ ...rules, min_shopify_orders: num(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label="Gasto histórico mín. Online Nacional (COP)">
              <input
                type="number"
                value={rules.min_shopify_spend ?? ""}
                onChange={(e) => setRules({ ...rules, min_shopify_spend: num(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label="Compró en los últimos (días)">
              <input
                type="number"
                value={rules.last_purchase_days ?? ""}
                onChange={(e) => setRules({ ...rules, last_purchase_days: num(e.target.value) })}
                className={inputCls}
              />
            </Field>
            <Field label="Sin comprar hace (días)">
              <input
                type="number"
                value={rules.inactive_days ?? ""}
                onChange={(e) => setRules({ ...rules, inactive_days: num(e.target.value) })}
                className={inputCls}
              />
            </Field>
          </div>
          <Field label="Ciudad">
            <input
              value={rules.city ?? ""}
              onChange={(e) => setRules({ ...rules, city: e.target.value || null })}
              className={inputCls}
              placeholder="Cali, Bogotá…"
            />
          </Field>
          <Field label="Canal">
            <select
              value={rules.store ?? "all"}
              onChange={(e) => setRules({ ...rules, store: e.target.value })}
              className={inputCls}
            >
              <option value="all">Todos</option>
              {Object.entries(STORE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-xs text-moss">
            <input
              type="checkbox"
              checked={rules.with_email ?? false}
              onChange={(e) => setRules({ ...rules, with_email: e.target.checked })}
            />
            Solo clientas con correo (necesario para campañas)
          </label>

          <div className="rounded-2xl bg-ink/5 px-4 py-3 text-xs text-moss">
            Este segmento incluye <span className="text-ink">{preview.length}</span> clientas ahora mismo.
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="rounded-full border border-ink/15 px-5 py-2 text-xs">Cancelar</button>
          <button onClick={save} disabled={saving} className="rounded-full bg-ink text-ivory px-6 py-2 text-xs disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-ink/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-ink/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-moss/70 mb-1.5">{label}</div>
      {children}
    </div>
  );
}
