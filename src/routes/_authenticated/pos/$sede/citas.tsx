import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WEEKDAYS,
  appointmentsQuery,
  formatTime,
  saveStoreHour,
  storeHoursQuery,
  updateAppointmentStatus,
  type StoreHour,
} from "@/lib/stores";

export const Route = createFileRoute("/_authenticated/pos/$sede/citas")({
  head: () => ({ meta: [
    { title: "Citas en tienda · Tu Marca" },
    { name: "description", content: "Agenda de citas y horarios disponibles de la tienda." },
    { property: "og:title", content: "Citas en tienda · Tu Marca" },
    { property: "og:description", content: "Agenda de citas y horarios disponibles de la tienda." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PosCitas,
});

const STATUSES: { value: string; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "done", label: "Atendida" },
  { value: "cancelled", label: "Cancelada" },
];

function PosCitas() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/citas" });
  const qc = useQueryClient();

  const { data: location } = useQuery({
    queryKey: ["pos-location", sede],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, name").eq("code", sede).maybeSingle();
      return data;
    },
  });
  const locationId = location?.id as string | undefined;

  const { data: appointments = [] } = useQuery(appointmentsQuery(locationId));
  const { data: hours = [] } = useQuery(storeHoursQuery(locationId));

  const todayISO = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(
    () => appointments.filter((a) => a.appointment_date >= todayISO && a.status !== "cancelled"),
    [appointments, todayISO],
  );
  const past = useMemo(
    () => appointments.filter((a) => a.appointment_date < todayISO || a.status === "cancelled"),
    [appointments, todayISO],
  );

  async function setStatus(id: string, status: string) {
    try {
      await updateAppointmentStatus(id, status);
      await qc.invalidateQueries({ queryKey: ["store-appointments", locationId] });
      toast.success("Cita actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  }

  return (
    <div className="p-5 pb-24 md:p-10 max-w-5xl">
      <header className="mb-7 flex items-center gap-3">
        <CalendarDays className="size-6 text-ink" />
        <div>
          <h1 className="font-nm text-2xl">Citas en tienda</h1>
          <p className="text-sm text-moss/80 mt-1">Reservas de clientas y horarios disponibles de {location?.name ?? "la tienda"}.</p>
        </div>
      </header>

      <Tabs defaultValue="agenda">
        <TabsList className="mb-6 bg-ink/5 p-1 w-fit">
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="horarios">Horarios</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="space-y-6">
          <Section title="Próximas citas">
            {upcoming.length === 0 ? (
              <p className="text-sm text-moss/70">Sin citas agendadas.</p>
            ) : (
              upcoming.map((a) => (
                <div key={a.id} className="rounded-lg border border-ink/10 bg-white p-4 flex flex-wrap items-center gap-4">
                  <div className="min-w-[130px]">
                    <p className="font-nm text-sm">{a.appointment_date}</p>
                    <p className="text-xs text-moss/70">{formatTime(a.appointment_time)}</p>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm text-ink">{a.customer_name}</p>
                    <p className="text-xs text-moss/70 flex items-center gap-1">
                      <Phone className="size-3" /> {a.whatsapp} · CC {a.document_id}
                    </p>
                    {a.notes && <p className="text-xs text-moss/60 mt-1">{a.notes}</p>}
                  </div>
                  <select
                    value={a.status}
                    onChange={(e) => setStatus(a.id, e.target.value)}
                    className="px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm"
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
              ))
            )}
          </Section>

          <Section title="Historial">
            {past.length === 0 ? (
              <p className="text-sm text-moss/70">Aún no hay historial.</p>
            ) : (
              past.map((a) => (
                <div key={a.id} className="rounded-lg border border-ink/10 bg-white/60 p-3 flex flex-wrap gap-3 text-sm">
                  <span className="min-w-[130px] text-moss/80">{a.appointment_date} · {formatTime(a.appointment_time)}</span>
                  <span className="flex-1 text-ink/80">{a.customer_name} · {a.whatsapp}</span>
                  <span className="text-xs uppercase tracking-widest text-moss/70">
                    {STATUSES.find((s) => s.value === a.status)?.label ?? a.status}
                  </span>
                </div>
              ))
            )}
          </Section>
        </TabsContent>

        <TabsContent value="horarios">
          {locationId && <HoursEditor locationId={locationId} hours={hours} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[10px] uppercase tracking-widest text-moss/70">{title}</h2>
      {children}
    </section>
  );
}

function HoursEditor({ locationId, hours }: { locationId: string; hours: StoreHour[] }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Partial<StoreHour>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(
      WEEKDAYS.map((_, weekday) => {
        const found = hours.find((h) => h.weekday === weekday);
        return found ?? { location_id: locationId, weekday, start_time: "10:00", end_time: "18:00", slot_minutes: 45, active: false };
      }),
    );
  }, [hours, locationId]);

  const patch = (weekday: number, p: Partial<StoreHour>) =>
    setRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...p } : r)));

  async function save() {
    setSaving(true);
    try {
      for (const r of rows) {
        await saveStoreHour({
          location_id: locationId,
          weekday: r.weekday!,
          start_time: (r.start_time ?? "10:00").slice(0, 5),
          end_time: (r.end_time ?? "18:00").slice(0, 5),
          slot_minutes: Number(r.slot_minutes ?? 45),
          active: !!r.active,
        });
      }
      await qc.invalidateQueries({ queryKey: ["store-hours"] });
      toast.success("Horarios guardados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-moss/80">Define qué días atiendes citas, en qué franja y cuánto dura cada cita.</p>
      {rows.map((r) => (
        <div key={r.weekday} className="rounded-lg border border-ink/10 bg-white p-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 min-w-[150px]">
            <Switch checked={!!r.active} onCheckedChange={(v) => patch(r.weekday!, { active: v })} />
            <span className="text-sm">{WEEKDAYS[r.weekday!]}</span>
          </div>
          <label className="text-xs text-moss/70 flex items-center gap-2">
            Desde
            <input
              type="time"
              value={(r.start_time ?? "10:00").slice(0, 5)}
              onChange={(e) => patch(r.weekday!, { start_time: e.target.value })}
              className="px-2 py-1.5 rounded-lg bg-white border border-ink/10 text-sm text-ink"
            />
          </label>
          <label className="text-xs text-moss/70 flex items-center gap-2">
            Hasta
            <input
              type="time"
              value={(r.end_time ?? "18:00").slice(0, 5)}
              onChange={(e) => patch(r.weekday!, { end_time: e.target.value })}
              className="px-2 py-1.5 rounded-lg bg-white border border-ink/10 text-sm text-ink"
            />
          </label>
          <label className="text-xs text-moss/70 flex items-center gap-2">
            Duración (min)
            <input
              type="number"
              min={10}
              step={5}
              value={r.slot_minutes ?? 45}
              onChange={(e) => patch(r.weekday!, { slot_minutes: Number(e.target.value) })}
              className="w-20 px-2 py-1.5 rounded-lg bg-white border border-ink/10 text-sm text-ink"
            />
          </label>
        </div>
      ))}
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar horarios"}</Button>
      </div>
    </div>
  );
}
