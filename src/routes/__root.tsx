import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { ReadyProvider } from "@/components/ready/ready-provider";
import { ReadyWidget } from "@/components/ready/ready-widget";
import { CheckoutSheet } from "@/components/checkout/checkout-sheet";
import { Toaster } from "@/components/ui/sonner";
import { VersionWatcher } from "@/components/version-watcher";
import { PageTranslator } from "@/components/storefront/page-translator";
import { TryOnProvider } from "@/lib/tryon/tryon-jobs";
import { CookieConsent } from "@/components/storefront/cookie-consent";
import { useRealtimeSync } from "@/lib/realtime";
import { ComingSoonGate } from "@/lib/coming-soon";
import { trackPageView } from "@/lib/analytics";
import { isStorefrontVisitorPath } from "@/lib/live-visitors";
import { useLiveVisitors } from "@/lib/use-live-visitors";
import { RegionAccessGate } from "@/lib/region-access";
import { getVisitorGeo } from "@/lib/analytics.functions";
import { installBrowserTranslationGuard } from "@/lib/browser-translation-guard";
import { SignupDiscountPopup } from "@/components/storefront/signup-discount-popup";
import { SEO_DEFAULT_DESCRIPTION, SEO_DEFAULT_TITLE, SEO_KEYWORDS } from "@/lib/seo";
import { BRAND } from "@/config/brand";

// Client module evaluation precedes hydration; the utility is a no-op during SSR.
installBrowserTranslationGuard();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: import("@tanstack/react-router").ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    const msg = String((error as any)?.message ?? "");
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|reading 'component'|reading "component"/i.test(msg)) {
      const last = Number(sessionStorage.getItem("tb-chunk-reload") || 0);
      if (Date.now() - last > 15000) {
        sessionStorage.setItem("tb-chunk-reload", String(Date.now()));
        window.location.reload();
        return;
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SEO_DEFAULT_TITLE },
      { name: "description", content: SEO_DEFAULT_DESCRIPTION },
      { name: "keywords", content: SEO_KEYWORDS },
      { name: "author", content: BRAND.name },
      { property: "og:title", content: SEO_DEFAULT_TITLE },
      { property: "og:description", content: SEO_DEFAULT_DESCRIPTION },
      { property: "og:locale", content: "es_CO" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: BRAND.name },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    scripts: !BRAND.metaPixelId ? [] : [
      {
        type: "text/javascript",
        // Meta Pixel (VITE_META_PIXEL_ID) — init base. El PageView por navegación lo
        // emite PageViewBridge vía track("page_view") para no duplicar el
        // primer PageView (el snippet oficial lo duplica en SPAs).
        children: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${BRAND.metaPixelId}');`,
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.cdnfonts.com/css/neue-montreal",
      },
    ],
  }),
  loader: async () => {
    try { return { geo: await getVisitorGeo() }; } catch { return { geo: null }; }
  },
  staleTime: Infinity,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {BRAND.metaPixelId && (
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${BRAND.metaPixelId}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        )}
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isLogin = useRouterState({ select: (s) => s.location.pathname === "/auth" });
  const router = useRouter();
  const { geo } = Route.useLoaderData();

  // El modo oscuro queda desactivado incluso para quienes lo habían guardado.
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
    try { window.localStorage.removeItem("tb-theme-v1"); } catch { /* ignore */ }
  }, []);

  // Tras una actualización, piezas antiguas de la página pueden no existir: recarga una sola vez.
  useEffect(() => {
    const KEY = "tb-chunk-reload";
    const retry = (msg: string) => {
      if (!/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|reading 'component'|reading "component"/i.test(msg)) return;
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 15000) return;
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    };
    const onPreload = (e: Event) => { e.preventDefault(); retry("Failed to fetch dynamically imported module"); };
    const onRejection = (e: PromiseRejectionEvent) => retry(String(e.reason?.message ?? e.reason ?? ""));
    const onError = (e: ErrorEvent) => retry(String(e.message ?? ""));
    window.addEventListener("vite:preloadError", onPreload);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("vite:preloadError", onPreload);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeBridge />
      <PageViewBridge />
      <ReadyProvider>
        <TryOnProvider>
          <RegionAccessGate geo={geo}><ComingSoonGate><Outlet /><SignupDiscountPopup /></ComingSoonGate></RegionAccessGate>
          <CheckoutSheet />
           {!isLogin && <ReadyWidget />}
        </TryOnProvider>
      </ReadyProvider>
      {!isLogin && <CookieConsent />}
      <Toaster richColors position="top-center" />
      <VersionWatcher />
      <PageTranslator />
    </QueryClientProvider>
  );
}

function PageViewBridge() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useLiveVisitors(true, isStorefrontVisitorPath(pathname));
  useEffect(() => { trackPageView(pathname); }, [pathname]);
  return null;
}

function RealtimeBridge() {
  useRealtimeSync();
  return null;
}
