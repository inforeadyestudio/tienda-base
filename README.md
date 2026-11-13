# Tienda base (Ready Studio)

Punto de partida sin marca para lanzar tiendas nuevas: tienda online, panel de
administración, POS, B2B y toda la lógica (inventario, pagos, facturación,
puntos, correos). Corre en **Vercel** con un **Supabase propio**.

Cada marca nueva es una copia independiente de este repo y se personaliza
completa. Las mejoras se pasan entre marcas a mano (`git cherry-pick` + SQL de
`db/changes/`).

## Crear una marca nueva
1. Copia este repo a un repo vacío de la marca (sin historial).
2. `node scripts/nueva-marca.mjs --nombre "Mi Marca" --dominio mimarca.com --instagram mimarca`
3. Ajusta `src/config/brand.ts` (razón social, NIT, teléfonos, direcciones),
   el logo (`src/design/storefront/marca-logo.tsx`), las fotos de ejemplo
   (`src/design/assets/marca/`, `src/assets/`, `public/`) y `src/lib/seo.ts`.
4. Crea el Supabase de la marca con el script de `db/` (ver `db/README.md`).
5. Crea el proyecto en Vercel conectado al repo y pon las variables de
   `.env.example` (las llaves las pone el dueño directo en Vercel).
6. Dominio: agrega el dominio en Vercel y crea los 2 registros DNS.

## Desarrollo local
```sh
bun install
cp .env.example .env   # y completa las variables
bun run dev
```
`bun run build`, `bun run typecheck`, `bun run test`.

Reglas de trabajo (roles Diseño / Ready Studio): `CLAUDE.md`. Historial: `docs/bitacora.md`.
