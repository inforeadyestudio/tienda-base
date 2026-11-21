# CLAUDE.md — Reglas para trabajar en Tu Marca

Este repositorio es la tienda y sistema operativo de **Tu Marca** (tienda online,
panel de administración, POS y B2B), creado a partir de la **tienda base** de
Ready Studio. Corre en **Vercel** con un **Supabase propio**; no depende de Lovable.
Hay dos roles. Identifica el tuyo antes de editar:

- **Diseño** (por defecto, y siempre para el diseñador): **solo diseño y
  animación**. Sigue todas las reglas de diseño de este archivo; la lógica de
  negocio está protegida y no se toca.
- **Ready Studio (dueño del sistema)**: solo cuando quien pide el cambio es el
  equipo de Ready Studio (Juan) y pide expresamente lógica, admin, integraciones
  o base de datos. Sigue la sección "Rol Ready Studio" al final.

Ante la duda, trabaja como **Diseño**.

## Siempre, en cualquier rol
1. **Antes de empezar:** trae lo último de `main` (`git pull`) y lee las
   últimas entradas de `docs/bitacora.md`. Otras personas y Claudes trabajan en
   paralelo sobre este mismo repo.
2. **Al terminar:** agrega tu entrada arriba en `docs/bitacora.md` (qué cambió,
   archivos, si tocó base de datos y avisos) en el mismo commit que subes.
3. Antes de subir, vuelve a traer `main`; si hay conflicto, resuélvelo sin
   borrar el trabajo de otros.

## Rama de diseño y vista previa en Vercel
El diseño se trabaja en la rama **`diseno`** (sin ñ), no directo en `main`.
Cada vez que se sube esa rama, Vercel publica sola una vista previa (la URL
`…-git-diseno-readystudio.vercel.app` del proyecto en Vercel). La tienda real
sale de `main`, también por Vercel.

1. **Empezar:** trae ambas ramas aunque el clon sea de una sola rama:
   `git fetch origin +refs/heads/main:refs/remotes/origin/main +refs/heads/diseno:refs/remotes/origin/diseno`,
   luego `git checkout diseno` (si no existe localmente:
   `git checkout -b diseno origin/diseno`), `git merge origin/diseno` y
   `git merge origin/main` para traer lo último. Lee la bitácora.
2. **Hacer el cambio** siguiendo las reglas de diseño de este archivo; corre
   `bunx vitest run src/design`; agrega la entrada en `docs/bitacora.md`.
3. **Subir a la rama:** `git commit` y `git push origin diseno`. En 1–2 minutos
   la vista previa queda actualizada en el link de arriba; compártelo para
   revisión (la vista previa usa la base de datos real: no hacer compras).
4. **Pasar a la tienda real** solo cuando la persona lo pida expresamente
   ("pásalo a main", "aprobado"): `git checkout main && git pull`,
   `git merge diseno`, `git push origin main`. Vercel publica `main` solo en
   1–2 minutos. Nunca `--force`.

## Lo que SÍ puedes editar
- `src/design/**` — componentes visuales, secciones, layouts.
- `src/design/tokens.css` — colores, tipografías, radios, animaciones.
- Clases Tailwind, markup y animaciones (CSS, GSAP, Framer) dentro de `src/design/**`.

## Lo que NUNCA puedes editar
- `src/logic/**` (contratos de datos y acciones).
- `src/lib/**`, `src/integrations/**`, `src/routes/api/**`, `src/server.ts`, `src/start.ts`.
- `supabase/`, `db/`, `scripts/`, `.env*`, `package.json`, `vite.config.ts`, `src/config/**`.
- Cualquier archivo de pagos (Bold, Wompi, Addi), facturación (R-Count, DIAN),
  inventario, POS, B2B, preventa, puntos/lealtad, correos o envíos.
- `src/routes/_authenticated/admin/**` y `src/routes/_authenticated/pos/**`.

