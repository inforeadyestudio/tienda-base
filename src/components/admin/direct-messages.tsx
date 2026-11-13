import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCrmCustomers } from "@/lib/crm/customers";
import { useSentDirectMessages } from "@/lib/crm/messages";
import { formatDate } from "@/lib/format";
import { Send, Search, Trash2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full bg-white border border-ink/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-ink/40";

type Audience = "all" | "orders" | "picked";

export function DirectMessages() {
  const qc = useQueryClient();
  const { customers } = useCrmCustomers();
  const { data: sent = [] } = useSentDirectMessages();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [campaign, setCampaign] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [minOrders, setMinOrders] = useState(1);
  const [maxOrders, setMaxOrders] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Solo se permiten imágenes");
    if (file.size > 10 * 1024 * 1024) return toast.error("La imagen debe pesar menos de 10 MB");
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("message-media").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });
    if (error) {
      setUploading(false);
      return toast.error(error.message);
    }
    const { data, error: signErr } = await supabase.storage
      .from("message-media")
      .createSignedUrl(path, 60 * 60 * 24 * 3650);
    setUploading(false);
    if (signErr || !data?.signedUrl) return toast.error(signErr?.message ?? "No se pudo publicar la imagen");
    setImageUrl(data.signedUrl);
    toast.success("Imagen lista");
  };

  // Only registered customers (with account) can receive an inbox message.
  const registered = useMemo(() => customers.filter((c) => c.userId), [customers]);

  const recipients = useMemo(() => {
    if (audience === "picked") return registered.filter((c) => picked.includes(c.userId!));
    if (audience === "orders")
      return registered.filter(
        (c) => c.count >= minOrders && (maxOrders === "" || c.count <= Number(maxOrders)),
      );
    return registered;
  }, [audience, registered, picked, minOrders, maxOrders]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return registered;
    return registered.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q),
    );
  }, [registered, search]);

  const send = async () => {
    if (!title.trim()) return toast.error("Falta el título del mensaje");
    if (recipients.length === 0) return toast.error("No hay clientas seleccionadas");
    setSaving(true);
    const batchId = crypto.randomUUID();
    const { data: auth } = await supabase.auth.getUser();
    const rows = recipients.map((c) => ({
      user_id: c.userId!,
      title: title.trim(),
      body: body.trim(),
      cta_label: ctaLabel.trim() || null,
      image_url: imageUrl,
      cta_url: ctaUrl.trim() || null,
      campaign_name: campaign.trim() || null,
      batch_id: batchId,
      created_by: auth.user?.id ?? null,
    }));
    const { error } = await supabase.from("customer_messages").insert(rows);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Mensaje enviado a ${rows.length} clientas`);
    setTitle("");
    setBody("");
    setCtaLabel("");
    setCtaUrl("");
    setCampaign("");
    setImageUrl(null);
    setPicked([]);
    qc.invalidateQueries({ queryKey: ["direct-messages-admin"] });
  };

  const batches = useMemo(() => {
    const map = new Map<
      string,
      { title: string; campaign: string | null; created_at: string; total: number; read: number }
    >();
    for (const m of sent) {
      const key = m.batch_id ?? m.id;
      const cur =
        map.get(key) ??
        { title: m.title, campaign: m.campaign_name, created_at: m.created_at, total: 0, read: 0 };
      cur.total += 1;
      if (m.read_at) cur.read += 1;
      map.set(key, cur);
    }
    return [...map.entries()].map(([id, v]) => ({ id, ...v }));
  }, [sent]);

  const removeBatch = async (batchId: string) => {
    const { error } = await supabase.from("customer_messages").delete().eq("batch_id", batchId);
    if (error) return toast.error(error.message);
    toast.success("Mensaje eliminado de los inbox");
    qc.invalidateQueries({ queryKey: ["direct-messages-admin"] });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="bg-white border border-ink/10 rounded-2xl p-6">
        <div className="text-[10px] uppercase tracking-widest text-moss/70">Nuevo mensaje</div>
        <div className="grid gap-4 mt-4 text-sm">
          <Field label="Título">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Mensaje">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className={inputCls + " resize-y"}
            />
          </Field>
          <Field label="Imagen (opcional)">
            {imageUrl ? (
              <div className="relative w-full max-w-xs">
                <img src={imageUrl} alt="Adjunto" className="w-full rounded-xl border border-ink/10 object-cover" />
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="absolute right-2 top-2 size-7 rounded-full bg-white/90 border border-ink/10 inline-flex items-center justify-center"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-ink/20 px-4 py-3 text-xs text-moss">
                <ImagePlus className="size-4" />
                {uploading ? "Subiendo…" : "Subir foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void uploadImage(f);
                  }}
                />
              </label>
            )}
          </Field>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Texto del botón (opcional)">
              <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Enlace del botón (opcional)">
              <input
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                className={inputCls}
                placeholder="/tienda o https://"
              />
            </Field>
          </div>
          <Field label="Etiqueta de campaña (opcional)">
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="mt-6 text-[10px] uppercase tracking-widest text-moss/70">Destinatarias</div>
        <div className="flex flex-wrap gap-1 mt-2">
          {([
            ["all", "Todas las registradas"],
            ["orders", "Por número de pedidos"],
            ["picked", "Clientas específicas"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAudience(id)}
              className={`text-xs px-4 py-1.5 rounded-full border transition ${
                audience === id ? "bg-ink text-ivory border-ink" : "border-ink/15 text-ink/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {audience === "orders" && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Pedidos mínimos">
              <input
                type="number"
                min={0}
                value={minOrders}
                onChange={(e) => setMinOrders(Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field label="Pedidos máximos (opcional)">
              <input
                type="number"
                min={0}
                value={maxOrders}
                onChange={(e) => setMaxOrders(e.target.value === "" ? "" : Number(e.target.value))}
                className={inputCls}
              />
            </Field>
          </div>
        )}

        {audience === "picked" && (
          <div className="mt-4">
            <div className="relative">
              <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-moss/60" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o correo"
                className={inputCls + " pl-9"}
              />
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-ink/10 divide-y divide-ink/5">
              {filteredList.map((c) => (
                <label key={c.userId} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={picked.includes(c.userId!)}
                    onChange={(e) =>
                      setPicked((prev) =>
                        e.target.checked ? [...prev, c.userId!] : prev.filter((id) => id !== c.userId),
                      )
                    }
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate">{c.name}</span>
                    <span className="block text-xs text-moss truncate">{c.email ?? "Sin correo"}</span>
                  </span>
                  <span className="text-xs text-moss">{c.count} pedidos</span>
                </label>
              ))}
              {filteredList.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-moss/60">Sin resultados</div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 rounded-2xl bg-ink/5 px-4 py-3 text-xs text-moss">
          Llegará al inbox de <span className="text-ink">{recipients.length}</span> clientas con cuenta.
        </div>

        <div className="flex justify-end mt-5">
          <button
            onClick={send}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-ink text-ivory px-6 py-2 text-xs disabled:opacity-50"
          >
            <Send className="size-3.5" /> Enviar al inbox
          </button>
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl p-6">
        <div className="text-[10px] uppercase tracking-widest text-moss/70">Enviados</div>
        <ul className="mt-4 space-y-3">
          {batches.map((b) => (
            <li key={b.id} className="rounded-xl border border-ink/10 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">{b.title}</div>
                  <div className="text-xs text-moss mt-0.5">
                    {b.campaign ? `${b.campaign} · ` : ""}
                    {b.total} destinatarias · {b.read} leídos
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-moss/60 mt-1">
                    {formatDate(b.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => removeBatch(b.id)}
                  className="size-8 shrink-0 rounded-full hover:bg-red-50 text-red-500 inline-flex items-center justify-center"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
          {batches.length === 0 && (
            <li className="text-xs text-moss/60 py-6 text-center">Todavía no has enviado mensajes.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-moss/70 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
