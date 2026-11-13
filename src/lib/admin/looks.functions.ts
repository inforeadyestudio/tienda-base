import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  /** URL pública de la foto del producto. */
  imageUrl: z.string().url(),
  /** Foto ya reducida a 1024px en base64 (webp/jpeg). Si llega, se usa en vez de descargar la URL. */
  imageB64: z.string().max(3_000_000).optional(),
  /** Zona de la prenda para saber qué recortar cuando la foto trae varias. */
  slot: z.enum(["top", "bottom", "full", "shoes", "accessory"]).default("full"),
});

const SLOT_HINT: Record<string, string> = {
  top: "Si la foto tiene varias prendas, extrae SOLO la prenda superior.",
  bottom: "Si la foto tiene varias prendas, extrae SOLO la prenda inferior.",
  full: "Extrae la prenda protagonista completa (vestido o conjunto si aplica).",
  shoes: "Extrae SOLO el calzado.",
  accessory: "Extrae SOLO el accesorio protagonista.",
};

function gatewayError(status: number, body: string): Error {
  if (status === 429) return new Error("Muchas solicitudes seguidas. Intenta de nuevo en un momento.");
  if (status === 402) return new Error("El saldo de la cuenta de IA se agotó. Recárgalo para seguir recortando fotos.");
  if (status === 403) return new Error("La llave de IA no tiene permiso para este modelo.");
  return new Error(body.slice(0, 200) || "No pudimos recortar la imagen.");
}

/** Recorta el fondo de la foto de un producto y devuelve un PNG transparente en base64. */
export const cutoutProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<{ b64: string | null }> => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) throw new Error("Solo el equipo puede recortar fotos.");
    const { aiImageEdit, aiImageEnabled } = await import("@/lib/ai.server");
    if (!aiImageEnabled()) throw new Error("Falta la clave de IA para imágenes en el proyecto.");

    let bytes: Uint8Array<ArrayBuffer>;
    let mime: string;
    if (data.imageB64) {
      const bin = atob(data.imageB64);
      const buf = new Uint8Array(new ArrayBuffer(bin.length));
      for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i);
      bytes = buf;
      mime = "image/webp";
    } else {
      const { isStoreHost } = await import("@/lib/store-hosts.server");
      const host = new URL(data.imageUrl);
      const allowed =
        host.protocol === "https:" &&
        (host.hostname.endsWith(".supabase.co") || isStoreHost(host.hostname));
      if (!allowed) throw new Error("La foto debe venir del catálogo de la tienda.");
      const src = await fetch(host.toString(), { redirect: "error" });
      if (!src.ok) throw new Error("No pudimos leer la foto del producto.");
      bytes = new Uint8Array(await src.arrayBuffer());
      mime = src.headers.get("content-type") ?? "image/jpeg";
    }
    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";

    const prompt = [
      "Mantén EXACTAMENTE la misma prenda de la foto: mismo corte, color, textura, estampados y detalles.",
      SLOT_HINT[data.slot] ?? SLOT_HINT["full"],
      "Elimina por completo el fondo y cualquier persona, mano o percha.",
      "Devuelve la prenda recortada, centrada y completa, con fondo totalmente transparente,",
      "sin sombras proyectadas, sin texto y sin marcos.",
    ].join(" ");

    const form = new FormData();
    form.append("prompt", prompt);
    form.append("image", new Blob([bytes], { type: mime }), `producto.${ext}`);
    form.append("size", "1024x1024");
    form.append("quality", "medium");
    form.append("background", "transparent");
    form.append("output_format", "png");

    const attempt = async () => aiImageEdit(form);

    let res = await attempt();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2500));
      res = await attempt();
    }
    if (!res.ok) throw gatewayError(res.status, await res.text().catch(() => ""));

    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    return { b64: json.data?.[0]?.b64_json ?? null };
  });
