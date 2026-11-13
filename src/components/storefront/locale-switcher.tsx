import { useLocale } from "@/lib/locale";

/** Moneda automática por país; solo el idioma se puede cambiar. */
export function LocaleSwitcher({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const { lang, currency, setLang } = useLocale();
  const buttons = (
    <span className="flex items-center gap-1">
      {(["es", "en"] as const).map((value) => (
        <button
          key={value}
          onClick={() => setLang(value)}
          aria-pressed={lang === value}
          className={`px-1 uppercase transition-colors ${lang === value ? "text-ink underline underline-offset-4" : "text-ink/45 hover:text-ink"}`}
        >
          {value}
        </button>
      ))}
    </span>
  );
  if (variant === "mobile") {
    return (
      <div data-no-translate className="mt-5 flex items-center gap-3 font-mono text-[11px] tracking-[0.16em] text-ink/50">
        <span>{currency}</span>
        {buttons}
      </div>
    );
  }
  return (
    <div data-no-translate className="hidden items-center gap-2 font-nm text-[11px] tracking-[0.1em] text-ink/85 md:flex">
      <span>{currency} ·</span>
      {buttons}
    </div>
  );
}
