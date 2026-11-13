/** Etiqueta visible: Preventa (aún sin inventario) o Disponible para Restock (stock en Ecommerce). */
export function StockBadge({ restock, className = "" }: { restock: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium tracking-wide ${restock ? "bg-moss text-ivory" : "bg-ivory text-ink border border-ink/20"} ${className}`}>
      {restock ? "Disponible para Restock" : "Preventa"}
    </span>
  );
}
