import { readAppSetting } from "@/lib/public-settings";
import { useEffect, useState, type ReactNode } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession, staffAccessOptions } from "@/lib/auth-hooks";
import logoAsset from "@/assets/marca-logo-verde-oscuro.png";
import { normalizeComingSoon } from "@/lib/coming-soon-state";
import { Iso } from "@/design/sections/marca/shared";
import cs1 from "@/design/assets/marca/login-ref132-c1.webp";
import cs2 from "@/design/assets/marca/login-ref150-c5.webp";
import cs3 from "@/design/assets/marca/login-ref114-c4.webp";
import cs4 from "@/design/assets/marca/login-ref108-c15.webp";
import cs5 from "@/design/assets/marca/login-ref111-c13.webp";
import cs6 from "@/design/assets/marca/login-ref144-c1.webp";
import cs7 from "@/design/assets/marca/login-ref108-c17.webp";
import cs8 from "@/design/assets/marca/login-ref101-c3.webp";
import cs9 from "@/design/assets/marca/login-ref106-c1.webp";

export const COMING_SOON_KEY = "coming_soon";
export type ComingSoon = { enabled: boolean; title: string; message: string; launchAt: string | null };
const DEFAULTS: ComingSoon = {
  enabled: false,
  title: "Muy pronto",
  message: "Estamos preparando algo especial. Déjanos tu correo y te avisamos el día del lanzamiento.",
  launchAt: null,
};

export const comingSoonQuery = () =>
  queryOptions({
    queryKey: ["app-settings", COMING_SOON_KEY],
    staleTime: 60_000,
    queryFn: async (): Promise<ComingSoon> => {
      const data = { value: await readAppSetting(COMING_SOON_KEY).catch(() => null) };
      const v = (data?.value ?? {}) as Partial<ComingSoon>;
      return { ...DEFAULTS, ...v };
    },
  });

const BYPASS = /^\/(admin|pos|b2b|auth|reset-password|cuenta|api)(\/|$)/;

/** Muestra la página de bloqueo a visitantes cuando está activa; el equipo navega normal. */
export function ComingSoonGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const preview = useRouterState({ select: (s) => s.location.searchStr.includes("preview-bloqueo") });
  const { data } = useQuery(comingSoonQuery());
  const { user, loading } = useSession();
  const { data: isStaff } = useQuery({ ...staffAccessOptions(user?.id ?? ""), enabled: !!user });
  const [now, setNow] = useState<number | null>(null);
  const launchMs = data?.launchAt ? new Date(data.launchAt).getTime() : null;
  useEffect(() => {
    setNow(Date.now());
    if (!data?.enabled || launchMs == null) return;
    const wait = launchMs - Date.now();
    if (wait <= 0 || wait > 2_147_000_000) return;
    const t = setTimeout(() => setNow(Date.now()), wait + 500);
    return () => clearTimeout(t);
  }, [data?.enabled, launchMs]);
  // Al terminar la cuenta regresiva la tienda se abre sola.
  const launched = launchMs != null && now != null && now >= launchMs;
  if (preview && data) return <ComingSoonPage config={data} />;
  if (!data?.enabled || launched || BYPASS.test(pathname) || isStaff) return <>{children}</>;
  if (loading || (user && isStaff === undefined)) return null;
  return <ComingSoonPage config={data} />;
}

function useCountdown(target: string | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target || now == null) return null;
  const diff = Math.max(0, new Date(target).getTime() - now);
  return {
    Días: Math.floor(diff / 86_400_000),
    Horas: Math.floor(diff / 3_600_000) % 24,
    Min: Math.floor(diff / 60_000) % 60,
    Seg: Math.floor(diff / 1000) % 60,
  };
}

const emailSchema = z.string().trim().email().max(255);

// Flipbook de producto: las gafas cambian cuadro a cuadro, como en el home.
const CS_FRAMES = [
  { src: cs1, ref: "LU132" }, { src: cs2, ref: "LU150" }, { src: cs3, ref: "LU114" },
  { src: cs4, ref: "LU108" }, { src: cs5, ref: "LU111" }, { src: cs6, ref: "LU144" },
  { src: cs7, ref: "LU108" }, { src: cs8, ref: "LU101" }, { src: cs9, ref: "LU106" },
];

function ComingSoonFlipbook() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % CS_FRAMES.length), 900);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="marca-cs-flip" aria-hidden="true">
      {CS_FRAMES.map((f, n) => (
        <img key={f.src} src={f.src} alt="" className={n === i ? "is-on" : undefined} loading={n < 2 ? "eager" : "lazy"} />
      ))}
      <span className="marca-mono marca-cs-flip-ref">{CS_FRAMES[i].ref}</span>
    </div>
  );
}

function launchLabel(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Bogota" }).replaceAll("/", ".");
  const time = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
  return `${date} · ${time}`;
}

