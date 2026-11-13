import { resolveActor, type ReadyActor } from "./context.server";
import { executeTool, toolSchemasFor, type UiAction } from "./tools.server";
import { systemPrompt } from "./prompts.server";

import { aiChat, aiEnabled, aiModelName } from "@/lib/ai.server";

const REALTIME_MODEL = "gpt-realtime-2.1";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function ensureSession(
  actor: ReadyActor,
  sessionId: string | null | undefined,
  channel: "text" | "voice",
  route?: string,
) {
  const db = await admin();
  if (sessionId) {
    // Solo se continúa una sesión propia; si no, se abre una nueva.
    const { data: own } = await db.from("agent_sessions").select("id, user_id").eq("id", sessionId).maybeSingle();
    if (own && actor.userId && own.user_id === actor.userId) return own.id as string;
  }
  const { data } = await db
    .from("agent_sessions")
    .insert({ actor_type: actor.type, user_id: actor.userId, channel, route: route ?? null, model: aiModelName() })
    .select("id")
    .maybeSingle();
  return data?.id ?? null;
}

async function logMessage(sessionId: string | null, role: string, content: string) {
  if (!sessionId) return;
  const db = await admin();
  await db.from("agent_messages").insert({ session_id: sessionId, role, content: content.slice(0, 8000) });
}

async function logToolCall(
  sessionId: string | null,
  tool: string,
  args: unknown,
  ok: boolean,
  latency: number,
  error?: string,
) {
  if (!sessionId) return;
  const db = await admin();
  await db.from("agent_tool_calls").insert({
    session_id: sessionId,
    tool,
    args: (args ?? {}) as never,
    ok,
    latency_ms: latency,
    error: error?.slice(0, 500) ?? null,
  });
}

export async function logEvent(sessionId: string, name: string, payload: Record<string, unknown>) {
  const db = await admin();
  const actor = await resolveActor();
  const { data: own } = await db.from("agent_sessions").select("user_id").eq("id", sessionId).maybeSingle();
  if (!own || !actor.userId || own.user_id !== actor.userId) return;
  await db.from("agent_events").insert({ session_id: sessionId, name, payload: payload as never });
}

/** Entrenamiento que el equipo configura en el admin (conocimiento + forma de responder). */
async function loadTraining(): Promise<{ knowledge?: string; style?: string }> {
  try {
    const db = await admin();
    const { data } = await db.from("app_settings").select("value").eq("key", "assistant_training").maybeSingle();
    const v = (data?.value ?? {}) as { knowledge?: unknown; style?: unknown };
    return {
      knowledge: typeof v.knowledge === "string" ? v.knowledge : undefined,
      style: typeof v.style === "string" ? v.style : undefined,
    };
  } catch {
    return {};
  }
}

async function callTool(actor: ReadyActor, sessionId: string | null, name: string, args: unknown) {
  const started = Date.now();
  try {
    const result = await executeTool(actor, name, args);
    await logToolCall(sessionId, name, args, true, Date.now() - started);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await logToolCall(sessionId, name, args, false, Date.now() - started, message);
    return { data: { error: message } as any, ui_action: undefined as UiAction | undefined };
  }
}

export async function runReadyTool(input: { session_id?: string | null; name: string; args?: unknown; route?: string }) {
  const actor = await resolveActor(input.route);
  let sessionId: string | null = null;
  if (input.session_id && actor.userId) {
    const db = await admin();
    const { data: own } = await db.from("agent_sessions").select("user_id").eq("id", input.session_id).maybeSingle();
    if (own?.user_id === actor.userId) sessionId = input.session_id;
  }
  const result = await callTool(actor, sessionId, input.name, input.args);
  return { data: result.data, ui_action: result.ui_action ?? null };
}

