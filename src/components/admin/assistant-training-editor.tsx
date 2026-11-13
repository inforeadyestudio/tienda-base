import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ASSISTANT_TRAINING,
  saveAssistantTraining,
  assistantTrainingQuery,
  ASSISTANT_TRAINING_KEY,
  type AssistantTraining,
} from "@/lib/assistant-training";

const label = "block text-[10px] uppercase tracking-widest text-moss/70 mb-1";
const textarea =
  "w-full min-h-40 px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm leading-relaxed focus:outline-none focus:border-ink/30";

export function AssistantTrainingEditor() {
  const qc = useQueryClient();
  const { data } = useQuery(assistantTrainingQuery());
  const [training, setTraining] = useState<AssistantTraining>(DEFAULT_ASSISTANT_TRAINING);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setTraining(data);
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      await saveAssistantTraining(training);
      await qc.invalidateQueries({ queryKey: ["app-settings", ASSISTANT_TRAINING_KEY] });
      toast.success("Entrenamiento de Tu Marca guardado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-ink/10 bg-white p-4 space-y-2">
        <p className="text-sm font-medium">Entrena a Tu Marca de dos maneras</p>
        <p className="text-[13px] leading-relaxed text-moss/80">
          Por ahora el chat «Hablar con Tu Marca» solo aparece en este panel de administración. Úsalo para probarla y
          ajustarla antes de mostrarla a las clientas. Todo lo que escribas aquí se suma a sus instrucciones en cada
          conversación, tanto en texto como en voz.
        </p>
      </div>

      <div className="rounded-lg border border-ink/10 bg-white p-4 space-y-2">
        <label className={label}>1 · Conocimiento y datos</label>
        <p className="text-[12px] text-moss/70">
          Datos del negocio que debe saber: horarios, direcciones, materiales, políticas internas, fechas de lanzamiento,
          respuestas a preguntas frecuentes. Escribe un dato por línea.
        </p>
        <textarea
          className={textarea}
          value={training.knowledge}
          onChange={(e) => setTraining((t) => ({ ...t, knowledge: e.target.value }))}
          placeholder={"Ej. La tienda de Cali abre de 10 a 7 de lunes a sábado.\nEj. Los pedidos de preventa de Rodheo se despachan en noviembre."}
        />
      </div>

      <div className="rounded-lg border border-ink/10 bg-white p-4 space-y-2">
        <label className={label}>2 · Forma de responder a las clientas</label>
        <p className="text-[12px] text-moss/70">
          Cómo quieres que suene: tono, palabras que usa o evita, qué tan cortas son las respuestas, cuándo ofrecer
          pasar con el equipo, qué no debe prometer jamás.
        </p>
        <textarea
          className={textarea}
          value={training.style}
          onChange={(e) => setTraining((t) => ({ ...t, style: e.target.value }))}
          placeholder={"Ej. Respuestas de máximo dos frases, cálidas y directas.\nEj. Nunca prometas descuentos; si piden uno, ofrece pasar con el equipo."}
        />
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? "Guardando…" : "Guardar entrenamiento"}
      </Button>
    </div>
  );
}
