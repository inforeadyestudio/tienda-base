// Envoltura de React para el visor 3D. Carga el visor (y three.js) solo cuando se monta.
import { useEffect, useRef, useState } from 'react';
import type { GlassesLook, GlassesViewer } from './marca-glasses-3d';

interface Props {
  model: string;            // URL del .glb (manifest.ts)
  look: GlassesLook;        // material del color elegido
  background: string;       // color liso del contenedor, ej. '#e2dccf'
  folded?: boolean;         // varillas cerradas
  className?: string;
  onReady?: (viewer: GlassesViewer) => void;
  onError?: () => void;     // sin WebGL o falló la carga: mostrar las fotos
}

export function Glasses3D({ model, look, background, folded = false, className, onReady, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<GlassesViewer | null>(null);
  const first = useRef({ look, background, onReady, onError });
  first.current = { look, background, onReady, onError };
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    import('./marca-glasses-3d')
      .then(({ createViewer }) => createViewer(canvas, { model, look: first.current.look, background: first.current.background, reducedMotion }))
      .then((viewer) => {
        if (dead) { viewer.dispose(); return; }
        viewerRef.current = viewer; setReady(true); first.current.onReady?.(viewer);
      })
      .catch(() => { if (!dead) first.current.onError?.(); });
    return () => { dead = true; viewerRef.current?.dispose(); viewerRef.current = null; setReady(false); };
  }, [model]);

  useEffect(() => { if (ready) viewerRef.current?.setLook(look); }, [ready, look.frame, look.lens]);
  useEffect(() => { if (ready) viewerRef.current?.setBackground(background); }, [ready, background]);
  useEffect(() => { if (ready) viewerRef.current?.setFold(folded ? 1 : 0); }, [ready, folded]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label="Gafa en 3D. Arrastra para girarla."
      style={{ display: 'block', width: '100%', height: '100%', cursor: 'grab', opacity: ready ? 1 : 0, transition: 'opacity 300ms' }}
    />
  );
}
