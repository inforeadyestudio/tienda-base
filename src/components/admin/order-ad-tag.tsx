import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone } from "lucide-react";
import { getMetaCampaignName } from "@/lib/meta-report.functions";

/** Etiqueta de origen publicitario guardada al pagarse un pedido Online. */
export function OrderAdTag({ source, campaign, tagged }: { source?: string | null; campaign?: string | null; tagged?: string | null }) {
  const readName = useServerFn(getMetaCampaignName);
  const isMetaId = !!campaign && /^\d{6,30}$/.test(campaign);
  const name = useQuery({
    queryKey: ["meta-campaign-name", campaign],
    enabled: isMetaId,
    staleTime: 60 * 60 * 1000,
    queryFn: () => readName({ data: { id: campaign! } }),
  });
  if (!tagged) return null;
  const src = (source ?? "").toLowerCase();
  const isMeta = ["facebook", "instagram", "meta", "fb", "ig"].includes(src);
  const label = !campaign
    ? "Directo / orgánico"
    : `${isMeta ? "Meta" : source ? source.charAt(0).toUpperCase() + source.slice(1) : "Campaña"} · ${isMetaId ? (name.data?.name ?? (name.isLoading ? "…" : campaign)) : campaign}`;
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium " + (campaign ? "bg-data-pale text-ink" : "bg-ink/5 text-ink/60")}>
      <Megaphone className="size-3.5" /> {label}
    </span>
  );
}