export async function runReadyTurn(input: {
  session_id?: string | null;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  page_context?: Record<string, unknown>;
}) {
  const actor = await resolveActor(input.page_context?.["route"]);
  const sessionId = await ensureSession(actor, input.session_id, "text", String(input.page_context?.["route"] ?? ""));
  // El historial se lee de la sesión guardada, nunca del navegador.
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (sessionId) {
    const dbh = await admin();
    const { data: rows } = await dbh
      .from("agent_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(10);
    history = ((rows ?? []) as any[]).reverse().map((r) => ({ role: r.role, content: String(r.content ?? "") }));
  }
  await logMessage(sessionId, "user", input.message);

  if (!aiEnabled()) {
    return { session_id: sessionId, reply: "Tu Marca no está disponible en este momento.", actions: [] };
  }

  const tools = toolSchemasFor(actor).map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const training = await loadTraining();
  const messages: any[] = [
    { role: "system", content: systemPrompt(actor, input.page_context, training) },
    ...history,
    { role: "user", content: input.message },
  ];

  const actions: UiAction[] = [];
  let reply = "";

  for (let step = 0; step < 4; step++) {
    const res = await aiChat({ messages, reasoningEffort: "none", tools });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Muchas consultas seguidas. Intenta en un momento.");
      if (res.status === 402) throw new Error("Tu Marca no está disponible en este momento.");
      throw new Error("Tu Marca no pudo responder ahora mismo.");
    }
    const payload = await res.json();
    const choice = payload?.choices?.[0]?.message;
    if (!choice) break;
    messages.push(choice);

    const calls = choice.tool_calls ?? [];
    if (!calls.length) {
      reply = choice.content ?? "";
      break;
    }

    for (const call of calls) {
      let args: unknown = {};
      try {
        args = JSON.parse(call.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const name = call.function?.name ?? "";
      const parsedArgs = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const cart = Array.isArray(input.page_context?.["cart"])
        ? (input.page_context?.["cart"] as Array<Record<string, unknown>>)
        : [];
      let result;
      if (name === "cart_view") {
        result = {
          data: { items: cart },
          ui_action: { type: "show_cart", payload: { items: cart } } as UiAction,
        };
      } else if (name === "cart_set_qty") {
        result = {
          data: { ok: true },
          ui_action: {
            type: "cart_set_qty",
            payload: { variant_id: parsedArgs["variant_id"], qty: parsedArgs["qty"] },
          } as UiAction,
        };
      } else if (name === "cart_remove") {
        result = {
          data: { ok: true },
          ui_action: { type: "cart_remove", payload: { variant_id: parsedArgs["variant_id"] } } as UiAction,
        };
      } else {
        const contextualArgs =
          name === "cart_add" && !parsedArgs["product_id"] && !parsedArgs["slug"]
            ? {
                ...parsedArgs,
                product_id: input.page_context?.["product_id"],
                slug: input.page_context?.["product_slug"],
                size: parsedArgs["size"] ?? input.page_context?.["selected_size"],
                color: parsedArgs["color"] ?? input.page_context?.["selected_color"],
              }
            : parsedArgs;
        result = await callTool(actor, sessionId, name, contextualArgs);
      }
      if (result.ui_action) actions.push(result.ui_action);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result.data).slice(0, 6000),
      });
    }
  }

  await logMessage(sessionId, "assistant", reply);
  if (actions.length) {
    const shown = actions.flatMap((a) => (Array.isArray(a.payload["product_ids"]) ? (a.payload["product_ids"] as string[]) : []));
    if (sessionId && shown.length) await logEvent(sessionId, "products_shown", { product_ids: shown });
  }
  return { session_id: sessionId, reply, actions };
}

export async function createRealtimeSession(pageContext?: Record<string, unknown>) {
  const apiKey = process.env["OPENAI_API_KEY"];
  const actor = await resolveActor(pageContext?.["route"]);
  if (!apiKey) {
    return { enabled: false as const, reason: "missing_key", session_id: null, value: null, model: REALTIME_MODEL };
  }
  const sessionId = await ensureSession(actor, null, "voice", String(pageContext?.["route"] ?? ""));
  const training = await loadTraining();
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(actor.userId ? { "OpenAI-Safety-Identifier": actor.userId } : {}),
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: REALTIME_MODEL,
        audio: {
          input: {
            turn_detection: { type: "semantic_vad", eagerness: "medium", create_response: true, interrupt_response: true },
          },
          output: { voice: "marin", speed: 1.12 },
        },
        instructions: systemPrompt(actor, pageContext, training),
        tools: toolSchemasFor(actor),
      },
    }),
  });
  if (!res.ok) {
    return { enabled: false as const, reason: "openai_error", session_id: sessionId, value: null, model: REALTIME_MODEL };
  }
  const data = await res.json();
  return {
    enabled: true as const,
    reason: null,
    session_id: sessionId,
    value: data?.value ?? null,
    model: REALTIME_MODEL,
  };
}
