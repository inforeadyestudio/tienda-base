import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Image as ImageIcon, Loader2, Minus, MousePointerClick, Plus, Send, ShoppingBag, Trash2, Type, X, Heading1, MoveVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { renderCampaignHtml, type CampaignBlock, type CampaignProduct } from "@/lib/email/campaign-render";
import { sendCampaignChunk, sendCampaignTest } from "@/lib/email/campaigns.functions";
import type { CustomerSegment } from "@/lib/crm/segments";
import { describeRules } from "@/lib/crm/segments";
import { campaignAudience } from "@/lib/email/campaign-audience";
import { Button } from "@/components/ui/button";
import { SITE_ORIGIN } from "@/lib/site";

export interface CampaignRow {
  id: string; name: string; subject: string; preheader: string | null; segment_id: string | null;
  status: string; recipients_count: number; sent_count: number; failed_count: number;
  blocks: CampaignBlock[]; sent_at: string | null; created_at: string;
}

const inputCls = "w-full bg-white border border-ink/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-ink/40";
const uid = () => Math.random().toString(36).slice(2, 10);

const NEW_BLOCKS: { type: CampaignBlock["type"]; label: string; icon: typeof Type }[] = [
  { type: "heading", label: "Título", icon: Heading1 },
  { type: "text", label: "Texto", icon: Type },
  { type: "image", label: "Imagen o GIF", icon: ImageIcon },
  { type: "products", label: "Productos", icon: ShoppingBag },
  { type: "button", label: "Botón", icon: MousePointerClick },
  { type: "divider", label: "Línea", icon: Minus },
  { type: "spacer", label: "Espacio", icon: MoveVertical },
];

function makeBlock(type: CampaignBlock["type"]): CampaignBlock {
  const id = uid();
  switch (type) {
    case "heading": return { id, type, text: "Nueva colección", align: "center" };
    case "text": return { id, type, text: "Escribe aquí tu mensaje.", align: "center" };
    case "image": return { id, type, url: "", href: "" };
    case "button": return { id, type, label: "Comprar ahora", url: SITE_ORIGIN };
    case "products": return { id, type, title: "Te va a encantar", columns: 2, items: [] };
    case "divider": return { id, type };
    case "spacer": return { id, type };
  }
}

