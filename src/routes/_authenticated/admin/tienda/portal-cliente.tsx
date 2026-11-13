import { usePortalModules, PORTAL_MODULES_KEY, DEFAULT_PORTAL_MODULES } from "@/lib/portal-modules";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/auth-hooks";
import { optimizeImageFile, uploadOptions } from "@/lib/media";
import { ACCOUNT_HERO_KEY, DEFAULT_ACCOUNT_HERO, type AccountHero } from "@/lib/account-hero";
import { ImagePlus, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/tienda/portal-cliente")({
  head: () => ({
    meta: [
      { title: "Portal cliente · Tu Marca Sales Hub" },
      { name: "description", content: "Edita el banner editorial que ven los clientes en su perfil." },
    ],
  }),
  component: PortalClientePage,
});

function PortalClientePage() {
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const qc = useQueryClient();
  const [form, setForm] = useState<AccountHero>(DEFAULT_ACCOUNT_HERO);
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery({
    queryKey: ["app-setting", ACCOUNT_HERO_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", ACCOUNT_HERO_KEY)
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? null) as AccountHero | null;
    },
  });

  useEffect(() => {
    if (data) setForm({ ...DEFAULT_ACCOUNT_HERO, ...data });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: ACCOUNT_HERO_KEY, value: form as never }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Banner actualizado");
      qc.invalidateQueries({ queryKey: ["app-setting", ACCOUNT_HERO_KEY] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const optimized = await optimizeImageFile(file);
      const path = `portal-cliente/hero-${Date.now()}-${optimized.name}`;
      const { error } = await supabase.storage.from("product-media").upload(path, optimized, uploadOptions(optimized));
      if (error) throw error;
      const { data: pub } = supabase.storage.from("product-media").getPublicUrl(path);
      setForm((f) => ({ ...f, image_url: pub.publicUrl }));
      toast.success("Imagen cargada. Recuerda guardar.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (adminLoading) return <div className="p-10 text-sm text-ink/60">Cargando…</div>;
  if (!isAdmin) {
    return (
      <div className="p-10">
        <h1 className="font-serif text-2xl">Acceso restringido</h1>
        <p className="text-sm text-ink/60 mt-2">Solo los administradores pueden editar el portal de clientes.</p>
      </div>
    );
  }

  return (
    <div className="p-8 lg:p-10 max-w-5xl">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Portal cliente</div>
      <h1 className="font-serif text-3xl mt-1">Banner del perfil</h1>
      <p className="text-sm text-ink/60 mt-2">Esto es lo que ven tus clientes al entrar a su cuenta.</p>

      <ModulesCard />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <div className="space-y-5">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.2em] text-ink/50">Imagen</span>
            <div className="mt-2 flex items-center gap-3">
              <label className="inline-flex items-center gap-2 border border-ink/15 rounded-full px-4 py-2.5 text-xs cursor-pointer hover:bg-ink/5">
                <ImagePlus className="size-4" />
                {uploading ? "Subiendo…" : "Subir imagen"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
                />
              </label>
            </div>
            <input
              value={form.image_url}
              onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
              placeholder="…o pega una URL de imagen"
              className="mt-3 w-full border-b border-ink/15 bg-transparent py-2 text-sm outline-none focus:border-ink"
            />
          </label>

          <Field label="Primera línea">
            <input value={form.line1} onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))} className="input" />
          </Field>
          <Field label="Segunda línea">
            <input value={form.line2} onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))} className="input" />
          </Field>
          <Field label="Texto del botón">
            <input value={form.cta_label} onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))} className="input" />
          </Field>
          <Field label="Enlace del botón">
            <input value={form.cta_to} onChange={(e) => setForm((f) => ({ ...f, cta_to: e.target.value }))} placeholder="/cuenta/inspiraciones" className="input" />
          </Field>

          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="inline-flex items-center gap-2 rounded-full bg-ink text-ivory px-6 py-3 text-[10px] uppercase tracking-[0.25em] disabled:opacity-50"
          >
            <Save className="size-3.5" /> {save.isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40 mb-2">Vista previa</div>
          <div className="relative rounded-3xl overflow-hidden aspect-[16/10] bg-[#2f2822]">
            {form.image_url && (
              <img src={form.image_url} alt="Vista previa" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
            <div className="absolute inset-0 flex items-center px-8">
              <div className="text-ivory">
                <p className="font-serif italic text-2xl leading-tight max-w-xs">
                  {form.line1}<br />{form.line2}
                </p>
                <span className="mt-5 inline-block border border-ivory/50 text-ivory text-[10px] tracking-[0.25em] uppercase px-5 py-3">
                  {form.cta_label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`.input{width:100%;border-bottom:1px solid rgba(0,0,0,.12);background:transparent;padding:.5rem 0;font-size:.875rem;outline:none}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em] text-ink/50">{label}</span>
      {children}
    </label>
  );
}

function ModulesCard() {
  const qc = useQueryClient();
  const { data } = usePortalModules();
  const m = data ?? DEFAULT_PORTAL_MODULES;
  const toggle = useMutation({
    mutationFn: async (closet: boolean) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: PORTAL_MODULES_KEY, value: { ...m, closet } as never }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Módulos actualizados");
      qc.invalidateQueries({ queryKey: ["app-setting", PORTAL_MODULES_KEY] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section className="mt-8 rounded-2xl border border-ink/10 bg-white/60 p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-ink/50">Módulos del portal</div>
      <label className="mt-3 flex items-center justify-between gap-4">
        <span>
          <span className="block text-sm text-ink">Mi Closet</span>
          <span className="block text-xs text-ink/60">Muestra el closet en el menú y en el inicio de la cuenta.</span>
        </span>
        <input
          type="checkbox"
          className="size-5 accent-[var(--color-moss)]"
          checked={m.closet}
          disabled={toggle.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
        />
      </label>
    </section>
  );
}
