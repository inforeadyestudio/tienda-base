import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { seoHead, SEO_DEFAULT_DESCRIPTION } from "@/lib/seo";

export const Route = createFileRoute("/reset-password")({
  head: () => seoHead({ title: "Nueva contraseña | Tu Marca", description: SEO_DEFAULT_DESCRIPTION, path: "/reset-password", noindex: true }),
  component: ResetPassword,
});

function ResetPassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return toast.error("Las contraseñas no coinciden");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_password: false } });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Contraseña actualizada");
    window.location.href = "/cuenta";
  };

  return (
    <div className="min-h-screen bg-ivory flex items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-md text-center space-y-3">
        <h1 className="font-serif italic text-4xl mb-2">Crea tu contraseña</h1>
        <p className="text-sm text-moss/70 mb-6">Elige una contraseña nueva para tu cuenta Tu Marca.</p>
        <input type="password" required minLength={8} placeholder="Nueva contraseña" value={pw} onChange={(e) => setPw(e.target.value)} className="w-full border border-ink/20 px-4 py-3 bg-transparent focus:border-ink outline-none" />
        <input type="password" required minLength={8} placeholder="Repite la contraseña" value={pw2} onChange={(e) => setPw2(e.target.value)} className="w-full border border-ink/20 px-4 py-3 bg-transparent focus:border-ink outline-none" />
        <button type="submit" disabled={loading} className="w-full bg-ink text-ivory text-[11px] uppercase tracking-[0.2em] py-4 hover:bg-moss disabled:opacity-50">
          {loading ? "..." : "Guardar contraseña"}
        </button>
      </form>
    </div>
  );
}
