import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export type StoreProfile = {
  location_id: string;
  code: string;
  name: string;
  photo_url: string | null;
  gallery_urls: string[];
  address: string;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  hours_note: string | null;
  lat: number | null;
  lng: number | null;
  map_query: string | null;
  visible: boolean;
  position: number;
};

export type StoreHour = {
  id: string;
  location_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  active: boolean;
};

export type StoreAppointment = {
  id: string;
  location_id: string;
  customer_name: string;
  whatsapp: string;
  document_id: string;
  email: string | null;
  appointment_date: string;
  appointment_time: string;
  notes: string | null;
  status: string;
  created_at: string;
};

export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export function mapEmbedUrl(store: Pick<StoreProfile, "lat" | "lng" | "map_query" | "address" | "city" | "name">) {
  if (store.lat != null && store.lng != null) {
    const d = 0.006;
    const bbox = `${store.lng - d}%2C${store.lat - d}%2C${store.lng + d}%2C${store.lat + d}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${store.lat}%2C${store.lng}`;
  }
  const q = encodeURIComponent(store.map_query || [store.address, store.city].filter(Boolean).join(", ") || store.name);
  return `https://maps.google.com/maps?q=${q}&output=embed`;
}

export function mapLinkUrl(store: Pick<StoreProfile, "lat" | "lng" | "map_query" | "address" | "city" | "name">) {
  if (store.lat != null && store.lng != null) return `https://www.google.com/maps?q=${store.lat},${store.lng}`;
  const q = encodeURIComponent(store.map_query || [store.address, store.city].filter(Boolean).join(", ") || store.name);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function rowToStore(row: any): StoreProfile {
  return {
    location_id: row.location_id,
    code: row.locations?.code ?? "",
    name: row.locations?.name ?? "Tienda",
    photo_url: row.photo_url ?? null,
    gallery_urls: Array.isArray(row.gallery_urls) ? row.gallery_urls.filter((url: unknown): url is string => typeof url === "string") : [],
    address: row.address ?? "",
    city: row.city ?? row.locations?.city ?? null,
    phone: row.phone ?? null,
    whatsapp: row.whatsapp ?? null,
    hours_note: row.hours_note ?? null,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    map_query: row.map_query ?? null,
    visible: row.visible !== false,
    position: row.position ?? 0,
  };
}

async function fetchStores(): Promise<StoreProfile[]> {
  const { data, error } = await supabase
    .from("store_profiles")
    .select("*, locations!inner(code, name, city, kind)")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToStore);
}

export const storesQuery = () =>
  queryOptions({ queryKey: ["store-profiles"], staleTime: 60_000, queryFn: fetchStores });

export const storeHoursQuery = (locationId?: string) =>
  queryOptions({
    queryKey: ["store-hours", locationId ?? "all"],
    staleTime: 60_000,
    queryFn: async (): Promise<StoreHour[]> => {
      let q = supabase.from("store_hours").select("*").order("weekday", { ascending: true });
      if (locationId) q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StoreHour[];
    },
  });

/** Citas ya reservadas de una tienda a partir de hoy (para bloquear cupos). */
export const bookedSlotsQuery = (locationId?: string) =>
  queryOptions({
    queryKey: ["store-booked", locationId ?? "none"],
    enabled: !!locationId,
    staleTime: 15_000,
    queryFn: async (): Promise<{ appointment_date: string; appointment_time: string; status: string }[]> => {
      const { data, error } = await (supabase.rpc as any)("store_booked_slots", { _location_id: locationId! });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

export function toMinutes(time: string) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fromMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTime(time: string) {
  const mins = toMinutes(time);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Genera los cupos de un día según el horario configurado, descartando los ya reservados. */
export function slotsForDate(
  dateISO: string,
  hours: StoreHour[],
  booked: { appointment_date: string; appointment_time: string; status: string }[],
): string[] {
  const weekday = new Date(`${dateISO}T12:00:00`).getDay();
  const rule = hours.find((h) => h.weekday === weekday && h.active);
  if (!rule) return [];
  const step = Math.max(10, rule.slot_minutes || 45);
  const start = toMinutes(rule.start_time);
  const end = toMinutes(rule.end_time);
  const taken = new Set(
    booked
      .filter((b) => b.appointment_date === dateISO && b.status !== "cancelled")
      .map((b) => b.appointment_time.slice(0, 5)),
  );
  const nowISO = new Date().toISOString().slice(0, 10);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const out: string[] = [];
  for (let t = start; t + step <= end; t += step) {
    const label = fromMinutes(t);
    if (taken.has(label)) continue;
    if (dateISO === nowISO && t <= nowMinutes) continue;
    out.push(label);
  }
  return out;
}

export async function requestAppointment(input: {
  location_id: string;
  customer_name: string;
  whatsapp: string;
  document_id: string;
  email?: string | null;
  appointment_date: string;
  appointment_time: string;
  notes?: string | null;
}) {
  const { error } = await supabase.from("store_appointments").insert({
    ...input,
    appointment_time: `${input.appointment_time}:00`,
    status: "pending",
  } as any);
  if (error) throw error;
}

export const appointmentsQuery = (locationId?: string) =>
  queryOptions({
    queryKey: ["store-appointments", locationId ?? "all"],
    enabled: !!locationId,
    staleTime: 10_000,
    queryFn: async (): Promise<StoreAppointment[]> => {
      const { data, error } = await supabase
        .from("store_appointments")
        .select("*")
        .eq("location_id", locationId!)
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as StoreAppointment[];
    },
  });

export async function updateAppointmentStatus(id: string, status: string) {
  const { error } = await supabase.from("store_appointments").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function saveStoreHour(row: Partial<StoreHour> & { location_id: string; weekday: number }) {
  const { error } = await supabase
    .from("store_hours")
    .upsert(row as any, { onConflict: "location_id,weekday" });
  if (error) throw error;
}

export async function saveStoreProfile(locationId: string, changes: Partial<StoreProfile>) {
  const { location_id: _a, code: _b, name: _c, ...rest } = changes as any;
  const { error } = await supabase
    .from("store_profiles")
    .upsert({ location_id: locationId, ...rest }, { onConflict: "location_id" });
  if (error) throw error;
}
