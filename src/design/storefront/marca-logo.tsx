// Logotipo de ejemplo de la base ("MARCA" en letras geométricas). Toma el color del texto.
// Para una marca nueva: reemplaza el viewBox y una forma (path) por letra.
export const LOGO_VIEWBOX = "-4 -4 488 108";
/** Una forma por letra. */
export const LOGO_LETTERS = [
  "M 0 100 L 0 0 L 20 0 L 40 45 L 60 0 L 80 0 L 80 100 L 62 100 L 62 38 L 46 75 L 34 75 L 18 38 L 18 100 Z",
  "M 100 100 L 132 0 L 148 0 L 180 100 L 161 100 L 154 78 L 126 78 L 119 100 Z M 131 62 L 149 62 L 140 30 Z",
  "M 200 100 L 200 0 L 250 0 Q 280 0 280 30 Q 280 55 256 59 L 282 100 L 260 100 L 236 61 L 218 61 L 218 100 Z M 218 16 L 218 45 L 248 45 Q 262 45 262 30 Q 262 16 248 16 Z",
  "M 380 30 L 362 30 Q 358 16 342 16 Q 320 16 320 50 Q 320 84 342 84 Q 358 84 362 70 L 380 70 Q 374 100 342 100 Q 300 100 300 50 Q 300 0 342 0 Q 374 0 380 30 Z",
  "M 400 100 L 432 0 L 448 0 L 480 100 L 461 100 L 454 78 L 426 78 L 419 100 Z M 431 62 L 449 62 L 440 30 Z",
];

export function MarcaLogo({ className, title = "Tu Marca" }: { className?: string; title?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} fill="currentColor" className={className} role="img" aria-label={title} focusable="false">
      {LOGO_LETTERS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
