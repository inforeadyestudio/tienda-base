// Modelos 3D por referencia. Un .glb por referencia; cada color del inventario se empareja por su código (C1, C2…).
// Nombre, precio, disponibilidad y fotos siguen saliendo del inventario: aquí solo vive qué material lleva cada color en el 3D.
// TODO(logica): cuando el panel tenga un campo "modelo 3D" por producto y "material 3D" por color, leerlo de ahí y borrar este archivo.
import type { GlassesLook } from './marca-glasses-3d';

export interface Glasses3DEntry { model: string; looks: Record<string, GlassesLook> }

// Ejemplo (la base no trae modelos):
//   import ref106 from './REF106.glb?url';
//   REF106: { model: ref106, looks: { C1: { frame: 'carey', lens: 'clear' } } },
export const GLASSES_3D: Record<string, Glasses3DEntry> = {};

/** Devuelve el modelo y el material del color, o null si esa referencia (o ese color) todavía no tiene 3D. */
export function glasses3dFor(reference: string, colorCode: string): { model: string; look: GlassesLook } | null {
  const entry = GLASSES_3D[reference.trim().toUpperCase()];
  const look = entry?.looks[colorCode.trim().toUpperCase()];
  return entry && look ? { model: entry.model, look } : null;
}
