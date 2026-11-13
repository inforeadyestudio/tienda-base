import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";
import {
  bookedSlotsQuery,
  formatTime,
  requestAppointment,
  slotsForDate,
  storeHoursQuery,
  type StoreProfile,
} from "@/lib/stores";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

function isoOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AppointmentModal({ store, onClose }: { store: StoreProfile; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [document, setDocument] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const { data: hours = [] } = useQuery(storeHoursQuery(store.location_id));
  const { data: booked = [] } = useQuery(bookedSlotsQuery(store.location_id));

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let d = 1; d <= total; d += 1) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return cells;
  }, [cursor]);

  const todayISO = isoOf(today);
  const slots = date ? slotsForDate(date, hours, booked) : [];

  function dayEnabled(d: Date) {
    const iso = isoOf(d);
    if (iso < todayISO) return false;
    return slotsForDate(iso, hours, booked).length > 0;
  }

  async function submit() {
    if (!date || !time) return toast.error("Elige día y hora");
    if (!name.trim() || !whatsapp.trim() || !document.trim()) return toast.error("Completa nombre, WhatsApp y cédula");
    setSaving(true);
    try {
      await requestAppointment({
        location_id: store.location_id,
        customer_name: name.trim(),
        whatsapp: whatsapp.trim(),
        document_id: document.trim(),
        appointment_date: date,
        appointment_time: time,
        notes: notes.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ["store-booked", store.location_id] });
      setDone(true);
    } catch (e: any) {
      toast.error(e?.message?.includes("duplicate") ? "Ese horario acaba de reservarse" : "No pudimos agendar tu cita");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-end justify-center bg-ink/60 backdrop-blur-sm md:items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="max-h-[92svh] w-full max-w-lg overflow-y-auto bg-ivory p-6 shadow-2xl md:rounded-none"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-nm text-[10px] uppercase tracking-[0.28em] text-moss/60">Cita privada</p>
              <h2 className="mt-1 font-serif text-2xl italic text-ink">{store.name}</h2>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 text-ink/60 hover:text-ink">
              <X className="h-5 w-5" />
            </button>
          </div>

          {done ? (
            <div className="py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss/15 text-moss">
                <Check className="h-6 w-6" />
              </div>
              <p className="mt-4 font-serif text-xl italic text-ink">Tu cita quedó solicitada</p>
              <p className="mt-2 text-sm text-moss">
                {date} · {time && formatTime(time)} en {store.name}. Te confirmamos por WhatsApp.
              </p>
              <button
                onClick={onClose}
                className="mt-6 border-b border-ink pb-1 font-nm text-[10px] uppercase tracking-[0.25em]"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                  className="p-1 text-ink/60 hover:text-ink"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="font-nm text-[11px] uppercase tracking-[0.2em] text-ink">
                  {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
                </p>
                <button
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                  className="p-1 text-ink/60 hover:text-ink"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-7 gap-1 text-center">
                {DAY_LABELS.map((d, i) => (
                  <span key={i} className="font-nm text-[9px] uppercase tracking-[0.15em] text-moss/50">
                    {d}
                  </span>
                ))}
                {days.map((d, i) =>
                  d ? (
                    <button
                      key={i}
                      disabled={!dayEnabled(d)}
                      onClick={() => {
                        setDate(isoOf(d));
                        setTime(null);
                      }}
                      className={`aspect-square text-[12px] transition-colors ${
                        date === isoOf(d)
                          ? "bg-ink text-ivory"
                          : dayEnabled(d)
                            ? "text-ink hover:bg-ink/10"
                            : "text-ink/20"
                      }`}
                    >
                      {d.getDate()}
                    </button>
                  ) : (
                    <span key={i} />
                  ),
                )}
              </div>

              {date && (
                <div className="mt-5">
                  <p className="font-nm text-[10px] uppercase tracking-[0.2em] text-moss/60">Horarios disponibles</p>
                  {slots.length === 0 ? (
                    <p className="mt-2 text-sm text-moss">No hay cupos ese día.</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {slots.map((s) => (
                        <button
                          key={s}
                          onClick={() => setTime(s)}
                          className={`border px-3 py-1.5 font-nm text-[10px] uppercase tracking-[0.12em] ${
                            time === s ? "border-ink bg-ink text-ivory" : "border-ink/20 text-ink hover:border-ink"
                          }`}
                        >
                          {formatTime(s)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 space-y-3">
                <Input label="Nombre completo" value={name} onChange={setName} />
                <Input label="WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="+57 300 000 0000" />
                <Input label="Cédula" value={document} onChange={setDocument} />
                <Input label="Nota (opcional)" value={notes} onChange={setNotes} placeholder="Qué te gustaría ver" />
              </div>

              <button
                onClick={submit}
                disabled={saving}
                className="mt-6 w-full bg-ink py-3 font-nm text-[10px] uppercase tracking-[0.25em] text-ivory disabled:opacity-50"
              >
                {saving ? "Agendando…" : "Solicitar cita"}
              </button>
              <p className="mt-3 text-center text-[11px] text-moss/60">
                Confirmamos tu cita por WhatsApp antes de la visita.
              </p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-nm text-[9px] uppercase tracking-[0.2em] text-moss/60">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border-b border-ink/20 bg-transparent pb-1.5 text-[14px] text-ink outline-none focus:border-ink"
      />
    </label>
  );
}
