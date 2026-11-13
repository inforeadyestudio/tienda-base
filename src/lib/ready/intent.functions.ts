import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ text: z.string().min(1).max(600) });

export type ReadySpeechDecision = {
  /** Qué está pidiendo la clienta. */
  intent: "buscar" | "recomendar" | "look" | "talla" | "carrito" | "otro";
  /** La frase ya está completa y se puede responder. */
  complete: boolean;
};

const FALLBACK: ReadySpeechDecision = { intent: "otro", complete: true };

/** Decisión tipada e instantánea sobre lo que la clienta acaba de dictar. */
export const decideReadySpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<ReadySpeechDecision> => {
    const { data: isStaff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!isStaff) return FALLBACK;
    const { aiDecide } = await import("@/lib/ai.server");

    const body = {
      state: { dictado: data.text, tienda: "Tu Marca, moda colombiana" },
      questions: {
        intent: {
          type: "choice",
          instructions: {
            question: "¿Qué está pidiendo la clienta en `dictado`?",
            contexto: "Habla por voz mientras navega una tienda de ropa.",
          },
          criteria: {
            buscar: "Busca una prenda concreta por tipo, color, material o precio.",
            recomendar: "Pide sugerencias u opiniones para una ocasión, clima o estilo.",
            look: "Pide combinar prendas o armar un look completo.",
            talla: "Pregunta por tallas, medidas, calce o disponibilidad.",
            carrito: "Pide agregar, quitar o revisar piezas de su pedido.",
            otro: "Saludo, comentario o algo que no encaja arriba.",
          },
        },
        complete: {
          type: "noul",
          instructions: "¿`dictado` ya es una petición completa que se puede responder sin esperar más palabras?",
          criteria: {
            true: "La frase tiene sentido por sí sola y se puede atender.",
            false: "Queda cortada a media idea y falta información para responder.",
          },
        },
      },
    };

    try {
      const answers = await aiDecide(body.state, body.questions as any);
      if (!answers) return FALLBACK;
      const intent = (answers.intent?.choice ?? "") as any;
      return {
        intent: ["buscar", "recomendar", "look", "talla", "carrito", "otro"].includes(intent) ? intent : "otro",
        complete: typeof answers.complete?.noul === "number" ? answers.complete.noul > 0.6 : true,
      };
    } catch {
      return FALLBACK;
    }
  });
