import { useEffect, useRef, useState } from "react";
import { Search, Mic, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { parseShopQuery } from "@/lib/tienda/ai.functions";
import type { ShopFilters } from "@/lib/tienda/catalog";
import { cn } from "@/lib/utils";

type Props = {
  filters: ShopFilters;
  setFilters: (f: ShopFilters) => void;
  vocabulary: {
    types: string[];
    colors: string[];
    sizes: string[];
    materials: string[];
    tags: string[];
  };
};

export function ShopSearch({ filters, setFilters, vocabulary }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const recognition = useRef<any>(null);
  const parse = useServerFn(parseShopQuery);

  const run = async (text: string) => {
    const query = text.trim();
    if (!query) return;
    // Búsqueda literal instantánea mientras la IA interpreta.
    setFilters({ ...filters, q: query });
    if (query.split(/\s+/).length < 3) return;
    setBusy(true);
    try {
      const parsed = await parse({ data: { query, vocabulary, current: filters as any } });
      setFilters({
        ...filters,
        q: parsed.q,
        types: parsed.types.length ? parsed.types : filters.types,
        colors: parsed.colors.length ? parsed.colors : filters.colors,
        sizes: parsed.sizes.length ? parsed.sizes : filters.sizes,
        materials: parsed.materials.length ? parsed.materials : filters.materials,
        tags: parsed.tags.length ? parsed.tags : filters.tags,
        min: parsed.min ?? filters.min,
        max: parsed.max ?? filters.max,
        availability: parsed.availability !== "all" ? parsed.availability : filters.availability,
      });
      setNote(parsed.note);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos interpretar tu búsqueda");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "es-CO";
    r.interimResults = false;
    r.onresult = (e: any) => {
      const text = e.results[0][0].transcript as string;
      setValue(text);
      void run(text);
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    return () => r.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const toggleVoice = () => {
    if (!recognition.current) return toast.info("Tu navegador no permite búsqueda por voz");
    if (listening) {
      recognition.current.stop();
      setListening(false);
    } else {
      setListening(true);
      recognition.current.start();
    }
  };

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(value);
        }}
        className={cn(
          "flex items-center gap-3 rounded-full border bg-ivory px-5 h-13 py-3 transition-colors",
          listening ? "border-ink" : "border-ink/12",
        )}
      >
        <Search className="size-4 shrink-0 opacity-50" strokeWidth={1.5} />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="¿Qué estás buscando?"
          className="flex-1 min-w-0 bg-transparent outline-none text-[14px] placeholder:opacity-40"
        />
        {busy ? (
          <Loader2 className="size-4 animate-spin opacity-60" strokeWidth={1.5} />
        ) : (
          <button type="button" onClick={toggleVoice} aria-label="Buscar por voz">
            <Mic className={cn("size-4", listening ? "text-ink animate-pulse" : "opacity-50")} strokeWidth={1.5} />
          </button>
        )}
      </form>
      {note && (
        <p className="mt-3 flex items-center gap-2 font-nm text-[11px] tracking-[0.04em] opacity-70">
          <Sparkles className="size-3" strokeWidth={1.5} /> {note}
        </p>
      )}
    </div>
  );
}