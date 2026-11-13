import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { attachTransferProof } from "@/lib/payments.functions";
import type { PaymentsSettings } from "@/lib/payments";

async function copyValue(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  } catch {
    toast.error("No pudimos copiar. Selecciónalo manualmente.");
  }
}

/** Datos bancarios para transferencia manual, con copiado rápido. */
export function TransferDetails({ transfer }: { transfer: PaymentsSettings["transfer"] }) {
  const rows: { label: string; value: string; copy?: boolean }[] = [
    { label: "Banco", value: transfer.bankName },
    { label: "Tipo de cuenta", value: transfer.accountType },
    { label: "Número de cuenta", value: transfer.accountNumber, copy: true },
    { label: "Titular", value: transfer.holder, copy: true },
    { label: "NIT / Cédula", value: transfer.documentId, copy: true },
  ].filter((row) => Boolean(row.value));
  return (
    <div className="mt-4 rounded-md border border-ink/15 bg-cream px-4 py-3 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 py-0.5">
          <span className="text-moss">{row.label}</span>
          <span className="flex items-center gap-1 text-right">
            <span>{row.value}</span>
            {row.copy && (
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-moss" aria-label={`Copiar ${row.label}`} onClick={() => copyValue(row.value, row.label)}>
                <Copy className="size-3.5" />
              </Button>
            )}
          </span>
        </div>
      ))}
      {transfer.instructions && <p className="mt-2 border-t border-ink/10 pt-2 text-[11px] text-moss">{transfer.instructions}</p>}
    </div>
  );
}

async function uploadReceipt(file: File, folder: string) {
  if (file.size > 10 * 1024 * 1024) throw new Error("El archivo supera 10 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("payment-receipts").upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

/** Selector del comprobante antes de confirmar el pedido. Devuelve la ruta en el almacenamiento. */
export function TransferProofPicker({ onUploaded }: { onUploaded: (path: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadReceipt(file, "pendientes");
      setFileName(file.name);
      onUploaded(path);
      toast.success("Comprobante listo.");
    } catch (error) {
      onUploaded(null);
      setFileName(null);
      toast.error(error instanceof Error ? error.message : "No pudimos subir el comprobante.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <label className="block">
        <input type="file" accept="image/*,application/pdf" className="hidden" disabled={busy} onChange={(event) => pick(event.target.files?.[0])} />
        <Button asChild variant="outline" className="h-12 w-full uppercase tracking-[0.16em]" disabled={busy}>
          <span>
            {busy ? <Loader2 className="animate-spin" /> : fileName ? <Check className="size-4" /> : <Upload className="size-4" />}
            {busy ? "Subiendo…" : fileName ? "Cambiar comprobante" : "Subir comprobante"}
          </span>
        </Button>
      </label>
      <p className="mt-2 text-center text-[11px] text-moss">
        {fileName ? `Adjunto: ${fileName}` : "Adjunta el soporte de la transferencia para confirmar tu pedido."}
      </p>
    </div>
  );
}

/** Subida del comprobante cuando el pedido ya existe. */
export function TransferProofUpload({ orderNumber }: { orderNumber: string }) {
  const attach = useServerFn(attachTransferProof);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadReceipt(file, orderNumber);
      await attach({ data: { orderNumber, path } });
      setSent(true);
      toast.success("Comprobante recibido. Confirmaremos tu pago pronto.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos subir el comprobante.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p className="mt-5 flex items-center justify-center gap-2 text-sm text-moss">
        <Check className="size-4" /> Comprobante enviado · pago pendiente por confirmar
      </p>
    );
  }

  return (
    <label className="mt-5 block">
      <input type="file" accept="image/*,application/pdf" className="hidden" disabled={busy} onChange={(event) => upload(event.target.files?.[0])} />
      <Button asChild variant="outline" className="h-12 w-full uppercase tracking-[0.16em]" disabled={busy}>
        <span>{busy ? <Loader2 className="animate-spin" /> : <Upload className="size-4" />}{busy ? "Subiendo…" : "Subir comprobante"}</span>
      </Button>
    </label>
  );
}