Si necesitas un dato o una acción que no existe, **no lo inventes ni consultes la
base de datos**: deja una nota `// TODO(logica): necesito X` y pídelo.

**Cómo pedir lo que está fuera de `src/design/**`** (conectar un componente,
cambiar un archivo de rutas, lógica o base de datos): anótalo como
"Pendiente para Ready Studio" en tu entrada de `docs/bitacora.md` y dile a la
persona que se lo pida a **Juan (Ready Studio)**, que lo hace desde su sesión de
Claude con acceso a lógica y base de datos.

## Reglas del diseño
1. El diseño **no** importa `@/integrations/supabase`, archivos `*.functions`,
   `*.server`, `@tanstack/react-start` ni usa `fetch`. Lo verifica
   `src/design/design-boundary.test.js` (`bunx vitest run src/design`).
2. Datos y acciones llegan por props o desde `@/logic` (por ejemplo `useCart`,
   `addToCart`, `formatCOP`). No cambies sus firmas.
3. Precios, descuentos, stock, tallas disponibles, impuestos, envío y puntos
   **los calcula la lógica**. El diseño solo los muestra tal como llegan.
4. Usa tokens semánticos (`bg-background`, `text-foreground`, `bg-primary`…),
   nunca colores sueltos como `text-white` o `#hex` en componentes.
5. Marca: el nombre y los datos de la marca salen de `src/config/brand.ts`;
   el logo, de `src/design/storefront/marca-logo.tsx`.
6. Respeta accesibilidad: textos alternativos, foco visible, `prefers-reduced-motion`.
7. No borres ni renombres claves ya publicadas en el registro de secciones:
   las páginas guardadas dejarían de mostrarlas.

## Crear una sección nueva (aparece en el editor del panel)
1. Crea `src/design/sections/mi-seccion.tsx` exportando un `DesignSectionDef`:
   `label`, `group` ("Universal" | "Editorial" | "Signature"), `description`,
   `fields` (campos editables: text, textarea, media, color, number, boolean,
   select, products, product, collection…), `defaults` y `Component`.
2. `Component` recibe `{ props, layers, ctx }`. `props` son los valores que el
   equipo edita en el panel; `ctx.products` trae los productos de la página.
3. Regístrala en `src/design/sections/registry.ts` con una clave única
   `"design-..."`. Ya queda disponible para portada, colecciones y páginas.
   Ejemplo: `src/design/sections/example-headline.tsx`.

## Páginas
- Portada: `src/design/home/` (se arma con secciones del editor).
- Tienda: `src/design/shop/`.
- Producto: `src/design/product/`.
- Perfil del cliente: `src/design/account/`.

## Antes de terminar
- `bunx vitest run src/design` debe pasar.
- No dejes archivos fuera de `src/design/**` modificados.

## Página de producto
- Diseño completo: `src/design/product/product-page-view.tsx` (recibe `vm`).
- Lógica: `src/logic/product/use-product-page.ts` (`useProductPage`) — no tocar.
  `vm` trae producto, colores, tallas, stock/disponibilidad, precio y acciones
  (`pickColor`, `setVariantId`, `addToCart`, `buyNow`, looks, probador…).

## Tienda y perfil del cliente (mismo patrón: diseño recibe `vm`)
- Tienda: `src/design/shop/shop-page-view.tsx` ← `src/logic/shop/use-shop-page.ts`.
- Inicio de cuenta: `src/design/account/account-home-view.tsx` ← `src/logic/account/use-account-home.ts`.
- Mis pedidos: `src/design/account/orders-view.tsx` ← `src/logic/account/use-orders-page.ts`.
- Mi perfil: `src/design/account/profile-view.tsx` ← `src/logic/account/use-profile-page.ts`.

