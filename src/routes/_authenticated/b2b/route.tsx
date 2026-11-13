import { createFileRoute, Outlet, useNavigate, useRouterState, Link } from "@tanstack/react-router";
import { BRAND } from "@/config/brand";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Shirt, Package, ClipboardList, LineChart, Truck,
  LogOut, ChevronDown, Menu, X,
} from "lucide-react";
import { useIsB2B, useIsAdmin, useSession } from "@/lib/auth-hooks";
import { supabase } from "@/integrations/supabase/client";
import { BrandLoader } from "@/components/ui/page-loader";
import { B2BCartDrawer } from "@/components/b2b/b2b-cart-drawer";
import { MarcaLogo } from "@/design/storefront/marca-logo";

export const Route = createFileRoute("/_authenticated/b2b")({
  component: B2BLayout,
});

const ITEMS = [
  { to: "/b2b", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/b2b/colecciones", label: "Colecciones", icon: Shirt },
  { to: "/b2b/productos", label: "Productos", icon: Package },
  { to: "/b2b/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/b2b/proyecciones", label: "Proyecciones", icon: LineChart },
];

function B2BLayout() {
  const { data: isB2B, isPending: pB, isError: eB } = useIsB2B();
  const { data: isStaff, isPending: pS, isError: eS } = useIsAdmin();
  const pendingB2B = pB && !eB;
  const pendingStaff = pS && !eS;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading: loadingSession } = useSession();
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);

  const loading = loadingSession || !user || pendingB2B || pendingStaff;
  const allowed = Boolean(isB2B || isStaff);

  useEffect(() => {
    if (loadingSession) return;
    if (!user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (!pendingB2B && !pendingStaff && !allowed) navigate({ to: "/", replace: true });
  }, [loadingSession, user, pendingB2B, pendingStaff, allowed, navigate]);

  if (loading) return <BrandLoader full className="bg-[#f5f0e6]" />;
  if (!allowed) return <div className="min-h-screen bg-[#f5f0e6] flex items-center justify-center text-ink/60 font-nm">Acceso B2B restringido.</div>;

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="admin-scope b2b-portal min-h-screen bg-[#f5f0e6] md:flex text-ink">
      <div className="md:hidden sticky top-0 z-40 h-14 px-4 flex items-center justify-between bg-[#f5f0e6] border-b border-ink/8">
        <button onClick={() => setMenuOpen(true)} aria-label="Abrir menú" className="p-2 -ml-2 text-ink/70">
          <Menu className="size-5" />
        </button>
        <div className="text-center min-w-0">
          <MarcaLogo className="mx-auto h-6 w-auto text-foreground" />
          <div className="text-[9px] tracking-[0.22em] text-ink/50 mt-1.5">B2B PORTAL</div>
        </div>
        <button onClick={signOut} aria-label="Cerrar sesión" className="p-2 -mr-2 text-ink/60"><LogOut className="size-4" /></button>
      </div>

      <aside className="hidden md:flex w-[236px] shrink-0 bg-[#f5f0e6] flex-col h-dvh sticky top-0 border-r border-ink/8">
        <SidebarBody pathname={pathname} onNavigate={() => {}} signOut={signOut} />
      </aside>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="md:hidden fixed inset-0 z-50 bg-ink/40"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              className="md:hidden fixed inset-y-0 left-0 z-50 w-[80vw] max-w-[300px] bg-[#f5f0e6] border-r border-ink/8 flex flex-col min-h-0"
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={{ left: 0.4, right: 0 }}
              onDragEnd={(_, info) => { if (info.offset.x < -70 || info.velocity.x < -400) setMenuOpen(false); }}
            >
              <button onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" className="absolute top-4 right-4 p-2 text-ink/50 z-10">
                <X className="size-4" />
              </button>
              <SidebarBody pathname={pathname} onNavigate={() => setMenuOpen(false)} signOut={signOut} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
      <B2BCartDrawer />
    </div>
  );
}

function useB2BAccount() {
  const { user } = useSession() as any;
  const [acc, setAcc] = useState<{ name: string; place: string }>({ name: "", place: "" });
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const [{ data: p }, { data: a }] = await Promise.all([
        supabase.from("profiles").select("full_name, company_name").eq("id", user.id).maybeSingle(),
        supabase.from("addresses").select("city, country").eq("user_id", user.id).order("is_default", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setAcc({
        name: (p as any)?.company_name || p?.full_name || user.email || "Mi cuenta",
        place: [a?.city, a?.country].filter(Boolean).join(", "),
      });
    })();
  }, [user?.id]);
  return acc;
}

function SidebarBody({ pathname, onNavigate, signOut }: { pathname: string; onNavigate: () => void; signOut: () => void }) {
  const account = useB2BAccount();
  return (
    <>
      <div className="px-6 pt-8 pb-6">
        <MarcaLogo className="h-7 w-auto text-foreground" />
        <div className="text-[10px] tracking-[0.22em] text-ink/50 mt-2">B2B PORTAL</div>
      </div>
      <Link to="/b2b/perfil" onClick={onNavigate} title="Editar perfil" className="mx-5 mb-5 px-4 py-3 bg-white rounded-2xl border border-ink/10 flex items-center justify-between text-left hover:border-ink/20">
        <div>
          <div className="font-nm text-[13px] leading-none">{account.name}</div>
          {account.place && <div className="text-[10px] text-ink/50 mt-1">{account.place}</div>}
        </div>
        <ChevronDown className="size-3.5 text-ink/40 -rotate-90" />
      </Link>
      <nav className="flex-1 min-h-0 px-3 space-y-0.5 overflow-y-auto overscroll-contain sidebar-scroll">
        {ITEMS.map((it) => {
          const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
          return (
            <Link key={it.to} to={it.to as "/b2b"} onClick={onNavigate} className={
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-colors " +
              (active ? "bg-ink text-ivory" : "text-ink/70 hover:bg-ink/5")
            }>
              <it.icon className="size-4 shrink-0" />
              <span className="flex-1 truncate">{it.label}</span>
              {"badge" in it && (it as any).badge > 0 && (
                <span className={
                  "text-[10px] font-medium px-2 py-0.5 rounded-full " +
                  (active ? "bg-ivory/20 text-ivory" : "bg-[#e8ddc7] text-ink/70")
                }>{(it as any).badge}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 mx-4 mb-4 bg-white rounded-2xl border border-ink/8 p-4 text-center">
        <div className="text-[10px] text-ink/50">¿Necesitas ayuda?</div>
        <div className="text-[11px] mt-0.5">Tu asesor Tu Marca está aquí</div>
        <div className="font-nm text-[13px] mt-2">Juan Esteban</div>
        <a href={`https://wa.me/${BRAND.whatsapp}`} target="_blank" rel="noopener noreferrer" className="mt-3 block w-full py-2 border border-ink/15 rounded-full text-[11px] hover:bg-ink hover:text-ivory transition-colors">Escribir por WhatsApp</a>
      </div>
      <button onClick={signOut} className="shrink-0 px-6 py-4 border-t border-ink/8 flex items-center gap-2 text-[11px] text-ink/60 hover:text-ink">
        <LogOut className="size-3.5" /> Cerrar sesión
      </button>
    </>
  );
}
