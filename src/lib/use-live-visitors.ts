import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { countLiveVisitors, LIVE_VISITORS_CHANNEL } from "./live-visitors";

export function useLiveVisitors(contribute: boolean, enabled = true) {
  const [count, setCount] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    setCount(null);
    setConnected(false);
    if (!enabled) return;
    let alive = true;
    let subscribed = false;
    let key: string = crypto.randomUUID();
    if (contribute) {
      try {
        key = localStorage.getItem("tb-live-visitor") || key;
        localStorage.setItem("tb-live-visitor", key);
      } catch { /* Restricted storage uses an ephemeral anonymous key. */ }
    }
    const channel = supabase.channel(LIVE_VISITORS_CHANNEL, { config: { presence: { key } } });
    const updateVisibility = () => {
      if (!subscribed || !contribute || !alive) return;
      if (document.visibilityState === "visible") void channel.track({ active: true });
      else void channel.untrack();
    };
    channel.on("presence", { event: "sync" }, () => {
      if (alive) setCount(countLiveVisitors(channel.presenceState<{ active?: boolean }>()));
    }).subscribe((status) => {
      subscribed = status === "SUBSCRIBED";
      if (!alive) return;
      setConnected(subscribed);
      if (subscribed) updateVisibility();
      else setCount(null);
    });
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", updateVisibility);
      void supabase.removeChannel(channel);
    };
  }, [contribute, enabled]);
  return { count, connected };
}