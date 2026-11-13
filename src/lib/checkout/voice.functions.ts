import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  text: z.string().min(1).max(600),
  step: z.enum(["details", "delivery", "payment"]),
});

export type VoiceDecision = {
  /** Qué está dictando la clienta ahora mismo. */
  topic: "contacto" | "direccion" | "pago" | "otro";
  /** Pidió pasar al siguiente paso. */
  advance: boolean;
  /** Pidió corregir o borrar algo dictado antes. */
  correction: boolean;
};

const FALLBACK: VoiceDecision = { topic: "otro", advance: false, correction: false };

/** Decisión tipada e instantánea sobre el dictado del checkout. */
export const decideCheckoutSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<VoiceDecision> => {
    const { aiDecide } = await import("@/lib/ai.server");

    const body = {
      state: {
        dictado: data.text,
        paso_actual: data.step,
        pasos: ["details (nombre, cédula, correo, teléfono)", "delivery (país, departamento, ciudad, dirección)", "payment (método de pago)"],
      },
      questions: {
        topic: {
          type: "choice",
          instructions: {
            question: "¿Qué tipo de información está dictando la clienta en `dictado`?",
            idioma: "español colombiano hablado, puede venir con muletillas",
          },
          criteria: {
            contacto: "Nombre, apellido, cédula, correo electrónico o teléfono.",
            direccion: "Dirección, complemento, barrio, ciudad, departamento o país de entrega.",
            pago: "Método de pago: tarjeta, transferencia, PSE, Addi, PayPal.",
            otro: "Ninguna de las anteriores: saludos, dudas o comentarios.",
          },
        },
        advance: {
          type: "noul",
          instructions: "¿La clienta pide continuar al siguiente paso del checkout en `dictado`?",
          criteria: {
            true: "Dice continuar, siguiente, listo, ya está, sigue, avanza o equivalente.",
            false: "Solo está dictando datos o hablando de otra cosa.",
          },
        },
        correction: {
          type: "noul",
          instructions: "¿La clienta pide corregir, cambiar o borrar un dato que ya había dictado?",
          criteria: {
            true: "Dice no, corrige, cambia, borra, me equivoqué o repite un dato distinto.",
            false: "Está entregando datos nuevos sin corregir nada.",
          },
        },
      },
    };

    try {
      const answers = await aiDecide(body.state, body.questions as any);
      if (!answers) return FALLBACK;
      const topic = (answers.topic?.choice ?? "") as any;
      return {
        topic: ["contacto", "direccion", "pago", "otro"].includes(topic) ? topic : "otro",
        advance: typeof answers.advance?.noul === "number" ? answers.advance.noul > 0.65 : false,
        correction: typeof answers.correction?.noul === "number" ? answers.correction.noul > 0.65 : false,
      };
    } catch {
      return FALLBACK;
    }
  });
