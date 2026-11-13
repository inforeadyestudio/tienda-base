import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { X, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-hooks";
import { myFitHistoryQuery, myFitProfileQuery } from "@/lib/queries";
import {
  measuresFromSpec,
  parseFitSpec,
  recommendSize,
  sizeFromHistory,
  type FitPreference,
  type FitResult,
} from "@/lib/fit/engine";

const EASE = [0.22, 1, 0.36, 1] as const;

const PREFERENCES: { key: FitPreference; title: string; sub: string; art: string }[] = [
  { key: "fitted", title: "Ajustado", sub: "Más cerca del cuerpo", art: "M22 6h16l-3 40H25z" },
  { key: "model", title: "Como en la modelo", sub: "El fit pensado para esta pieza", art: "M18 6h24l-5 40H23z" },
  { key: "relaxed", title: "Más relajado", sub: "Un poco más de espacio", art: "M14 6h32l-7 40H21z" },
];

const USUAL_SIZES = ["XS", "S", "M", "L", "XL"];
const BRANDS = ["Tu Marca", "Zara", "Mango", "Otra"];

type Props = {
  open: boolean;
  onClose: () => void;
  productName: string;
  imageUrl?: string | null;
  fitSpec: unknown;
  sizes: string[];
  onPickSize: (size: string) => void;
};

export function SizeFinder({ open, onClose, productName, imageUrl, fitSpec, sizes, onPickSize }: Props) {
  const spec = useMemo(() => parseFitSpec(fitSpec), [fitSpec]);
  const measures = measuresFromSpec(spec);
  const { user } = useSession();
  const { data: history } = useQuery({ ...myFitHistoryQuery(), enabled: Boolean(user) && open });
  const { data: profile } = useQuery({ ...myFitProfileQuery(), enabled: Boolean(user) && open });

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"wizard" | "known">("wizard");
  const [height, setHeight] = useState("168");
  const [weight, setWeight] = useState("60");
  const [knowsMeasures, setKnowsMeasures] = useState<boolean | null>(null);
  const [bust, setBust] = useState("");
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");
  const [preference, setPreference] = useState<FitPreference>("model");
  const [usualSize, setUsualSize] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [result, setResult] = useState<FitResult | null>(null);

  const historyTop = useMemo(() => sizeFromHistory((history ?? []) as { size: string | null }[]), [history]);

  // Precarga con el perfil guardado y salta el wizard si ya la conocemos.
  useEffect(() => {
    if (!open) return;
    if (profile) {
      if (profile.height_cm) setHeight(String(profile.height_cm));
      if (profile.weight_kg) setWeight(String(profile.weight_kg));
      if (profile.bust_cm) setBust(String(profile.bust_cm));
      if (profile.waist_cm) setWaist(String(profile.waist_cm));
      if (profile.hip_cm) setHip(String(profile.hip_cm));
      if (profile.fit_preference) setPreference(profile.fit_preference as FitPreference);
      if (profile.usual_size) setUsualSize(profile.usual_size);
      if (profile.usual_brand) setBrand(profile.usual_brand);
    }
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    if (historyTop && historyTop.n >= 2) setMode("known");
  }, [open, historyTop]);

  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStep(0);
      setResult(null);
      setMode("wizard");
      setKnowsMeasures(null);
    }, 260);
    return () => clearTimeout(t);
  }, [open]);

  const compute = () => {
    const body = {
      height_cm: Number(height) || null,
      weight_kg: Number(weight) || null,
      bust_cm: knowsMeasures ? Number(bust) || null : null,
      waist_cm: knowsMeasures ? Number(waist) || null : null,
      hip_cm: knowsMeasures ? Number(hip) || null : null,
      preference,
      usual_size: usualSize || historyTop?.size || null,
      usual_brand: brand || null,
    };
    setResult(recommendSize(spec, body, sizes));
    setStep(4);
    void persist(body);
  };

  const persist = async (body: {
    height_cm: number | null;
    weight_kg: number | null;
    bust_cm: number | null;
    waist_cm: number | null;
    hip_cm: number | null;
    preference: FitPreference;
    usual_size: string | null;
    usual_brand: string | null;
  }) => {
    if (!user) return;
    await (supabase as any).from("fit_profiles").upsert(
      {
        user_id: user.id,
        height_cm: body.height_cm,
        weight_kg: body.weight_kg,
        bust_cm: body.bust_cm,
        waist_cm: body.waist_cm,
        hip_cm: body.hip_cm,
        fit_preference: body.preference,
        usual_size: body.usual_size,
        usual_brand: body.usual_brand,
      },
      { onConflict: "user_id" },
    );
  };

  const knownResult = useMemo(() => {
    if (!historyTop) return null;
    return recommendSize(spec, { preference: "model", usual_size: historyTop.size, usual_brand: "Tu Marca" }, sizes);
  }, [historyTop, spec, sizes]);

  const canContinue =
    step === 0
      ? Boolean(Number(height) && Number(weight))
      : step === 1
        ? knowsMeasures !== null
        : true;

  const next = () => (step === 3 ? compute() : setStep((s) => Math.min(3, s + 1)));

  const pick = (size: string | null) => {
    if (size) onPickSize(size);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] flex items-end md:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: "8%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "6%", opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="relative w-full md:w-[min(980px,92vw)] h-[92vh] md:h-[min(640px,88vh)] bg-ivory overflow-hidden flex"
          >
            {/* Fotografía visible mientras responde (solo desktop) */}
            {imageUrl && (
              <div className="hidden md:block w-[38%] shrink-0 bg-[#e9e6df]">
                <img src={imageUrl} alt={productName} className="size-full object-cover" loading="lazy" />
              </div>
            )}

            <div className="flex-1 flex flex-col min-w-0">
              <header className="flex items-center justify-between px-6 md:px-10 pt-6">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/70">Encuentra tu talla</p>
                <div className="flex items-center gap-4">
                  {step < 4 && mode === "wizard" && (
                    <span className="font-mono text-[10px] tracking-[0.2em] text-ink/45">
                      0{step + 1}/04
                    </span>
                  )}
                  <button onClick={onClose} aria-label="Cerrar">
                    <X className="size-4 text-ink/60 hover:text-ink" />
                  </button>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto px-6 md:px-12 py-8">
                <AnimatePresence mode="wait" initial={false}>
                  {mode === "known" && step < 4 ? (
                    <Slide key="known">
                      <h2 className="font-serif text-[clamp(1.6rem,3.4vw,2.4rem)] leading-[1.05]">
                        Creemos que eres {knownResult?.size ?? historyTop?.size} en esta pieza.
                      </h2>
                      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">
                        Tus últimas compras
                      </p>
                      <ul className="mt-3 space-y-2">
                        {(history ?? []).slice(0, 4).map((h: any, i: number) => (
                          <li key={i} className="flex justify-between border-b border-ink/10 pb-2 font-serif text-[14px]">
                            <span>{h.name}</span>
                            <span className="font-mono text-[11px] tracking-[0.16em]">{h.size}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-6 font-serif text-[14px] text-ink/70">{knownResult?.fitLine}</p>
                      <div className="mt-8 flex flex-col gap-3">
                        <button
                          onClick={() => pick(knownResult?.size ?? historyTop?.size ?? null)}
                          className="w-full bg-ink text-ivory py-4 font-mono text-[10px] uppercase tracking-[0.24em] hover:bg-moss transition-colors"
                        >
                          Usar {knownResult?.size ?? historyTop?.size}
                        </button>
                        <button
                          onClick={() => {
                            setMode("wizard");
                            setStep(0);
                          }}
                          className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/55 underline hover:text-ink"
                        >
                          Quiero calcularla nuevamente
                        </button>
                      </div>
                    </Slide>
                  ) : step === 0 ? (
                    <Slide key="s0">
                      <Title>¿Cómo eres?</Title>
                      <Sub>Dos datos rápidos para empezar.</Sub>
                      <div className="mt-10 space-y-8 max-w-sm">
                        <BigField label="Altura" unit="cm" value={height} onChange={setHeight} />
                        <BigField label="Peso" unit="kg" value={weight} onChange={setWeight} />
                      </div>
                    </Slide>
                  ) : step === 1 ? (
                    <Slide key="s1">
                      <Title>Tus medidas</Title>
                      <Sub>Solo lo relevante para esta pieza. Si no las sabes, seguimos igual.</Sub>
                      <div className="mt-8 flex gap-3">
                        <Chip active={knowsMeasures === true} onClick={() => setKnowsMeasures(true)}>
                          Tengo mis medidas
                        </Chip>
                        <Chip active={knowsMeasures === false} onClick={() => setKnowsMeasures(false)}>
                          No las sé
                        </Chip>
                      </div>
                      {knowsMeasures && (
                        <div className="mt-10 space-y-8 max-w-sm">
                          {measures.includes("bust") && <BigField label="Busto" unit="cm" value={bust} onChange={setBust} />}
                          {measures.includes("waist") && <BigField label="Cintura" unit="cm" value={waist} onChange={setWaist} />}
                          {measures.includes("hip") && <BigField label="Cadera" unit="cm" value={hip} onChange={setHip} />}
                        </div>
                      )}
                    </Slide>
                  ) : step === 2 ? (
                    <Slide key="s2">
                      <Title>¿Cómo prefieres llevarlo?</Title>
                      <div className="mt-10 grid grid-cols-3 gap-3 md:gap-5">
                        {PREFERENCES.map((p) => {
                          const active = preference === p.key;
                          return (
                            <button
                              key={p.key}
                              onClick={() => setPreference(p.key)}
                              className={
                                "group text-left border transition-colors p-3 md:p-4 " +
                                (active ? "border-ink bg-white" : "border-ink/15 hover:border-ink/40")
                              }
                            >
                              <svg viewBox="0 0 60 56" className="w-full h-20 md:h-28">
                                <path d={p.art} className={active ? "fill-ink/85" : "fill-ink/20"} />
                              </svg>
                              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em]">{p.title}</p>
                              <p className="mt-1 font-serif text-[11px] leading-snug text-ink/55">{p.sub}</p>
                              <span
                                className={
                                  "mt-3 block size-1.5 rounded-full " + (active ? "bg-ink" : "bg-transparent")
                                }
                              />
                            </button>
                          );
                        })}
                      </div>
                    </Slide>
                  ) : step === 3 ? (
                    <Slide key="s3">
                      <Title>Una referencia</Title>
                      <Sub>¿Qué talla compras normalmente?</Sub>
                      <div className="mt-8 flex flex-wrap gap-2">
                        {USUAL_SIZES.map((s) => (
                          <Chip key={s} active={usualSize === s} onClick={() => setUsualSize(s)}>
                            {s}
                          </Chip>
                        ))}
                      </div>
                      <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.2em] text-ink/45">¿En qué marca?</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {BRANDS.map((b) => (
                          <Chip key={b} active={brand === b} onClick={() => setBrand(b)}>
                            {b}
                          </Chip>
                        ))}
                      </div>
                    </Slide>
                  ) : (
                    <Slide key="result">
                      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink/50">Tu talla recomendada</p>
                      <p className="mt-2 font-serif text-[clamp(3.4rem,10vw,5.5rem)] leading-[0.9]">{result?.size ?? "—"}</p>
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-moss">
                        <Check className="mr-1 inline size-3.5" strokeWidth={2.5} />
                        {result?.confidenceLabel}
                      </p>
                      <p className="mt-5 max-w-md font-serif text-[14px] leading-relaxed text-ink/75">
                        {result?.fitLine} {result?.reason}
                      </p>
                      {spec.fit_notes && (
                        <p className="mt-2 max-w-md font-serif text-[13px] leading-relaxed text-ink/55">{spec.fit_notes}</p>
                      )}
                      <ul className="mt-8 max-w-sm divide-y divide-ink/10 border-y border-ink/10">
                        {(result?.ladder ?? []).map((l) => (
                          <li
                            key={l.size}
                            className={"flex items-center justify-between py-3 " + (l.recommended ? "" : "text-ink/50")}
                          >
                            <span className="font-mono text-[12px] tracking-[0.18em]">{l.size}</span>
                            <span className="font-serif text-[13px]">
                              {l.note} {l.recommended && <Check className="ml-1 inline size-3.5 text-moss" strokeWidth={2.5} />}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Slide>
                  )}
                </AnimatePresence>
              </div>

              {mode === "wizard" && (
                <footer className="border-t border-ink/10 px-6 md:px-12 py-5 flex items-center justify-between gap-4">
                  {step > 0 ? (
                    <button
                      onClick={() => setStep((s) => Math.max(0, s - 1))}
                      className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/55 hover:text-ink"
                    >
                      <ArrowLeft className="mr-1 inline size-3.5" /> Volver
                    </button>
                  ) : (
                    <span />
                  )}
                  {step < 4 ? (
                    <button
                      disabled={!canContinue}
                      onClick={next}
                      className="bg-ink text-ivory px-8 py-3.5 font-mono text-[10px] uppercase tracking-[0.24em] hover:bg-moss transition-colors disabled:bg-ink/25"
                    >
                      {step === 3 ? "Ver mi talla" : "Continuar"} <ArrowRight className="ml-1 inline size-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => pick(result?.size ?? null)}
                      className="bg-ink text-ivory px-8 py-3.5 font-mono text-[10px] uppercase tracking-[0.24em] hover:bg-moss transition-colors"
                    >
                      Seleccionar {result?.size ?? ""}
                    </button>
                  )}
                </footer>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Slide({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h2 className="font-serif text-[clamp(1.7rem,3.6vw,2.6rem)] leading-[1.05]">{children}</h2>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-md font-serif text-[14px] leading-relaxed text-ink/60">{children}</p>;
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-4 py-2.5 border font-mono text-[10px] uppercase tracking-[0.16em] transition-colors " +
        (active ? "border-ink bg-ink text-ivory" : "border-ink/20 hover:border-ink")
      }
    >
      {children}
    </button>
  );
}

function BigField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block border-b border-ink/20 pb-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/50">{label}</span>
      <span className="mt-1 flex items-baseline gap-2">
        <input
          value={value}
          inputMode="numeric"
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          className="w-full bg-transparent font-serif text-[2rem] leading-none outline-none"
        />
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink/45">{unit}</span>
      </span>
    </label>
  );
}
