import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppointmentModal } from "@/components/storefront/appointment-modal";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { storesQuery, type StoreProfile } from "@/lib/stores";

export function ServiceBand() {
  const { data: stores = [] } = useQuery(storesQuery());
  const [booking, setBooking] = useState<StoreProfile | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const firstStore = stores.find((store) => store.visible) ?? null;

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.user));
    });
    return () => { active = false; };
  }, []);

  return (
    <section className="border-t border-ink/10">
      <div className="max-w-[1500px] mx-auto grid grid-cols-1 md:grid-cols-3">
        <div className="border-b border-ink/10 px-8 py-16 text-center md:border-b-0 md:border-r">
          <h3 className="font-brown-sugar text-xl text-moss md:text-2xl">Concertar una cita en la tienda</h3>
          <p className="mx-auto mt-6 max-w-[32ch] text-sm leading-relaxed text-moss/70">Cali, Bogotá — atención personalizada con nuestras asesoras.</p>
          <Button type="button" variant="link" disabled={!firstStore} onClick={() => firstStore && setBooking(firstStore)} className="mt-5 h-auto rounded-none border-b border-moss p-0 pb-1 font-nm text-[10px] uppercase tracking-[0.18em] text-moss">
            Agendar cita
          </Button>
        </div>
        <div className="border-b border-ink/10 px-8 py-16 text-center md:border-b-0 md:border-r">
          <h3 className="font-brown-sugar text-xl text-moss md:text-2xl">Cambios y devoluciones</h3>
          <p className="mx-auto mt-6 max-w-[32ch] text-sm leading-relaxed text-moss/70">Gestiona el cambio de una prenda o solicita una devolución desde tu cuenta.</p>
          <Button variant="link" asChild className="mt-5 h-auto rounded-none border-b border-moss p-0 pb-1 font-nm text-[10px] uppercase tracking-[0.18em] text-moss">
            <Link to="/cuenta/cambios">Solicitar cambio</Link>
          </Button>
        </div>
        <div className="px-8 py-16 text-center">
          <h3 className="font-brown-sugar text-xl text-moss md:text-2xl">Tu espacio Tu Marca</h3>
          <p className="mx-auto mt-6 max-w-[32ch] text-sm leading-relaxed text-moss/70">Guarda tus favoritos, consulta pedidos y crea tus propios looks.</p>
          <Button variant="link" asChild className="mt-5 h-auto rounded-none border-b border-moss p-0 pb-1 font-nm text-[10px] uppercase tracking-[0.18em] text-moss">
            <Link to={signedIn ? "/cuenta" : "/auth"}>{signedIn ? "Ir a mi cuenta" : "Crear cuenta"}</Link>
          </Button>
        </div>
      </div>
      {booking && <AppointmentModal store={booking} onClose={() => setBooking(null)} />}
    </section>
  );
}
