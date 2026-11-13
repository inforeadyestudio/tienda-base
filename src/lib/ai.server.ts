/**
 * IA con llave propia, directo al proveedor (sin pasarelas intermedias).
 *
 * Variables del servidor (se ponen en Vercel, nunca en el código):
 *   AI_PROVIDER      "openai" (por defecto) | "google"
 *   OPENAI_API_KEY   llave de OpenAI
 *   GEMINI_API_KEY   llave de Google (Gemini), solo si AI_PROVIDER=google
 *   AI_MODEL         modelo principal (opcional)
 *   AI_MODEL_FAST    modelo rápido/barato para traducciones y decisiones (opcional)
 *   AI_IMAGE_MODEL   modelo de edición de imágenes (opcional)
 *
 * Texto, visión, herramientas y JSON usan `chat/completions` en formato OpenAI,
 * que ambos proveedores aceptan. La edición de imágenes (recortes del clóset y
 * de looks) y la voz en tiempo real usan APIs de OpenAI: necesitan
 * OPENAI_API_KEY aunque el texto vaya por Google.
 */

type Provider = "openai" | "google";

const PROVIDERS: Record<Provider, { base: string; keyEnv: string; model: string; fast: string }> = {
  openai: {
    base: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    model: "gpt-5.6-sol",
    fast: "gpt-5.6-luna",
  },
  google: {
    base: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    model: "gemini-3.8-flash",
    fast: "gemini-3.8-flash",
  },
};

export type AiConfig = { provider: Provider; base: string; key: string; model: string; fast: string };

/** Configuración activa, o null si falta la llave (las funciones de IA quedan apagadas). */
export function aiConfig(): AiConfig | null {
  const provider: Provider = process.env["AI_PROVIDER"] === "google" ? "google" : "openai";
  const p = PROVIDERS[provider];
  const key = process.env[p.keyEnv];
  if (!key) return null;
  return {
    provider,
    base: p.base,
    key,
    model: process.env["AI_MODEL"] || p.model,
    fast: process.env["AI_MODEL_FAST"] || p.fast,
  };
}

export function aiEnabled(): boolean {
  return aiConfig() !== null;
}

/** Nombre del modelo principal, para dejarlo registrado en las sesiones del asistente. */
export function aiModelName(): string {
  return aiConfig()?.model ?? "sin-configurar";
}

export type AiMessage = { role: "system" | "user" | "assistant" | "tool"; content: unknown; [k: string]: unknown };

export type AiChatOptions = {
  messages: AiMessage[];
  tools?: unknown[];
  /** Pide un objeto JSON como respuesta. */
  json?: boolean;
  /** Usa el modelo rápido. */
  fast?: boolean;
  /** Esfuerzo de razonamiento ("none" para respuestas inmediatas). */
  reasoningEffort?: "none" | "low" | "medium" | "high";
};

/**
 * Llamada cruda a chat/completions. Devuelve la Response para que cada función
 * maneje sus propios mensajes de error (429, 402, etc.).
 */
export async function aiChat(opts: AiChatOptions): Promise<Response> {
  const cfg = aiConfig();
  if (!cfg) throw new Error("Falta la clave de IA.");
  // Gemini 3 no permite apagar el razonamiento: "none" baja a "low".
  const effort = opts.reasoningEffort === "none" && cfg.provider === "google" ? "low" : opts.reasoningEffort;
  return fetch(`${cfg.base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: opts.fast ? cfg.fast : cfg.model,
      messages: opts.messages,
      ...(opts.tools?.length ? { tools: opts.tools } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      ...(effort ? { reasoning_effort: effort } : {}),
    }),
  });
}

/** Texto de la primera respuesta de un payload de chat/completions. */
export function aiContent(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c?.text === "string" ? c.text : "")).join("");
  return "";
}

/** Primer objeto JSON que aparezca en un texto (tolera ```json y texto alrededor). */
export function aiParseJson<T = any>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

/** Mensaje de usuario con texto + imagen (URL https o data URL). */
export function aiImageMessage(text: string, imageUrl: string): AiMessage {
  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "image_url", image_url: { url: imageUrl } },
    ],
  };
}

export type AiQuestion =
  | { type: "choice"; instructions: unknown; criteria: Record<string, string> }
  | { type: "noul"; instructions: unknown; criteria: Record<string, string> };

export type AiAnswer = { choice?: string; noul?: number };

/**
 * Decisiones tipadas e inmediatas sobre un estado (intención de un dictado, etc.).
 * - "choice": devuelve una de las claves de `criteria`.
 * - "noul": devuelve una probabilidad entre 0 y 1 de que la respuesta sea "true".
 * Devuelve null si la IA no está configurada o falla (quien llama usa su respaldo).
 */
export async function aiDecide(
  state: Record<string, unknown>,
  questions: Record<string, AiQuestion>,
): Promise<Record<string, AiAnswer> | null> {
  if (!aiEnabled()) return null;
  const system = [
    "Respondes preguntas de clasificación sobre un estado. Devuelve SOLO un objeto JSON con una clave por pregunta.",
    'Para preguntas de tipo "choice": {"choice":"<una de las claves de criteria>"}.',
    'Para preguntas de tipo "noul": {"noul": <número entre 0 y 1: probabilidad de que la respuesta sea true>}.',
    "No agregues explicaciones.",
  ].join(" ");
  try {
    const res = await aiChat({
      fast: true,
      json: true,
      reasoningEffort: "none",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ state, questions }) },
      ],
    });
    if (!res.ok) return null;
    const parsed = aiParseJson<Record<string, AiAnswer>>(aiContent(await res.json()));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** La edición de imágenes siempre va por OpenAI. */
export function aiImageEnabled(): boolean {
  return !!process.env["OPENAI_API_KEY"];
}

/**
 * Edita una imagen (API de imágenes de OpenAI). El formulario trae prompt, image,
 * size, etc.; aquí se agrega el modelo. Devuelve la Response cruda.
 */
export async function aiImageEdit(form: FormData): Promise<Response> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("Falta la clave de IA para imágenes (OPENAI_API_KEY).");
  form.set("model", process.env["AI_IMAGE_MODEL"] || "gpt-image-2");
  return fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
}
