import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, MapPin, Phone } from "lucide-react";
import { AppointmentModal } from "@/components/storefront/appointment-modal";
import { Button } from "@/components/ui/button";
import { mapEmbedUrl, mapLinkUrl, storesQuery, type StoreProfile } from "@/lib/stores";
import boardAsset from "@/assets/store-collage-board.png";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

type Props = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

// Card positions measured on the board background (3 columns × 4 rows), in % of the image.
const COLS = [12.7, 39.2, 65.6];
const ROWS = [7.1, 29.3, 51.6, 73.7];
const CARD_W = 23.8;
const CARD_H = 19.8;
const SLOTS = ROWS.flatMap((top) => COLS.map((left) => ({ top, left })));
const ROTATIONS = [-0.8, 0.6, -0.5, 0.7, -0.6, 0.5, -0.7, 0.8, -0.4, 0.6, -0.5, 0.7];

function StorePhotoCollage({ store, board }: { store: StoreProfile; board: string }) {
  const photos = (store.gallery_urls.length ? store.gallery_urls : store.photo_url ? [store.photo_url] : []).slice(0, SLOTS.length);
  return (
    <div className="relative w-full">
      <img src={board} alt="" className="w-full select-none" draggable={false} />
      {SLOTS.map((slot, i) => {
        const url = photos[i];
        if (!url) return null;
        return (
          <div
            key={i}
            className="absolute overflow-hidden shadow-[0_8px_16px_-8px_rgb(0_0_0/0.35)]"
            style={{
              top: `${slot.top}%`,
              left: `${slot.left}%`,
              width: `${CARD_W}%`,
              height: `${CARD_H}%`,
              transform: `rotate(${ROTATIONS[i % ROTATIONS.length]}deg)`,
            }}
          >
            <img src={url} alt={`${store.name} · foto ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
            <span
              className="absolute left-1/2 top-1.5 h-[7%] min-h-[9px] aspect-square -translate-x-1/2 rounded-full"
              style={{
                background: "radial-gradient(circle at 35% 30%, #f2ede2 0%, #c9c2b2 45%, #8d8574 100%)",
                boxShadow: "0 3px 5px rgb(0 0 0 / 0.45), inset 0 -1px 2px rgb(0 0 0 / 0.3), inset 0 1px 1px rgb(255 255 255 / 0.6)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function StoreCollageScene({ props }: Props) {
  const { data: stores = [] } = useQuery(storesQuery());
  const [booking, setBooking] = useState<StoreProfile | null>(null);
  const visible = stores.filter((store) => store.visible);
  const store = visible.find((item) => item.location_id === props.storeId) ?? visible[0];

  if (!store) {
    return <section className="bg-ivory px-6 py-20 text-center text-sm text-moss">Selecciona una tienda visible para esta sección.</section>;
  }

  const collageFirst = props.collageSide !== "right";

  return (
    <section className={cn("bg-ivory text-ink", props.hideOnMobile && "hidden md:block")}>
      {(props.title || props.intro) && (
        <header className="mx-auto max-w-3xl px-6 pb-12 pt-16 text-center md:pb-16 md:pt-20">
          {props.eyebrow && <p className="font-nm text-[10px] uppercase tracking-[0.28em] text-moss/60">{props.eyebrow}</p>}
          {props.title && <h1 className="mt-3 font-brown-sugar text-5xl text-moss md:text-6xl">{props.title}</h1>}
          {props.intro && <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-moss">{props.intro}</p>}
        </header>
      )}

      <div className="mx-auto grid max-w-7xl gap-8 px-5 pb-20 md:grid-cols-2 md:items-center md:gap-12 md:px-8 md:pb-28">
        <div className={cn(!collageFirst && "md:order-2")}><StorePhotoCollage store={store} board={props.boardImage || boardAsset} /></div>
        <div className={cn(!collageFirst && "md:order-1")}>
          <h2 className="font-serif text-2xl text-ink md:text-3xl">{store.name}</h2>
          <p className="mt-4 flex items-start gap-2 text-[15px] leading-relaxed text-moss">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{store.address}{store.city ? `, ${store.city}` : ""}</span>
          </p>
          {props.showHours !== false && store.hours_note && (
            <p className="mt-2 flex items-start gap-2 text-[15px] text-moss"><Clock className="mt-0.5 h-4 w-4 shrink-0" /><span>{store.hours_note}</span></p>
          )}
          {props.showPhone !== false && store.phone && (
            <p className="mt-2 flex items-center gap-2 text-[15px] text-moss"><Phone className="h-4 w-4 shrink-0" /><span>{store.phone}</span></p>
          )}
          {props.showMap !== false && (
            <div className="mt-6 aspect-[16/9] w-full overflow-hidden border border-ink/10">
              <iframe title={`Mapa ${store.name}`} src={mapEmbedUrl(store)} loading="lazy" className="h-full w-full" referrerPolicy="no-referrer-when-downgrade" />
            </div>
          )}
          {props.showActions !== false && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button type="button" onClick={() => setBooking(store)} className="rounded-none bg-ink px-6 font-nm text-[10px] uppercase tracking-[0.2em] text-ivory hover:bg-ink/85">Solicitar cita</Button>
              <Button variant="link" asChild className="h-auto rounded-none border-b border-ink p-0 pb-1 font-nm text-[10px] uppercase tracking-[0.2em] text-ink">
                <a href={mapLinkUrl(store)} target="_blank" rel="noreferrer">Cómo llegar</a>
              </Button>
            </div>
          )}
        </div>
      </div>
      {booking && <AppointmentModal store={booking} onClose={() => setBooking(null)} />}
    </section>
  );
}