## Resto de la cuenta, menú, bolsa y reseñas (diseño recibe `vm`)
- Cuenta: `src/design/account/` → gift-lists-view, gift-list-editor-view, gift-items-view,
  gift-shipping-view (Regalos), wishlist-view, returns-view (Cambios), inbox-view,
  points-view, try-on-view. Su lógica está en `src/logic/account/`.
- Menú superior: `src/design/storefront/site-nav-view.tsx` y `nav-products-view.tsx`.
- Bolsa de compras: `src/design/storefront/cart-drawer-view.tsx` (el pago se abre con `vm.goToCheckout`).
- Reseñas: `src/design/product/product-reviews-view.tsx`.
- Lógica de estas piezas: `src/logic/storefront/` — no tocar.

## Productos en secciones
- Un campo `type: "products"` (o `"product"`) en `fields` basta: la lógica carga
  automáticamente esos productos reales del admin en `ctx.products`.
- En el `Component`, usa `pickProducts(props.<campo>, ctx)` para obtenerlos en orden.

## Rol Ready Studio (lógica, admin y base de datos)
- La base de datos es un Supabase propio de esta marca. Las llaves van como
  variables en Vercel (guía en `.env.example`); nunca en el código ni en el chat.
- Los cambios de base de datos se aplican **en vivo** al momento. Por eso:
  1. Primero el SQL, después el código. Nunca subas código que dependa de una
     columna o función que todavía no existe.
  2. Cambios compatibles: agregar columnas/funciones; no renombrar ni borrar
     algo que el código publicado todavía usa.
  3. Guarda cada cambio de base en `db/changes/AAAAMMDD_descripcion.sql`
     (registro histórico, y la forma de pasar mejoras entre marcas).
  4. Nunca apliques SQL que borre o modifique datos en bloque sin confirmación.
- Pagos, facturación (R-Count/DIAN), inventario, POS, B2B y lealtad: cambios
  mínimos, con prueba, y explicando el impacto antes de subir.
- Las funciones nuevas en `public` reciben `EXECUTE` para `anon` y
  `authenticated` por defecto: si una función privilegiada no debe ser pública,
  revoca explícitamente.
- No reescribas historia publicada (`--force`, rebase de commits ya subidos).

### Integraciones (todas directas, con llave propia)
- IA: `src/lib/ai.server.ts` (`AI_PROVIDER` openai | google). Recortes de fotos
  y voz en tiempo real usan OpenAI.
- Correos: Resend directo (`RESEND_API_KEY`), `src/lib/email/resend.server.ts`.
- Meta (CAPI e informes): token propio (`META_ACCESS_TOKEN`, `META_PIXEL_ID`).
- Ingreso con Google: proveedor Google de Supabase Auth.
- Llaves de pago: variables del servidor primero y, si no están, la tabla
  `integration_secrets` (`src/lib/secrets.server.ts`).
- Dominios permitidos para retornos de pago: `src/lib/store-hosts.server.ts`.

### Pasar mejoras entre marcas
Cada marca es un repo independiente. Una mejora se lleva a otra marca con
`git cherry-pick` del commit y aplicando su SQL de `db/changes/`.


<!-- ready:verificacion:inicio — sección común a todos los repos de Ready Studio; para cambiarla, cámbiala en todos -->
## Verificación (obligatorio antes de decir "listo")

Nada se da por terminado sin evidencia. "Debería funcionar" no cuenta.

### Nivel de verificación según el cambio
- **Cambio pequeño** (textos, colores, estilos, un componente visual sin lógica): solo el build (paso 2) y una revisión rápida de la pantalla en el navegador. Reporte de 2–3 líneas.
- **Cambio de lógica o de datos** (pagos, saldos, reservas, inventario, contabilidad, permisos, migraciones, edge functions, integraciones): verificación completa, pasos 1 a 6.
- **Si Juan escribe "rápido" o "sin verificar"** en el pedido: solo el build, y en el reporte y el commit marca `Verificado: no`.
- Si no está claro en qué nivel cae, usa la verificación completa.

