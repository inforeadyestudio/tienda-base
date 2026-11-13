import { createFileRoute, useNavigate, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useProfile } from "@/lib/auth-hooks";
import { usePortalModules } from "@/lib/portal-modules";
import { MarcaLogo } from "@/design/storefront/marca-logo";
import {
  Home, Shirt, Sparkles, Package, Star, Mail, Heart,
  User, Bell, ChevronDown, MessageCircle, Menu, X, RefreshCcw, LogOut,

} from "lucide-react";

export const Route = createFileRoute("/_authenticated/cuenta")({
  component: AccountLayout,
});

const NAV = [
  { icon: Home, label: "Inicio", to: "/cuenta", exact: true },
  { icon: Shirt, label: "Mi Closet", to: "/cuenta/closet" },
  { icon: Sparkles, label: "Try-On", to: "/cuenta/try-on" },
  { icon: Package, label: "Pedidos", to: "/cuenta/pedidos" },
  { icon: Star, label: "Puntos", to: "/cuenta/puntos" },
  { icon: Mail, label: "Inbox Privado", to: "/cuenta/inbox", badge: 1 },
  { icon: Heart, label: "Wishlist y regalos", to: "/cuenta/wishlist" },

  { icon: RefreshCcw, label: "Cambios y devoluciones", to: "/cuenta/cambios" },
  { icon: User, label: "Mi Perfil", to: "/cuenta/perfil" },
] as const;

function AccountLayout() {
  const { user } = useSession();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [navOpen, setNavOpen] = useState(false);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  const firstName = profile?.full_name?.split(" ")[0] ?? (user?.email?.split("@")[0] ?? "");

  return (
    <div className="min-h-screen bg-ivory text-ink flex">
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-ink/10 bg-ivory h-screen sticky top-0 flex-col">
        <SidebarBody signOut={signOut} />
      </aside>

      <AnimatePresence>
        {navOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNavOpen(false)}
              className="fixed inset-0 z-[70] bg-ink/40 backdrop-blur-[2px] lg:hidden"
            />
            <motion.aside
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[85svh] flex-col rounded-t-3xl bg-ivory pb-[max(env(safe-area-inset-bottom),1rem)] shadow-xl lg:hidden"
              role="dialog"
              aria-label="Menú de cuenta"
            >
              <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-ink/15" />
              <button
                onClick={() => setNavOpen(false)}
                aria-label="Cerrar menú"
                className="absolute right-4 top-4 text-moss"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
              <SidebarBody onNavigate={() => setNavOpen(false)} signOut={signOut} compact />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0">
        <header className="h-16 lg:h-20 border-b border-ink/10 flex items-center justify-between px-4 sm:px-6 lg:px-10 gap-3">
          <div className="flex items-center gap-3 lg:w-40">
            <button onClick={() => setNavOpen(true)} className="lg:hidden text-ink" aria-label="Abrir menú">
              <Menu className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3 lg:gap-5 lg:w-40 justify-end">
            <Link to="/cuenta/inbox" className="relative" aria-label="Notificaciones">
              <Bell className="w-5 h-5 text-ink" strokeWidth={1.5} />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-clay" />
            </Link>
            <div className="flex items-center gap-2">
              <Link to="/cuenta/perfil" className="w-9 h-9 rounded-full bg-cream flex items-center justify-center text-xs font-medium">
                {firstName.charAt(0).toUpperCase() || "·"}
              </Link>
              <button onClick={signOut} title="Cerrar sesión">
                <ChevronDown className="w-4 h-4 text-moss" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-10 space-y-5 lg:space-y-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarBody({ onNavigate, compact, signOut }: { onNavigate?: () => void; compact?: boolean; signOut: () => void }) {
  const { data: modules } = usePortalModules();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = NAV.filter((i) => i.to !== "/cuenta/closet" || modules?.closet);
  return (
    <>
      <div className={compact ? "px-6 pb-2 pt-5" : "px-8 py-8"}>
        <Link to="/" aria-label="Tu Marca" className="block">
          <MarcaLogo className="h-10 w-auto text-foreground" />
        </Link>
      </div>
      <nav className="flex-1 min-h-0 px-4 space-y-1 overflow-y-auto overscroll-contain sidebar-scroll">
        {nav.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            activeOptions={{ exact: "exact" in item ? item.exact : false }}
            onClick={onNavigate}
            className={"w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition text-moss hover:bg-cream/60" + (item.to === "/cuenta/wishlist" && pathname.startsWith("/cuenta/regalos") ? " bg-cream text-ink font-medium" : "")}
            activeProps={{ className: "bg-cream text-ink font-medium" }}
          >
            <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-left">{item.label}</span>
            {"badge" in item && item.badge ? (
              <span className="w-5 h-5 rounded-full bg-clay text-ivory text-[10px] flex items-center justify-center">
                {item.badge}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="shrink-0 border-t border-ink/10">
        <div className="px-6 pt-5 pb-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-cream flex items-center justify-center shrink-0">
            <MessageCircle className="w-4 h-4 text-moss" strokeWidth={1.5} />
          </div>
          <div className="text-xs leading-tight min-w-0">
            <div className="text-ink">¿Necesitas ayuda?</div>
            <div className="text-moss/70 truncate">Escríbenos por WhatsApp</div>
          </div>
        </div>
        <button onClick={signOut} className="flex items-center gap-2 px-6 pb-5 text-xs text-moss hover:text-ink"><LogOut className="size-4" /> Cerrar sesión</button>
      </div>
    </>
  );
}
