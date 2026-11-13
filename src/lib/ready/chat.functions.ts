import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Tu Marca solo está disponible para el equipo por ahora.");
}

const PageContext = z
  .object({
    route: z.string().optional(),
    page_type: z.string().optional(),
    analysis: z.object({ from: z.string(), to: z.string(), destination: z.enum(["all", "nacional", "internacional"]), store: z.string() }).optional(),
    product_id: z.string().optional(),
    product_slug: z.string().optional(),
    product_name: z.string().optional(),
    collection_id: z.string().optional(),
    selected_variant: z.string().optional(),
    selected_size: z.string().optional(),
    selected_color: z.string().optional(),
    cart: z
      .array(
        z.object({
          variant_id: z.string(),
          name: z.string(),
          variant: z.string(),
          qty: z.number(),
          price_cop: z.number().optional(),
        }),
      )
      .optional(),
  })
  .optional();

const ChatInput = z.object({
  session_id: z.string().nullable().optional(),
  message: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .optional(),
  page_context: PageContext,
});

export type ReadyChatResult = {
  session_id: string | null;
  reply: string;
  actions: Array<{ type: string; payload: Record<string, any> }>;
};

/** Canal de texto de Tu Marca. Voz y texto comparten sesión, herramientas y permisos. */
export const readyChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ChatInput.parse(data))
  .handler(async ({ data, context }): Promise<ReadyChatResult> => {
    await assertStaff(context);
    const { runReadyTurn } = await import("./core.server");
    return runReadyTurn(data);
  });

/** Ejecuta una herramienta pedida por la voz en tiempo real. */
export const readyRunTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ session_id: z.string().nullable().optional(), name: z.string(), args: z.unknown().optional(), route: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ data: any; ui_action: any }> => {
    await assertStaff(context);
    const { runReadyTool } = await import("./core.server");
    return runReadyTool(data);
  });

/** Credencial efímera para conectar el navegador a OpenAI Realtime. La clave secreta nunca sale del backend. */
export const readyRealtimeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ page_context: PageContext }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { createRealtimeSession } = await import("./core.server");
    return createRealtimeSession(data.page_context);
  });

/** Registra eventos de atribución (producto mostrado, clic, agregado). */
export const readyLogEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ session_id: z.string(), name: z.string(), payload: z.record(z.string(), z.unknown()).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { logEvent } = await import("./core.server");
    await logEvent(data.session_id, data.name, data.payload ?? {});
    return { ok: true };
  });
