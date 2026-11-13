import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign } from "lucide-react";
import { getTrm } from "@/lib/b2b/trm.functions";

export function useTrm() {
  const fetchTrm = useServerFn(getTrm);
  return useQuery({
    queryKey: ["trm-current"],
    queryFn: async () => fetchTrm(),
    staleTime: 6 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function TrmBadge({ className = "" }: { className?: string }) {
  const { data: trm } = useTrm();
  if (!trm) return null;
  const since = trm.validFrom ? new Date(trm.validFrom) : null;
  const label = since && !Number.isNaN(since.getTime())
    ? since.toLocaleDateString("es-CO", { day: "numeric", month: "short" })
    : "";
  return (
    <span
      title={`TRM vigente desde ${label || "—"} · Superfinanciera`}
      className={"inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3.5 py-1.5 text-xs text-ink/70 " + className}
    >
      <CircleDollarSign className="size-3.5 text-moss" />
      <span className="uppercase tracking-[0.12em] text-[10px] text-ink/45">TRM USD</span>
      <span className="font-medium text-ink tabular-nums">{cop.format(trm.value)}</span>
      {label && <span className="text-[10px] text-ink/40">· {label}</span>}
    </span>
  );
}
