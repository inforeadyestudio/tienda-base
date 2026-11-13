import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ASSISTANT_TRAINING_KEY = "assistant_training";

export type AssistantTraining = {
  /** Datos y reglas del negocio que Tu Marca debe conocer. */
  knowledge: string;
  /** Cómo debe responderle a las clientas: tono, frases, límites. */
  style: string;
};

export const DEFAULT_ASSISTANT_TRAINING: AssistantTraining = { knowledge: "", style: "" };

export function normalizeAssistantTraining(raw: unknown): AssistantTraining {
  const v = (raw ?? {}) as Partial<AssistantTraining>;
  return {
    knowledge: typeof v.knowledge === "string" ? v.knowledge : "",
    style: typeof v.style === "string" ? v.style : "",
  };
}

export function assistantTrainingQuery() {
  return queryOptions({
    queryKey: ["app-settings", ASSISTANT_TRAINING_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", ASSISTANT_TRAINING_KEY)
        .maybeSingle();
      if (error) throw error;
      return normalizeAssistantTraining(data?.value);
    },
  });
}

export async function saveAssistantTraining(training: AssistantTraining) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: ASSISTANT_TRAINING_KEY, value: training }, { onConflict: "key" });
  if (error) throw error;
}