export function CampaignBuilder({ campaign, segments, audienceFor, onClose }: {
  campaign: CampaignRow | null;
  segments: CustomerSegment[];
  audienceFor: (segmentId: string | null) => { email: string | null; name?: string | null }[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(campaign?.id ?? null);
  const [name, setName] = useState(campaign?.name ?? "");
  const [subject, setSubject] = useState(campaign?.subject ?? "");
  const [preheader, setPreheader] = useState(campaign?.preheader ?? "");
  const [segmentId, setSegmentId] = useState<string | null>(campaign?.segment_id ?? null);
  const [blocks, setBlocks] = useState<CampaignBlock[]>(campaign?.blocks?.length ? campaign.blocks : [makeBlock("image"), makeBlock("heading"), makeBlock("text"), makeBlock("products"), makeBlock("button")]);
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const testFn = useServerFn(sendCampaignTest);
  const chunkFn = useServerFn(sendCampaignChunk);

  const recipients = campaignAudience(audienceFor(segmentId));
  const locked = campaign?.status === "sent" || campaign?.status === "sending";
  const html = useMemo(() => renderCampaignHtml({ campaignId: id ?? "vista-previa", preheader, blocks, unsubscribeUrl: "#", name: "María" }), [id, preheader, blocks]);

  const update = (bid: string, patch: Partial<CampaignBlock>) => setBlocks((bs) => bs.map((b) => (b.id === bid ? ({ ...b, ...patch } as CampaignBlock) : b)));
  const move = (i: number, d: -1 | 1) => setBlocks((bs) => { const n = [...bs]; const j = i + d; if (j < 0 || j >= n.length) return bs; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const save = async (): Promise<string | null> => {
    if (!name.trim() || !subject.trim()) { toast.error("Falta el nombre o el asunto"); return null; }
    const payload = { name: name.trim(), subject: subject.trim(), preheader: preheader.trim() || null, segment_id: segmentId, blocks: blocks as any, body: "", recipients_count: recipients.length };
    if (id) {
      const { error } = await supabase.from("email_campaigns").update(payload as any).eq("id", id);
      if (error) { toast.error(error.message); return null; }
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      return id;
    }
    const { data, error } = await supabase.from("email_campaigns").insert({ ...payload, status: "draft" } as any).select("id").single();
    if (error || !data) { toast.error(error?.message ?? "No se pudo guardar"); return null; }
    setId(data.id);
    qc.invalidateQueries({ queryKey: ["email-campaigns"] });
    return data.id;
  };

  const sendTest = async () => {
    if (!/^\S+@\S+\.\S+$/.test(testTo)) return toast.error("Escribe un correo para la prueba");
    setBusy("test");
    try {
      const cid = await save(); if (!cid) return;
      await testFn({ data: { campaignId: cid, to: testTo.trim() } });
      toast.success(`Prueba enviada a ${testTo}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo enviar la prueba"); }
    finally { setBusy(null); }
  };

  const sendAll = async () => {
    if (!recipients.length) return toast.error("Este segmento no tiene clientas con correo");
    if (!confirm(`¿Enviar «${subject}» a ${recipients.length} clientas? Esta acción no se puede deshacer.`)) return;
    setBusy("send");
    try {
      const cid = locked ? id : await save(); if (!cid) return;
      const { error } = await supabase.from("email_campaigns").update({ status: "sending" } as any).eq("id", cid);
      if (error) throw error;
      const list = recipients;
      let sent = 0, failed = 0;
      setProgress({ done: 0, total: list.length });
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        const r = await chunkFn({ data: { campaignId: cid, recipients: chunk, last: i + 100 >= list.length } });
        sent += r.sent; failed += r.failed;
        setProgress({ done: Math.min(i + 100, list.length), total: list.length });
        await new Promise((res) => setTimeout(res, 600));
      }
      toast.success(`Campaña enviada a ${sent} clientas${failed ? ` · ${failed} con error` : ""}`);
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "El envío se detuvo. Puedes reintentar: no se repite a quien ya lo recibió."); }
    finally {
      setBusy(null); setProgress(null);
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign-recipients", id] });
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={busy ? undefined : onClose} />
      <div className="relative flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-7 py-4">
          <div><div className="text-[10px] uppercase tracking-widest text-moss/70">Campaña</div><div className="text-xl">{name || "Nueva campaña"}</div></div>
          <button onClick={onClose} disabled={!!busy} className="flex size-9 items-center justify-center rounded-full hover:bg-ink/5"><X className="size-4" /></button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-h-0 space-y-4 overflow-y-auto p-6">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nombre interno"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} disabled={locked} /></Field>
              <Field label="Segmento">
                <select value={segmentId ?? ""} onChange={(e) => setSegmentId(e.target.value || null)} className={inputCls} disabled={locked}>
                  <option value="">Todas las clientas con correo</option>
                  {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              <div className="md:col-span-2"><Field label="Asunto"><input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} disabled={locked} /></Field><p className="mt-1 text-[11px] text-moss/70">Escribe {"{{nombre}}"} en el asunto, títulos, textos o botones para poner el nombre de cada clienta (ej. «Hola {"{{nombre}}"}, llegó el Sale»). Si no tiene nombre, se omite.</p></div>
              <div className="md:col-span-2"><Field label="Texto previo (se ve junto al asunto en la bandeja)"><input value={preheader} onChange={(e) => setPreheader(e.target.value)} className={inputCls} disabled={locked} /></Field></div>
            </div>

            <div className="text-[10px] uppercase tracking-widest text-moss/70">Diseño del correo</div>
            {blocks.map((b, i) => (
              <div key={b.id} className="rounded-2xl border border-ink/10 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs text-moss">{NEW_BLOCKS.find((n) => n.type === b.type)?.label}</span>
                  {!locked && <div className="flex gap-1">
                    <IconBtn onClick={() => move(i, -1)}><ArrowUp className="size-3.5" /></IconBtn>
                    <IconBtn onClick={() => move(i, 1)}><ArrowDown className="size-3.5" /></IconBtn>
                    <IconBtn onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))}><Trash2 className="size-3.5 text-destructive" /></IconBtn>
                  </div>}
                </div>
                <BlockEditor block={b} onChange={(p) => update(b.id, p)} disabled={locked} />
              </div>
            ))}
            {!locked && <div className="flex flex-wrap gap-2">
              {NEW_BLOCKS.map((n) => (
                <button key={n.type} onClick={() => setBlocks((bs) => [...bs, makeBlock(n.type)])} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs hover:border-ink/40">
                  <Plus className="size-3" /><n.icon className="size-3.5" /> {n.label}
                </button>
              ))}
            </div>}
          </div>
          <div className="min-h-0 border-l border-ink/10 bg-ink/[0.03] p-6">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-moss/70">Vista previa</div>
            <iframe title="Vista previa" srcDoc={html} className="h-[calc(100%-1.5rem)] w-full rounded-xl border border-ink/10 bg-white" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-ink/10 px-7 py-4">
          <div className="mr-auto text-xs text-moss">
            {segmentId && <span className="mr-2">{describeRules(segments.find((s) => s.id === segmentId)?.rules ?? {})} ·</span>}
            Llegará a <span className="text-ink">{recipients.length}</span> clientas (sin contar quienes se dieron de baja).
            {progress && <span className="ml-2 text-ink">Enviando {progress.done}/{progress.total}…</span>}
          </div>
          {!locked && <>
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="correo para prueba" className="h-9 w-52 rounded-full border border-ink/15 px-3 text-xs" />
            <button onClick={sendTest} disabled={!!busy} className="h-9 rounded-full border border-ink/15 px-4 text-xs disabled:opacity-50">{busy === "test" ? <Loader2 className="size-3.5 animate-spin" /> : "Enviar prueba"}</button>
            <button onClick={async () => { if (await save()) toast.success("Borrador guardado"); }} disabled={!!busy} className="h-9 rounded-full border border-ink/15 px-4 text-xs disabled:opacity-50">Guardar borrador</button>
            <button onClick={sendAll} disabled={!!busy} className="inline-flex h-9 items-center gap-2 rounded-full bg-ink px-5 text-xs text-ivory disabled:opacity-50">
              {busy === "send" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Enviar campaña
            </button>
          </>}
          {campaign?.status === "sending" && (
            <Button onClick={sendAll} disabled={!!busy || !recipients.length} size="sm">
              {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />}
              Reanudar envío
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockEditor({ block: b, onChange, disabled }: { block: CampaignBlock; onChange: (p: Partial<CampaignBlock>) => void; disabled: boolean }) {
  const [uploading, setUploading] = useState(false);
  if (b.type === "heading" || b.type === "text") return (
    <div className="space-y-2">
      {b.type === "heading"
        ? <input value={b.text} onChange={(e) => onChange({ text: e.target.value })} className={inputCls} disabled={disabled} />
        : <textarea value={b.text} onChange={(e) => onChange({ text: e.target.value })} rows={4} className={inputCls + " resize-y"} disabled={disabled} />}
      <div className="flex flex-wrap items-center gap-4">
        <select value={b.align ?? "left"} onChange={(e) => onChange({ align: e.target.value as "left" | "center" })} className="rounded-lg border border-ink/15 px-2 py-1 text-xs" disabled={disabled}>
          <option value="left">Alineado a la izquierda</option><option value="center">Centrado</option>
        </select>
        <ColorPick label="Color del texto" value={b.color ?? "#17191a"} onChange={(v) => onChange({ color: v } as any)} disabled={disabled} />
      </div>
    </div>
  );
  if (b.type === "image") {
    const upload = async (file: File) => {
      if (file.size > 8 * 1024 * 1024) return toast.error("La imagen pesa más de 8 MB");
      setUploading(true);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `email/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("product-media").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
      setUploading(false);
      if (error) return toast.error(error.message);
      onChange({ url: supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl });
    };
    return (
      <div className="space-y-2">
        {b.url && <img src={b.url} alt="" className="max-h-40 rounded-lg object-contain" />}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink/15 px-3 py-1.5 text-xs">
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />} {b.url ? "Cambiar imagen" : "Subir imagen o GIF"}
          <input type="file" accept="image/jpeg,image/png,image/gif" className="hidden" disabled={disabled} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        <input value={b.href ?? ""} onChange={(e) => onChange({ href: e.target.value })} placeholder="Enlace al tocar la imagen (opcional)" className={inputCls} disabled={disabled} />
      </div>
    );
  }
  if (b.type === "button") return (
    <div className="grid gap-2 md:grid-cols-2">
      <input value={b.label} onChange={(e) => onChange({ label: e.target.value })} placeholder="Texto del botón" className={inputCls} disabled={disabled} />
      <input value={b.url} onChange={(e) => onChange({ url: e.target.value })} placeholder={`${SITE_ORIGIN}/…`} className={inputCls} disabled={disabled} />
      <div className="flex flex-wrap gap-4 md:col-span-2">
        <ColorPick label="Color del botón" value={b.bg ?? "#17191a"} onChange={(v) => onChange({ bg: v } as any)} disabled={disabled} />
        <ColorPick label="Color del texto" value={b.color ?? "#f9f4e6"} onChange={(v) => onChange({ color: v } as any)} disabled={disabled} />
      </div>
    </div>
  );
  if (b.type === "products") return <ProductsEditor block={b} onChange={onChange} disabled={disabled} />;
  return <p className="text-xs text-moss">Sin opciones.</p>;
}

function ProductsEditor({ block: b, onChange, disabled }: { block: Extract<CampaignBlock, { type: "products" }>; onChange: (p: Partial<CampaignBlock>) => void; disabled: boolean }) {
  const [q, setQ] = useState("");
  const { data: results = [] } = useQuery({
    queryKey: ["campaign-products", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("products")
        .select("id,name,slug,hero_image_url,product_images(url,position),product_variants(price_cop,active)")
        .eq("status", "published").ilike("name", `%${q.trim()}%`).limit(8);
      return (data ?? []).map((p: any): CampaignProduct => {
        const imgs = [...(p.product_images ?? [])].sort((a: any, z: any) => a.position - z.position);
        const prices = (p.product_variants ?? []).filter((v: any) => v.active !== false).map((v: any) => Number(v.price_cop)).filter((n: number) => n > 0);
        const image = imgs[0]?.url ?? p.hero_image_url ?? null;
        return { id: p.id, name: p.name, slug: p.slug, price: prices.length ? Math.min(...prices) : 0, image: image && !/\.(mp4|webm|mov)/i.test(image) ? image : null };
      });
    },
  });
  return (
    <div className="space-y-2">
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <input value={b.title ?? ""} onChange={(e) => onChange({ title: e.target.value })} placeholder="Título de la sección (opcional)" className={inputCls} disabled={disabled} />
        <select value={b.columns ?? 2} onChange={(e) => onChange({ columns: Number(e.target.value) as 2 | 3 })} className="rounded-xl border border-ink/15 px-2 text-xs" disabled={disabled}>
          <option value={2}>2 por fila</option><option value={3}>3 por fila</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {b.items.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-2 rounded-full bg-ink/5 py-1 pl-1 pr-2 text-xs">
            {p.image && <img src={p.image} alt="" className="size-6 rounded-full object-cover" />}{p.name}
            {!disabled && <button onClick={() => onChange({ items: b.items.filter((x) => x.id !== p.id) })}><X className="size-3" /></button>}
          </span>
        ))}
      </div>
      {!disabled && <>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca productos por nombre…" className={inputCls} />
        {results.length > 0 && <div className="max-h-56 overflow-y-auto rounded-xl border border-ink/10">
          {results.filter((r) => !b.items.some((x) => x.id === r.id)).map((r) => (
            <button key={r.id} onClick={() => { onChange({ items: [...b.items, r] }); setQ(""); }} className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs hover:bg-ink/5">
              {r.image ? <img src={r.image} alt="" className="size-9 rounded object-cover" /> : <div className="size-9 rounded bg-ink/5" />}
              <span className="flex-1">{r.name}</span><span className="text-moss">${r.price.toLocaleString("es-CO")}</span>
            </button>
          ))}
        </div>}
      </>}
    </div>
  );
}

function IconBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="flex size-7 items-center justify-center rounded-full hover:bg-ink/5">{children}</button>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[10px] uppercase tracking-widest text-moss/70">{label}</span>{children}</label>;
}

/** Resultados de una campaña enviada. */
export function CampaignStats({ campaign, onClose }: { campaign: CampaignRow; onClose: () => void }) {
  const { data: rows = [] } = useQuery({
    queryKey: ["campaign-recipients", campaign.id],
    queryFn: async () => {
      const all: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from("email_campaign_recipients" as any).select("email,status,opened_at,clicked_at,open_count,click_count,order_id,order_total_cop,bounced_at").eq("campaign_id", campaign.id).range(from, from + 999);
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return all as { email: string; status: string; opened_at: string | null; clicked_at: string | null; open_count: number; click_count: number; order_id: string | null; order_total_cop: number | null; bounced_at: string | null }[];
    },
    refetchInterval: 30000,
  });
  const sent = rows.filter((r) => r.status !== "failed").length;
  const opened = rows.filter((r) => r.opened_at).length;
  const clicked = rows.filter((r) => r.clicked_at).length;
  const bought = rows.filter((r) => r.order_id);
  const revenue = bought.reduce((a, r) => a + Number(r.order_total_cop ?? 0), 0);
  const bounced = rows.filter((r) => r.bounced_at).length;
  const pct = (n: number) => (sent ? `${((n / sent) * 100).toFixed(1)}%` : "0%");
  const [filter, setFilter] = useState<"all" | "opened" | "clicked" | "bought">("all");
  const list = rows.filter((r) => filter === "all" || (filter === "opened" ? r.opened_at : filter === "clicked" ? r.clicked_at : r.order_id));

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div><div className="text-[10px] uppercase tracking-widest text-moss/70">Resultados</div><div className="mt-1 text-2xl">{campaign.name}</div><div className="text-xs text-moss">{campaign.subject}</div></div>
          <button onClick={onClose} className="flex size-9 items-center justify-center rounded-full hover:bg-ink/5"><X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Enviados" value={sent} />
          <Stat label="Abiertos" value={opened} sub={pct(opened)} />
          <Stat label="Clics" value={clicked} sub={pct(clicked)} />
          <Stat label="Compraron" value={bought.length} sub={pct(bought.length)} />
          <Stat label="Ventas generadas" value={`$${Math.round(revenue).toLocaleString("es-CO")}`} />
        </div>
        <p className="mt-3 text-xs text-moss">Compra atribuida: la clienta hizo clic en el correo y pagó en la tienda en los 7 días siguientes. Rebotados: {bounced}. Algunos correos (como Apple Mail) pueden marcar aperturas automáticamente.</p>
        <div className="mt-6 flex gap-1">
          {([["all", "Todas"], ["opened", "Abrieron"], ["clicked", "Hicieron clic"], ["bought", "Compraron"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-4 py-1.5 text-xs ${filter === k ? "bg-ink text-ivory" : "text-ink/70"}`}>{l}</button>
          ))}
        </div>
        <table className="mt-3 w-full text-xs">
          <thead className="text-[10px] uppercase tracking-widest text-moss/70"><tr><th className="py-2 text-left">Correo</th><th>Aperturas</th><th>Clics</th><th className="text-right">Compra</th></tr></thead>
          <tbody>{list.slice(0, 300).map((r) => (
            <tr key={r.email} className="border-t border-ink/5">
              <td className="py-2">{r.email}{r.status === "bounced" && <span className="ml-2 text-destructive">rebotó</span>}{r.status === "failed" && <span className="ml-2 text-destructive">no enviado</span>}</td>
              <td className="text-center">{r.open_count || "—"}</td><td className="text-center">{r.click_count || "—"}</td>
              <td className="text-right">{r.order_id ? `$${Math.round(Number(r.order_total_cop)).toLocaleString("es-CO")}` : "—"}</td>
            </tr>
          ))}</tbody>
        </table>
        {list.length > 300 && <p className="mt-2 text-xs text-moss">Mostrando 300 de {list.length}.</p>}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return <div className="rounded-2xl bg-ink/5 p-4"><div className="text-[10px] uppercase tracking-widest text-moss/70">{label}</div><div className="mt-1 text-2xl">{value}</div>{sub && <div className="text-xs text-moss">{sub}</div>}</div>;
}

const SWATCHES = ["#17191a", "#f9f4e6", "#ffffff", "#4a5a3a", "#6b6f5a", "#c8a96a", "#b5523b"];
function ColorPick({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-moss">
      <span>{label}</span>
      {SWATCHES.map((c) => (
        <button key={c} type="button" disabled={disabled} onClick={() => onChange(c)} title={c}
          className={`size-5 rounded-full border ${value.toLowerCase() === c ? "ring-2 ring-ink ring-offset-1" : "border-ink/20"}`} style={{ background: c }} />
      ))}
      <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" aria-label={label} />
    </div>
  );
}
