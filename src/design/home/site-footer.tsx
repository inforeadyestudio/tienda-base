// Footer Tu Marca: simple y sobrio, todo en IBM Plex Mono; sin logo grande.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Iso } from "@/design/sections/marca/shared";

const A = "marca-mono text-[10.5px] text-marca-cacao no-underline hover:underline hover:underline-offset-[3px]";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function SiteFooter() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) { setMsg({ text: "Revisa tu correo", err: true }); return; }
    // TODO(logica): necesito subscribeNewsletter(email) en @/logic; hoy no se guarda el correo.
    setMsg({ text: "Listo · te escribiremos pronto", err: false });
  };
  return (
    <footer className="marca mt-0 bg-marca-paper">
      <div className="mx-auto max-w-[1240px] px-5 pb-[26px] pt-16">
        <div className="grid grid-cols-2 items-start gap-x-5 gap-y-[30px] md:grid-cols-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] lg:gap-10">
          <form onSubmit={submit} noValidate className="col-span-2 md:col-span-3 lg:col-span-1">
            <label htmlFor="marca-foot-email" className="marca-mono marca-mono-soft mb-1.5 block">Newsletter · 10% en tu primera compra</label>
            <div className="marca-field max-w-[420px]">
              <input id="marca-foot-email" type="email" placeholder="Tu correo" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button type="submit" className="marca-bk">Enviar</button>
            </div>
            <div role="status" className={`marca-mono mt-2 min-h-[1.2em] text-[10px] ${msg?.err ? "text-marca-burdeos" : ""}`}>{msg?.text}</div>
          </form>
          <nav aria-label="Tienda" className="grid justify-items-start gap-[9px]">
            <Link to="/tienda" className={A}>Tienda</Link>
            <Link to={"/coleccion/todo" as never} className={A}>Colecciones</Link>
            <Link to="/our-world" className={A}>Nosotros</Link>
          </nav>
          <nav aria-label="Ayuda" className="grid justify-items-start gap-[9px]">
            <Link to="/cambios-y-devoluciones" className={A}>Cambios y garantía</Link>
            <Link to="/terminos" className={A}>Términos</Link>
            <Link to="/privacidad" className={A}>Datos personales</Link>
            <Link to="/contacto" className={A}>Contacto</Link>
          </nav>
          <div className="grid justify-items-start gap-[9px]">
            <a href="https://www.instagram.com/tumarca/" target="_blank" rel="noreferrer" className={A}>Instagram</a>
            <a href="mailto:hola@tumarca.com" className={A}>hola@tumarca.com</a>
          </div>
        </div>
        <div className="mt-14 grid grid-cols-1 items-center justify-items-center gap-4 border-t border-marca-line pt-4 text-center md:grid-cols-[1fr_auto_1fr] md:justify-items-stretch md:text-left">
          <span className="marca-mono marca-mono-soft">© {new Date().getFullYear()} Tu Marca</span>
          <Iso className="w-[22px] text-marca-cacao" spin={false} />
          <span className="marca-mono marca-mono-soft md:text-right">Tu frase de marca va aquí.</span>
        </div>
      </div>
    </footer>
  );
}
