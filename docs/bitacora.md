# Bitácora de la tienda base

Registro compartido entre todas las personas y Claudes que trabajan en este repo
(Ready Studio, diseño). **Léela al empezar** (al menos las últimas entradas) y
**agrega una entrada al terminar** cada cambio que subas.

Formato (la más reciente arriba):

```
## AAAA-MM-DD — Rol (Diseño / Ready Studio) — título corto
- Qué cambió y para qué (en lenguaje simple).
- Archivos o pantallas tocados.
- Base de datos: sí/no (si sí, archivo en db/changes/).
- Pendiente o aviso para los demás.
```

---

## 2026-11-12 — Ready Studio — Creación de la tienda base (sin marca, lista para Vercel)
- Copia del sistema de una tienda en operación (tienda + admin + POS + B2B +
  lógica), **sin historial**, sin marca y sin depender de Lovable.
- **Marca:** nombre de ejemplo "Tu Marca" en todo el proyecto; datos de la marca
  en `src/config/brand.ts` (razón social, NIT, correos, WhatsApp, dominio,
  Instagram, remitente, Meta Pixel). `node scripts/nueva-marca.mjs` cambia
  nombre, dominio e Instagram de una vez. Logo e isotipo de ejemplo
  (`marca-logo.tsx`, `sections/marca/shared.tsx`). Todas las fotos y videos son
  marcadores grises de ejemplo. SEO genérico (`src/lib/seo.ts`). Meta Pixel solo
  se carga si existe `VITE_META_PIXEL_ID`.
- **Sin Lovable:**
  - IA directa con llave propia: `src/lib/ai.server.ts` (`AI_PROVIDER` openai |
    google). Traducciones, asistente, clóset/visión, looks, inventario IA,
    dictado del pago e intención pasan por ahí. Recortes de fotos y voz en
    tiempo real usan OpenAI (`OPENAI_API_KEY`).
  - Correos: Resend directo (`RESEND_API_KEY`).
  - Meta CAPI e informes: Graph API directa (`META_ACCESS_TOKEN`, `META_PIXEL_ID`).
  - Ingreso con Google: proveedor Google de Supabase Auth (hay que activarlo en
    el Supabase de cada marca).
  - Archivos que vivían en el hosting de Lovable (`/__l5e/...`): ahora son
    archivos locales en `src/assets/` (marcadores de ejemplo).
  - Se quitaron `lovable-error-reporting`, `previewAuthStorage`, `cron-auth`,
    `@lovable.dev/cloud-auth-js` y `@lovable.dev/vite-tanstack-config`
    (`vite.config.ts` es TanStack Start + Nitro puro; en Vercel se detecta solo).
  - El archivo de dependencias (`bun.lock`) se regeneró contra el registro
    público de npm (antes apuntaba a un registro de Lovable).
- **Pagos:** las llaves se leen primero de variables del servidor
  (`WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`, …) y, si no están, de la tabla
  `integration_secrets` (`src/lib/secrets.server.ts`). Retornos de pago solo al
  dominio de la marca y a los despliegues del proyecto en Vercel
  (`src/lib/store-hosts.server.ts`).
- Variables necesarias: `.env.example`.
- Base de datos: no (todavía no hay Supabase de plantilla).
- **Pendientes / avisos:**
  - `db/plantilla.sql` (estructura completa sin datos) está pendiente.
  - En la base de datos de origen, el prefijo de pedidos (`LU-…`) y las sedes
    (Cali/Bogotá) están dentro de funciones SQL; al crear la plantilla hay que
    dejarlos configurables. En el código también quedan sedes fijas `cali` /
    `bogota` (recibos POS, correos de traslados, filtros de disponibilidad).
  - El logo de Addi (`src/assets/addi-logo-black.png`) es un marcador de texto:
    reemplazar por el oficial si la marca usa Addi.
  - El visor 3D de producto quedó sin modelos (`glasses3d/manifest.ts` vacío).
  - Tipografías: se quitaron las que estaban alojadas en Lovable; el texto base
    usa Inter.
  - Pruebas: 19 archivos de prueba ya fallaban en el repo de origen (leen
    migraciones SQL que no existen en el repo o usan otro formato de pruebas);
    quedaron igual. El resto pasa (`bun run test`), `bun run typecheck` y
    `bun run build` pasan.
