import { createContext, useContext, useEffect } from "react";
import type { ReadyUiAction } from "@/lib/ready/actions";

export type ReadyStatus = "idle" | "listening" | "thinking" | "speaking";
export type ReadyMessage = { role: "user" | "assistant"; content: string };
export type PageContext = {
  route?: string;
  page_type?: string;
  analysis?: { from: string; to: string; destination: "all" | "nacional" | "internacional"; store: string };
  product_id?: string;
  product_slug?: string;
  product_name?: string;
  collection_id?: string;
  selected_variant?: string;
  selected_size?: string;
  selected_color?: string;
  cart?: Array<{
    variant_id: string;
    name: string;
    variant: string;
    qty: number;
    price_cop?: number;
  }>;
};

export type ReadyVoiceMode = "off" | "dictate" | "talk";

export type ReadyCtx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  status: ReadyStatus;
  voiceActive: boolean;
  voiceMode: ReadyVoiceMode;
  messages: ReadyMessage[];
  actions: ReadyUiAction[];
  error: string | null;
  send: (text: string) => Promise<void>;
  startVoice: (mode?: ReadyVoiceMode) => Promise<void>;
  stopVoice: () => void;
  setDictationHandler: (fn: ((text: string) => void) | null) => void;
  setPageContext: (ctx: PageContext) => void;
};

export const ReadyContext = createContext<ReadyCtx | null>(null);

export function useReady() {
  const ctx = useContext(ReadyContext);
  if (!ctx) throw new Error("useReady debe usarse dentro de ReadyProvider");
  return ctx;
}

/** Declara el contexto mínimo y seguro de la página actual. */
export function useReadyPageContext(ctx: PageContext) {
  const { setPageContext } = useReady();
  const serialized = JSON.stringify(ctx);
  useEffect(() => {
    setPageContext(JSON.parse(serialized));
  }, [serialized, setPageContext]);
}
