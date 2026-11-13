/** Abre la guía con el contenido escrito; si falla, abre la original. */
export async function openStampedLabel(
  stamp: (a: { data: { orderId: string; boxId?: string | null; url: string } }) => Promise<{ pdf: string }>,
  args: { orderId: string; boxId?: string | null; url: string },
) {
  const win = window.open("", "_blank");
  try {
    const { pdf } = await stamp({ data: args });
    const bin = atob(pdf); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    if (win) win.location.href = href; else window.open(href, "_blank");
  } catch {
    if (win) win.location.href = args.url; else window.open(args.url, "_blank");
  }
}
