import { supabase } from "@/integrations/supabase/client";
import { getVisitorGeo } from "@/lib/analytics.functions";
import { BATCH_INTERVAL_MS, BATCH_MAX_EVENTS, SERVER_MAX_EVENTS, isImmediate, shouldFlush } from "@/lib/analytics-batch.js";

/** Eventos propios del embudo Tu Marca + equivalentes estándar de plataformas. */
export type ZlEvent =
  | "page_view"
  | "product_view"
  | "color_selected"
  | "size_selected"
  | "fit_viewed"
  | "ready_assisted"
  | "look_opened"
  | "cross_sell_selected"
  | "selection_added"
  | "checkout_started"
  | "shipping_completed"
  | "payment_started"
  | "purchase"
  | "lookbook_started"
  | "lookbook_25"
  | "lookbook_50"
  | "lookbook_75"
  | "lookbook_completed"
  | "quick_buy_opened"
  | "checkout_exit_intent"
  | "checkout_exit_recovered"
  | "checkout_abandon_reason"
  | "lookbook_gallery_interaction";

const STANDARD: Partial<Record<ZlEvent, string>> = {
  page_view: "PageView",
  product_view: "ViewContent",
  selection_added: "AddToCart",
  checkout_started: "InitiateCheckout",
  shipping_completed: "AddShippingInfo",
  payment_started: "AddPaymentInfo",
  purchase: "Purchase",
};

const SESSION_KEY = "tb-analytics-session";
const ORIGIN_KEY = "tb-analytics-origin";
const GEO_KEY = "tb-analytics-geo";

function sessionId() {
  if (typeof window === "undefined") return "ssr";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Sesión de navegación anónima, para vincular pedidos de invitadas con su recorrido. */
export function analyticsSessionId() {
  const id = sessionId();
  return id === "ssr" ? null : id;
}

type Origin = {
  referrer: string;
  referrer_host: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
};

/** Primera fuente de la sesión: referente + campaña. Se guarda una sola vez. */
function origin(): Origin {
  const empty: Origin = { referrer: "", referrer_host: "", utm_source: "", utm_medium: "", utm_campaign: "" };
  if (typeof window === "undefined") return empty;
  try {
    const stored = window.sessionStorage.getItem(ORIGIN_KEY);
    if (stored) return { ...empty, ...(JSON.parse(stored) as Partial<Origin>) };
  } catch { /* noop */ }

  const params = new URLSearchParams(window.location.search);
  const ref = document.referrer || "";
  let host = "";
  try { host = ref ? new URL(ref).hostname.replace(/^www\./, "") : ""; } catch { /* noop */ }
  if (host && host === window.location.hostname.replace(/^www\./, "")) host = "";

  const value: Origin = {
    referrer: ref,
    referrer_host: host,
    utm_source: params.get("utm_source") ?? (host ? host : ""),
    utm_medium: params.get("utm_medium") ?? "",
    utm_campaign: params.get("utm_campaign") ?? "",
  };
  try { window.sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(value)); } catch { /* noop */ }
  return value;
}

function device(): string {
  if (typeof window === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "Tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "Móvil";
  return "Escritorio";
}

let geoPromise: Promise<{ country: string; city: string }> | null = null;
async function geo() {
  if (typeof window === "undefined") return { country: "", city: "" };
  try {
    const cached = window.sessionStorage.getItem(GEO_KEY);
    if (cached) return JSON.parse(cached) as { country: string; city: string };
  } catch { /* noop */ }
  geoPromise ??= getVisitorGeo()
    .then((g) => {
      try { window.sessionStorage.setItem(GEO_KEY, JSON.stringify(g)); } catch { /* noop */ }
      return g;
    })
    .catch(() => ({ country: "", city: "" }));
  return geoPromise;
}

/** Registra un evento del embudo. Nunca interrumpe la experiencia si falla. */
export function track(name: ZlEvent, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const std = STANDARD[name];
  if (std) {
    // event_id permite que Meta deduplique el evento del navegador con el de la Conversions API.
    const eventID = typeof payload.event_id === "string" ? payload.event_id : undefined;
    (window as any).fbq?.("track", std, payload, eventID ? { eventID } : undefined);
    (window as any).gtag?.("event", std, payload);
  }
  (window as any).dataLayer?.push?.({ event: name, ...payload });

  const immediate = isImmediate(name);
  void (async () => {
    try {
      const [{ data }, place] = await Promise.all([supabase.auth.getSession(), geo()]);
      const src = origin();
      const row = {
        name,
        session_id: sessionId(),
        path: window.location.pathname,
        payload: payload as any,
        device: device(),
        country: place.country || null,
        city: place.city || null,
        referrer: src.referrer || null,
        referrer_host: src.referrer_host || null,
        utm_source: src.utm_source || null,
        utm_medium: src.utm_medium || null,
        utm_campaign: src.utm_campaign || null,
      };
      if (!immediate) {
        enqueue({ ...row, created_at: new Date().toISOString() }, data.session?.access_token ?? null);
        return;
      }
      await supabase.from("analytics_events").insert({ ...row, user_id: data.session?.user.id ?? null } as any);
    } catch {
      /* la analítica nunca bloquea la compra */
    }
  })();
}

// ---- Lote de eventos de navegación ----
const QUEUE_KEY = "tb-analytics-queue";
let queue: Record<string, unknown>[] = [];
let lastToken: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function persist() {
  try { window.sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* noop */ }
}

function enqueue(row: Record<string, unknown>, token: string | null) {
  if (!listening) {
    listening = true;
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(QUEUE_KEY) || "[]");
      if (Array.isArray(saved)) queue = saved.slice(-BATCH_MAX_EVENTS * 2).concat(queue);
    } catch { /* noop */ }
    const onHide = () => { if (document.visibilityState === "hidden") flush(true); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", () => flush(true));
  }
  lastToken = token;
  queue.push(row);
  persist();
  if (shouldFlush(queue.length)) flush(false);
  else if (!timer) timer = setTimeout(() => flush(false), BATCH_INTERVAL_MS);
}

function flush(useBeacon: boolean) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return;
  const events = queue.splice(0, SERVER_MAX_EVENTS);
  persist();
  const body = JSON.stringify({ token: lastToken, events });
  const url = "/api/public/analytics/batch";
  if (useBeacon && navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) {
    if (queue.length) flush(true);
    return;
  }
  void fetch(url, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => {});
  if (queue.length) timer = setTimeout(() => flush(false), 1_000);
}

/** Registra la visita a una página pública (excluye admin/POS). */
export function trackPageView(path: string) {
  if (/^\/(admin|pos|auth)/.test(path)) return;
  track("page_view", { path });
}