export function ComingSoonPage({ config }: { config: ComingSoon }) {
  const cd = useCountdown(config.launchAt);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const when = launchLabel(config.launchAt);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return toast.error("Escribe un correo válido.");
    setState("sending");
    const { error } = await supabase.from("coming_soon_signups" as never).insert({ email: parsed.data.toLowerCase() } as never);
    if (error && !String(error.code).startsWith("23505")) {
      setState("idle");
      return toast.error("No pudimos guardar tu correo. Intenta de nuevo.");
    }
    setState("done");
  };

  return (
    <main className="marca marca-cs">
      <header className="marca-cs-top">
        <span role="img" aria-label="Tu Marca" className="marca-cs-logo" style={{ "--marca-cs-logo": `url(${logoAsset})` } as React.CSSProperties} />
        <p className="marca-mono marca-mono-soft">{when ? <><span className="marca-cs-when-pre">Lanzamiento · </span>{when}</> : "Muy pronto"}</p>
      </header>

      <section className="marca-cs-center">
        <span className="marca-cs-iso"><Iso /></span>
        <h1 className="marca-t">{config.title}</h1>
        <ComingSoonFlipbook />
        {cd && (
          <dl className="marca-cs-count">
            {Object.entries(cd).map(([k, v]) => (
              <div key={k}>
                <dd>{String(v).padStart(2, "0")}</dd>
                <dt className="marca-mono marca-mono-soft">{k}</dt>
              </div>
            ))}
          </dl>
        )}
        <p className="marca-cs-message">{config.message}</p>
        {state === "done" ? (
          <p className="marca-mono marca-cs-done">Gracias. Te avisamos el día del lanzamiento.</p>
        ) : (
          <form onSubmit={submit} className="marca-cs-form">
            <input
              type="email"
              required
              maxLength={255}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Tu correo"
              aria-label="Correo"
            />
            <button disabled={state === "sending"} className="marca-bk">
              {state === "sending" ? "Enviando…" : "[ Avísame ]"}
            </button>
          </form>
        )}
      </section>

      <footer className="marca-cs-bottom">
        <p className="marca-mono marca-mono-soft">Tu frase de marca va aquí.</p>
        <nav>
          <a href="https://www.instagram.com/tumarca" target="_blank" rel="noreferrer" className="marca-bk">[ @tumarca ]</a>
          <a href="/auth?redirect=%2F" className="marca-bk">[ Team login ]</a>
        </nav>
      </footer>
    </main>
  );
}

export function ComingSoonEditor() {
  const qc = useQueryClient();
  const { data } = useQuery(comingSoonQuery());
  const [cfg, setCfg] = useState<ComingSoon | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data && !cfg) setCfg(normalizeComingSoon(data, Date.now())); }, [data, cfg]);
  useEffect(() => {
    if (!cfg?.enabled || !cfg.launchAt) return;
    const launchMs = new Date(cfg.launchAt).getTime();
    if (!Number.isFinite(launchMs)) return;
    const refresh = () => setCfg((current) => current ? normalizeComingSoon(current, Date.now()) : current);
    if (launchMs <= Date.now()) { refresh(); return; }
    const timer = setTimeout(refresh, Math.min(launchMs - Date.now() + 50, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [cfg]);
  const { data: signups } = useQuery({
    queryKey: ["coming-soon-signups"],
    queryFn: async () => {
      const { data } = await supabase.from("coming_soon_signups" as never).select("email, created_at").order("created_at", { ascending: false }).limit(1000);
      return (data ?? []) as unknown as { email: string; created_at: string }[];
    },
  });
  if (!cfg) return null;

  const save = async () => {
    setSaving(true);
    const savedConfig = normalizeComingSoon(cfg, Date.now());
    const { error } = await supabase.from("app_settings").upsert({ key: COMING_SOON_KEY, value: savedConfig as never }, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error("No se pudo guardar.");
    setCfg(savedConfig);
    qc.invalidateQueries({ queryKey: ["app-settings", COMING_SOON_KEY] });
    toast.success(savedConfig.enabled ? "Página de bloqueo activada" : "Tienda abierta al público");
  };
  const localValue = cfg.launchAt ? new Date(new Date(cfg.launchAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  const exportCsv = () => {
    const cell = (v: unknown) => {
      let t = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const csv = "correo,fecha\n" + (signups ?? []).map((s) => `${cell(s.email)},${cell(s.created_at)}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "correos-lanzamiento.csv";
    a.click();
  };

  return (
    <div className="space-y-5 border border-ink/10 p-5">
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked, launchAt: e.target.checked && cfg.launchAt && new Date(cfg.launchAt).getTime() <= Date.now() ? null : cfg.launchAt })} />
        <span>Cerrar la tienda con la página de bloqueo (el equipo sigue viendo el sitio al iniciar sesión)</span>
      </label>
      <label className="block text-sm">Título
        <input className="mt-1 w-full border border-ink/20 bg-transparent px-3 py-2" value={cfg.title} maxLength={80} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
      </label>
      <label className="block text-sm">Mensaje
        <textarea className="mt-1 w-full border border-ink/20 bg-transparent px-3 py-2" rows={3} maxLength={400} value={cfg.message} onChange={(e) => setCfg({ ...cfg, message: e.target.value })} />
      </label>
      <label className="block text-sm">Fecha de lanzamiento (cuenta regresiva)
        <input type="datetime-local" className="mt-1 block border border-ink/20 bg-transparent px-3 py-2" value={localValue}
          onChange={(e) => setCfg({ ...cfg, launchAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
      </label>
      <div className="flex flex-wrap gap-3">
        <button onClick={save} disabled={saving} className="bg-ink px-5 py-2 text-sm text-ivory disabled:opacity-50">{saving ? "Guardando…" : "Guardar"}</button>
        <a href="/?preview-bloqueo" target="_blank" rel="noreferrer" className="border border-ink/20 px-5 py-2 text-sm">Ver vista previa</a>
      </div>
      <div className="border-t border-ink/10 pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm">Correos registrados: {signups?.length ?? 0}</p>
          {!!signups?.length && <button onClick={exportCsv} className="text-sm underline">Descargar CSV</button>}
        </div>
        <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-ink/70">
          {signups?.map((s) => <li key={s.email}>{s.email}</li>)}
        </ul>
      </div>
    </div>
  );
}
