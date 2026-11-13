import { readAppSetting } from "@/lib/public-settings";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { supabase } from "@/integrations/supabase/client";
import { localizeAnnouncementItems } from "@/lib/announcement-items";
import { useLocale } from "@/lib/locale";

export const ANNOUNCEMENTS_KEY = "announcement_bars";

export type AnnouncementBar = { enabled: boolean; items: string[]; speed: number };
export type Announcements = { general: AnnouncementBar; wholesale: AnnouncementBar };

export const DEFAULT_ANNOUNCEMENTS: Announcements = {
  general: { enabled: false, items: ["Envíos a toda Colombia", "Nueva colección disponible"], speed: 30 },
  wholesale: { enabled: true, items: ["Costa Rica", "Panamá", "Colombia", "Perú", "Ecuador", "Estados Unidos"], speed: 30 },
};

function bar(raw: any, def: AnnouncementBar): AnnouncementBar {
  const items = Array.isArray(raw?.items) ? raw.items.map((s: any) => String(s).trim()).filter(Boolean) : def.items;
  const speed = Number(raw?.speed);
  return { enabled: typeof raw?.enabled === "boolean" ? raw.enabled : def.enabled, items, speed: speed >= 5 && speed <= 120 ? speed : def.speed };
}

export function normalizeAnnouncements(raw: any): Announcements {
  return { general: bar(raw?.general, DEFAULT_ANNOUNCEMENTS.general), wholesale: bar(raw?.wholesale, DEFAULT_ANNOUNCEMENTS.wholesale) };
}

export const announcementsQuery = () =>
  queryOptions({
    queryKey: ["app-settings", ANNOUNCEMENTS_KEY],
    staleTime: 60_000,
    queryFn: async () => {
      const data = { value: await readAppSetting(ANNOUNCEMENTS_KEY).catch(() => null) };
      return normalizeAnnouncements(data?.value);
    },
  });

export function useAnnouncements() {
  return useQuery(announcementsQuery()).data;
}

type BarItem = { text: string; fixed: boolean };

function Group({ items, hidden }: { items: BarItem[]; hidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {items.map((c, i) => (
        <span key={i} data-no-translate={c.fixed || undefined} className="flex items-center whitespace-nowrap px-6 font-nm text-[10.5px] uppercase tracking-[0.3em]">
          {c.text}
          <span className="ml-6 inline-block h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
        </span>
      ))}
    </div>
  );
}

export function MarqueeBar({ config, label }: { config?: AnnouncementBar; label: string }) {
  const reduce = useReducedMotion();
  const { lang, country } = useLocale();
  if (!config?.enabled || config.items.length === 0) return null;
  // El texto puede cambiar según idioma y país: «Envíos gratis» solo en Colombia.
  const shown = localizeAnnouncementItems(config.items, lang, country);
  const base: BarItem[] = config.items.map((text, i) => ({ text: shown[i] ?? text, fixed: (shown[i] ?? text) !== text }));
  // Repite para cubrir pantallas anchas aunque haya pocos textos.
  const reps = Math.max(1, Math.ceil(8 / config.items.length));
  const items = Array.from({ length: reps }, () => base).flat();
  return (
    <div className="overflow-hidden bg-brand-green py-2.5 text-brand-beige" role="region" aria-label={label}>
      <motion.div
        className="flex w-max"
        animate={reduce ? undefined : { x: ["0%", "-50%"] }}
        transition={{ duration: config.speed, ease: "linear", repeat: Infinity }}
      >
        <Group items={items} />
        <Group items={items} hidden />
      </motion.div>
    </div>
  );
}
