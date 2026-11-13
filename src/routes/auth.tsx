import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/login/logo-marca.webp";
import lu132 from "@/design/assets/marca/login-ref132-c1.webp";
import lu108 from "@/design/assets/marca/login-ref108-c17.webp";
import lu106 from "@/design/assets/marca/login-ref106-c1.webp";
import lu114 from "@/design/assets/marca/login-ref114-c4.webp";
import { Iso } from "@/design/sections/marca/shared";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Eye, EyeOff } from "lucide-react";
import { seoHead, SEO_DEFAULT_DESCRIPTION } from "@/lib/seo";

const searchSchema = z.object({ redirect: z.string().optional() });

// Fotos de producto que se turnan en el ingreso (cuadro a cuadro, como el home).
const LOGIN_PRODUCTS = [
  { src: lu132, ref: "REF 01", name: "Producto de ejemplo" },
  { src: lu108, ref: "REF 02", name: "Producto de ejemplo" },
  { src: lu106, ref: "REF 03", name: "Producto de ejemplo" },
  { src: lu114, ref: "REF 04", name: "Producto de ejemplo" },
];

function LoginProducts() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % LOGIN_PRODUCTS.length), 2800);
    return () => window.clearInterval(t);
  }, []);
  const p = LOGIN_PRODUCTS[i];
  return (
    <aside className="marca-login-photo marca-grain" aria-hidden="true">
      <img key={p.ref} src={p.src} alt="" className="marca-fade" />
      <p className="marca-mono marca-login-ref"><span>{p.ref}</span> {p.name}</p>
      <p className="marca-mono marca-login-count">{String(i + 1).padStart(2, "0")} / {String(LOGIN_PRODUCTS.length).padStart(2, "0")}</p>
    </aside>
  );
}

export const Route = createFileRoute("/auth")({
  head: () => seoHead({ title: "Ingresar | Tu Marca", description: SEO_DEFAULT_DESCRIPTION, path: "/auth", noindex: true }),
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState("");
  const search = useSearch({ from: "/auth" });
  const safeRedirect = search.redirect && /^\/(?![\/\\])/.test(search.redirect) ? search.redirect : null;
  const redirect = safeRedirect ?? "/cuenta";

  type LoginUser = { id: string; user_metadata?: Record<string, unknown> };

  const routeAfterLogin = async (userOverride?: LoginUser | null) => {
    if (safeRedirect) {
      window.location.replace(safeRedirect);
      return;
    }
    let user = userOverride ?? null;
    if (userOverride === undefined) {
      const { data: userData } = await supabase.auth.getUser();
      user = userData.user ? { id: userData.user.id, user_metadata: userData.user.user_metadata } : null;
    }
    if (user?.user_metadata?.must_change_password) {
      window.location.replace("/reset-password");
      return;
    }
    if (user) {
      try {
        const { data: isB2B } = await Promise.race([
          supabase.rpc("is_b2b", { _user_id: user.id }),
          new Promise<{ data: boolean }>((resolve) => setTimeout(() => resolve({ data: false }), 2500)),
        ]);
        if (isB2B) {
          window.location.replace("/b2b");
          return;
        }
      } catch {
        // Si la consulta falla, seguimos al destino por defecto en lugar de quedarnos colgados.
      }
    }
    window.location.replace(redirect);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${redirect}`,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Cuenta creada. Bienvenida.");
          await routeAfterLogin(data.user ? { id: data.user.id, user_metadata: data.user.user_metadata } : null);
        } else {
          toast.success("Cuenta creada. Revisa tu correo para confirmarla y luego ingresa.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await routeAfterLogin(data.user ? { id: data.user.id, user_metadata: data.user.user_metadata } : null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setLoading(false);
    }
  };

  // Ingreso con Google por Supabase (Authentication → Providers → Google).
  // Google devuelve a esta misma página; al volver se continúa al destino.
  const google = async () => {
    try { sessionStorage.setItem("tb-oauth", "1"); } catch { /* sin almacenamiento */ }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth${window.location.search}` },
    });
    if (error) {
      try { sessionStorage.removeItem("tb-oauth"); } catch { /* sin almacenamiento */ }
      toast.error("No se pudo ingresar con Google");
    }
  };

  useEffect(() => {
    let pending = false;
    try { pending = sessionStorage.getItem("tb-oauth") === "1"; } catch { /* sin almacenamiento */ }
    if (!pending) return;
    const done = () => {
      try { sessionStorage.removeItem("tb-oauth"); } catch { /* sin almacenamiento */ }
      void routeAfterLogin();
    };
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) done();
      else if (event === "INITIAL_SESSION") { try { sessionStorage.removeItem("tb-oauth"); } catch { /* sin almacenamiento */ } }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="marca marca-login" data-no-translate lang="es">
      <LoginProducts />
      <main className="marca-login-panel">
        <Link to="/" className="marca-login-wordmark" aria-label="Tu Marca, volver al inicio">
          <img src={logoAsset} alt="Tu Marca" />
        </Link>
        <section className="marca-login-card" aria-labelledby="welcome">
          <span className="marca-login-iso"><Iso /></span>
          <p className="marca-mono marca-mono-soft">Mi cuenta · Tu Marca</p>
          <h1 id="welcome" className="marca-t">{mode === "signin" ? "Bienvenida" : "Crea tu cuenta"}</h1>
          <p className="marca-login-tagline">Tu frase de marca va aquí.</p>
          {false && <Button onClick={google} variant="outline">Continuar con Google</Button>}
          <form onSubmit={submit} className="marca-login-form">
            {mode === "signup" && (
              <div className="marca-login-field">
                <label htmlFor="full-name" className="marca-mono">Nombre completo</label>
                <input id="full-name" type="text" autoComplete="name" required placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="marca-login-field">
              <label htmlFor="email" className="marca-mono">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@email.com" value={email} onChange={(e) => { setEmail(e.target.value); setStatus(""); }} />
            </div>
            <div className="marca-login-field">
              <div className="marca-login-label-row">
                <label htmlFor="password" className="marca-mono">Contraseña</label>
                {mode === "signin" && (
                  <button type="button" className="marca-bk" onClick={async () => {
                    if (!email.includes("@")) { setStatus("Escribe tu email para recuperar tu contraseña."); document.getElementById("email")?.focus(); return; }
                    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
                    if (error) toast.error(error.message);
                    else setStatus("Te enviamos un enlace para crear tu contraseña.");
                  }}>[ ¿La olvidaste? ]</button>
                )}
              </div>
              <div className="marca-login-password">
                <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={6} placeholder="Tu contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="marca-login-eye" aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={() => { setShowPassword(!showPassword); document.getElementById("password")?.focus(); }}>
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="marca-login-submit">
              <span>{loading ? "Ingresando…" : mode === "signin" ? "Ingresar" : "Crear cuenta"}</span>
              <ArrowUpRight aria-hidden="true" />
            </button>
            <p className="marca-login-status" role="status">{status}</p>
          </form>
          <p className="marca-login-join">
            <span className="marca-mono marca-mono-soft">{mode === "signin" ? "¿Es tu primera vez?" : "¿Ya tienes cuenta?"}</span>
            <button type="button" className="marca-bk" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setStatus(""); }}>
              [ {mode === "signin" ? "Crea tu cuenta" : "Ingresar"} ]
            </button>
          </p>
        </section>
      </main>
    </div>
  );
}
