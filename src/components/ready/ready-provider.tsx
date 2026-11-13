import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouterState } from "@tanstack/react-router";
import { readyChat } from "@/lib/ready/chat.functions";
import { decideReadySpeech } from "@/lib/ready/intent.functions";
import { validateAction, type ReadyUiAction } from "@/lib/ready/actions";
import {
  ReadyContext,
  useReady,
  useReadyPageContext,
  type PageContext,
  type ReadyCtx,
  type ReadyMessage,
  type ReadyStatus,
  type ReadyVoiceMode,
} from "./ready-context";

export { useReady, useReadyPageContext };
export type { PageContext, ReadyMessage, ReadyStatus, ReadyVoiceMode };
import { addToCart, readCart, removeFromCart, setCartQty, type CartItem } from "@/lib/cart";

export function ReadyProvider({ children }: { children: ReactNode }) {
  const routePath = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ReadyStatus>("idle");
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState<ReadyVoiceMode>("off");
  const [messages, setMessages] = useState<ReadyMessage[]>([]);
  const [actions, setActions] = useState<ReadyUiAction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<string | null>(null);
  const pageRef = useRef<PageContext>({});
  const dictationRef = useRef<((text: string) => void) | null>(null);
  const recognitionRef = useRef<any>(null);
  const wantedRef = useRef(false);
  const bufferRef = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});

  const setDictationHandler = useCallback((fn: ((text: string) => void) | null) => {
    dictationRef.current = fn;
  }, []);

  const setPageContext = useCallback((ctx: PageContext) => {
    pageRef.current = ctx;
  }, []);

  const pageContext = useCallback(
    () => ({
      ...pageRef.current,
      route: routePath,
      cart: readCart().map((i) => ({
        variant_id: i.variantId,
        name: i.productName,
        variant: i.variantLabel,
        qty: i.qty,
        price_cop: i.priceCop,
      })),
    }),
    [routePath],
  );

  const pushActions = useCallback((raw: unknown[]) => {
    const valid = raw.map(validateAction).filter(Boolean) as ReadyUiAction[];
    if (valid.length) setActions(valid);
  }, []);

  const applyCartAction = useCallback((action: ReadyUiAction | null) => {
    if (action?.type === "cart_add" && action.payload?.["item"]) {
      addToCart(action.payload["item"] as CartItem);
    }
    if (action?.type === "cart_set_qty" && action.payload?.["variant_id"]) {
      setCartQty(String(action.payload["variant_id"]), Number(action.payload["qty"]) || 0);
    }
    if (action?.type === "cart_remove" && action.payload?.["variant_id"]) {
      removeFromCart(String(action.payload["variant_id"]));
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setError(null);
      setMessages((m) => [...m, { role: "user", content: clean }]);
      setStatus("thinking");
      try {
        const history = messages.slice(-8);
        const res = await readyChat({
          data: { session_id: sessionRef.current, message: clean, history, page_context: pageContext() },
        });
        sessionRef.current = res.session_id;
        if (res.reply) setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
        (res.actions ?? []).forEach((a) => applyCartAction(validateAction(a)));
        pushActions(res.actions ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Tu Marca no pudo responder.");
      } finally {
        setStatus(wantedRef.current ? "listening" : "idle");
      }
    },
    [messages, pageContext, pushActions, applyCartAction],
  );
  sendRef.current = send;

  const clearFlush = () => {
    if (flushTimer.current) window.clearTimeout(flushTimer.current);
    flushTimer.current = null;
  };

  /** Envía lo dictado y limpia el campo. */
  const flush = useCallback(() => {
    clearFlush();
    const text = bufferRef.current.trim();
    if (!text) return;
    bufferRef.current = "";
    dictationRef.current?.("");
    void sendRef.current(text);
  }, []);

  const stopVoice = useCallback(() => {
    wantedRef.current = false;
    clearFlush();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ya estaba detenido */
    }
    bufferRef.current = "";
    setVoiceMode("off");
    setVoiceActive(false);
    setStatus((s) => (s === "thinking" ? s : "idle"));
  }, []);

  /** Dictado en el navegador: la clienta habla, Tu Marca responde por texto. */
  const startVoice = useCallback(async () => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setError("Tu navegador no permite dictado. Puedes escribirme.");
      return;
    }
    setError(null);
    const engine: any = recognitionRef.current ?? new SR();
    recognitionRef.current = engine;
    engine.lang = "es-CO";
    engine.continuous = true;
    engine.interimResults = true;

    engine.onresult = (event: any) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = String(result[0].transcript);
        if (result.isFinal) finalChunk += `${text} `;
        else interim += text;
      }
      if (finalChunk) bufferRef.current = `${bufferRef.current} ${finalChunk}`.replace(/\s+/g, " ").trim();
      dictationRef.current?.(`${bufferRef.current} ${interim}`.trim());

      if (!finalChunk) return;
      const pending = bufferRef.current;
      clearFlush();
      // Si Jev tarda, igual se envía sola tras una pausa corta.
      flushTimer.current = setTimeout(flush, 2200);
      void decideReadySpeech({ data: { text: pending.slice(0, 600) } })
        .then((decision) => {
          if (decision.complete && bufferRef.current === pending) flush();
        })
        .catch(() => {});
    };
    engine.onerror = (event: any) => {
      if (event?.error === "not-allowed") {
        wantedRef.current = false;
        setVoiceActive(false);
        setVoiceMode("off");
        setError("Permite el micrófono para dictarme.");
      }
    };
    engine.onend = () => {
      if (wantedRef.current) {
        try { engine.start(); } catch { /* reinicio silencioso */ }
      } else {
        setVoiceActive(false);
        setVoiceMode("off");
      }
    };

    wantedRef.current = true;
    try { engine.start(); } catch { /* ya estaba activo */ }
    setVoiceActive(true);
    setVoiceMode("dictate");
    setStatus("listening");
  }, [flush]);

  useEffect(() => () => { wantedRef.current = false; clearFlush(); try { recognitionRef.current?.abort?.(); } catch { /* noop */ } }, []);

  const value = useMemo<ReadyCtx>(
    () => ({
      open,
      setOpen,
      status,
      voiceActive,
      voiceMode,
      messages,
      actions,
      error,
      send,
      startVoice,
      stopVoice,
      setDictationHandler,
      setPageContext,
    }),
    [
      open,
      status,
      voiceActive,
      voiceMode,
      messages,
      actions,
      error,
      send,
      startVoice,
      stopVoice,
      setDictationHandler,
      setPageContext,
    ],
  );

  return <ReadyContext.Provider value={value}>{children}</ReadyContext.Provider>;
}
