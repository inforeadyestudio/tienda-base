import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-nm text-[2.25rem] sm:text-[3rem] leading-none tracking-tight">{title}</h2>
        {subtitle && <p className="mt-2 max-w-xl text-sm text-moss leading-relaxed">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatCard({
  iconUrl,
  iconAlt,
  value,
  label,
  sub,
}: {
  iconUrl: string;
  iconAlt: string;
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="bg-white/60 rounded-2xl border border-ink/5 p-4 lg:p-5 relative">
      <div className="min-w-0">
        <p className="font-nm text-xl lg:text-2xl leading-none">{value}</p>
        <p className="text-[11px] text-ink mt-1">{label}</p>
        <p className="text-[10px] text-moss/70">{sub}</p>
      </div>
      <img
        src={iconUrl}
        alt={iconAlt}
        className="absolute bottom-3 right-3 h-12 w-12 object-contain opacity-80 lg:bottom-4 lg:right-4 lg:h-14 lg:w-14"
      />
    </div>
  );
}

export function Card({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white/60 rounded-2xl border border-ink/5 p-5 flex flex-col h-full">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-brown-sugar text-2xl leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-moss/70 mt-0.5">{subtitle}</p>}
        </div>
        <ArrowRight className="w-4 h-4 text-moss" strokeWidth={1.5} />
      </div>
      <div className="flex-1">{children}</div>
      {footer && (
        <p className="text-[10px] tracking-[0.2em] uppercase text-moss text-center mt-4 pt-3 border-t border-ink/5">
          {footer}
        </p>
      )}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink/15 bg-white/40 px-6 py-16 text-center">
      <p className="font-nm text-xl">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-moss/80">{description}</p>
    </div>
  );
}