### 1. Antes de escribir código
- Convierte lo pedido en criterios de aceptación comprobables.
  Ej: "al pagar una reserva, la cancha aparece ocupada y el pago queda en `payments` con estado `paid`".
- Si no puedes decir cómo se comprobaría, pregunta antes de construir.

### 2. Chequeos rápidos (siempre)
- `npm run build` sin errores; `tsc --noEmit` y `lint` si existen.
- Tests existentes en verde. Nunca modificar, saltar ni borrar un test para que pase.

### 3. Probar el cambio como un usuario
- Trabaja en una rama, no directo en `main`.
- Si el repo está en Vercel, usa el preview de esa rama. Si no, levanta la app (`npm run dev`) y pruébala ahí.
- Recorre en el navegador el flujo completo de los criterios con el usuario de prueba del sistema y toma captura del resultado.
- Revisa la consola del navegador y los logs (Vercel, edge functions de Supabase): cero errores nuevos.
- Si el cambio guarda datos, confírmalo con una consulta SQL de solo lectura en Supabase.
- Solo datos de prueba: nunca crear, editar ni borrar datos reales de clientes para probar.

### 4. Según lo que toque el cambio
- Tablas, migraciones o RLS → `get_advisors` de Supabase sin alertas nuevas, y probar que un usuario sin permiso NO ve los datos.
- Pagos, saldos, POS, inventario o contabilidad → caso normal + al menos un caso límite (pago duplicado, cancelación, monto 0). Nada queda negativo ni descuadrado.
- Edge function → invocarla y revisar sus logs.
- UI → revisar en escritorio y en móvil (375 px).
- Integraciones (DIAN/Factus, WhatsApp, OpenAI, pasarelas de pago) → solo en modo prueba o sandbox.

### 5. Reporte final (siempre en este formato)
- **Pedido:** …
- **Criterios de aceptación:** …
- **Qué corrí → resultado:** comando o flujo → ✅/❌, con salida o captura
- **Lo que NO pude verificar y por qué:** …
- **Qué debe revisar Juan antes de publicar:** …

### 6. Límites
- Si un chequeo sigue fallando después de 3 intentos, detente y repórtalo. No sigas parchando.
- No edites esta sección, los tests ni la configuración de CI para que un cambio pase.
- Pasa a `main` solo con la verificación completa y la aprobación de Juan (en repos conectados a Vercel, `main` es producción).
- En el commit indica `Verificado: sí / parcial / no` y qué se verificó.
- Claude no maneja claves ni secretos: si una prueba los necesita, pídeselos a Juan o déjala como "no verificado".

### Cómo verificar este sistema
<!-- Completar por sistema. Si está vacío, al terminar la primera tarea propón a Juan cómo llenarlo. -->
- **URL de producción / preview:** (por definir)
- **Usuario de prueba:** (por definir — sin datos reales)
- **Flujos críticos que nunca se pueden romper:** (por definir)
<!-- ready:verificacion:fin -->

## Pruebas automáticas (GitHub Actions)
- Cada push (a cualquier rama) corre el workflow «Calidad» (`.github/workflows/calidad.yml`, lógica en `.github/calidad.sh`): build, tipos, lint, tests unitarios y auditoría de dependencias.
- Después de subir un cambio, confirmar que «Calidad» quedó en verde (pestaña Actions de GitHub o `gh run list --workflow calidad.yml -L 1`). Si un paso bloqueante falla, se arregla el código; nunca el test, `calidad.sh` ni el workflow.
- En el workflow, los pasos con `'false'` solo informan porque ya fallaban cuando se montó (21 nov 2026). Cuando se arreglen, pasarlos a `'true'` con aprobación de Juan.
- Los tests que se conectan a la base de datos real no corren en CI. Los tests nuevos deben ser unitarios: sin red ni datos reales.
- Si el cambio toca cobros, saldos, inventario, contabilidad o permisos: crear o actualizar el test unitario que lo cubre.
