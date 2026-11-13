export type FrameLook = 'negro' | 'carey' | 'cafe' | 'gris';
export type LensLook = 'clear' | 'grey' | 'brown';
export interface GlassesLook { frame: FrameLook; lens: LensLook }
export interface GlassesView { azimuth: number; polar: number; distance: number }
export interface GlassesViewerOptions {
  /** URL del .glb o su ArrayBuffer */
  model: string | ArrayBuffer;
  look?: GlassesLook;
  /** Color liso del contenedor: el visor pinta fondo y piso de ese color. Por defecto #e2dccf */
  background?: string;
  /** Zoom con rueda / pellizco. Por defecto false: la página sigue haciendo scroll sobre el visor */
  zoom?: boolean;
  reducedMotion?: boolean;
}
export interface GlassesViewer {
  setLook(look: GlassesLook): GlassesLook;
  /** 0 = varillas abiertas, 1 = cerradas (10 cuadros, stop motion) */
  setFold(t: number, instant?: boolean): void;
  /** Grados y metros. Vistas: 3/4 (40, 80, 0.46) · frente (0, 86, 0.40) · lateral (-90, 86, 0.50) · atrás (-150, 72, 0.47) */
  setView(azimuth: number, polar: number, distance: number, instant?: boolean): void;
  getView(): GlassesView;
  /** Se llama cada vez que la cámara se mueve (arrastre o setView) */
  onViewChange?: (view: GlassesView) => void;
  setAutoRotate(on: boolean): void;
  onAutoRotate?: (on: boolean) => void;
  setBackground(color: string): void;
  resize(): void;
  dispose(): void;
}
export const LOOKS: { frames: FrameLook[]; lenses: LensLook[] };
export function createViewer(canvas: HTMLCanvasElement, opts: GlassesViewerOptions): Promise<GlassesViewer>;
