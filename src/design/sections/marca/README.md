# Secciones Tu Marca (`design-marca-*`)

Secciones del home de ejemplo, editables desde el panel (Tienda online → Diseño → Editar páginas/Home → Agregar sección).
Todas comparten «Fondo de la sección» (blanco papel por defecto, marfil o igual a la página) y «Ocultar en móvil».

| Clave | En el panel | Qué hace |
|---|---|---|
| `design-marca-banner` | Tu Marca · Banner de campaña (ancho completo) | Banner tradicional: foto o video de campaña a todo el ancho con antetítulo, título y botón. |
| `design-marca-entrada` | Tu Marca · Banner de entrada (productos) | Galería horizontal de gafas frontales que pasa sola; la del centro en foco y las de los lados desenfocadas. |
| `design-marca-hero` | Tu Marca · Portada de campaña | Tres fotos impresas que se barajan al tocar, tarjeta de papel parafinado con isotipo animado y dos botones. |
| `design-marca-indice` | Tu Marca · Índice de referencias | Los nombres pasan detrás con el scroll; la foto alterna producto / campaña y al final se abre a pantalla completa con la frase. |
| `design-marca-coleccion` | Tu Marca · Colección en retícula | Fichas sobre piedra, foto de modelo al pasar el cursor, colores, precio y pestañas. |
| `design-marca-capitulo` | Tu Marca · Capítulo con video | Video o foto a sangre con tarjeta y botón; dos fotos escalonadas que cambian a su toma hermana. |
| `design-marca-galeria` | Tu Marca · Galería de modelos | Carrusel infinito; solo la foto del centro muestra ficha y precio. |
| `design-marca-fosforos` | Tu Marca · Choose your match | Caja de fósforos realista; cada fósforo es una forma con sus productos. |
| `design-marca-tira` | Tu Marca · Tira de campaña | Fotos de una campaña en una tira que se arrastra, con barra de progreso. |
| `design-marca-niebla` | Tu Marca · Franja collage (niebla, fotos, productos y fósforos) | Franja diagramada en desorden: isotipo y frase, fotos con niebla que el cursor aclara, fotos normales, flipbook, productos del inventario y la caja de fósforos (al encender uno cambian los productos). |
| `design-marca-moodboard` | Tu Marca · Moodboard de colección | Fotos de la colección sueltas en un lienzo desequilibrado, dos productos sobre pastillas de color, el nombre de la colección y un sello con el isotipo. Sin fotos elegidas usa las fotos de modelo de los productos. Pensada para páginas de colección. |
| `design-marca-servicio` | Tu Marca · Franja de servicio | Cuatro datos cortos entre líneas finas. |
| `design-marca-tagline` | Tu Marca · Tagline | «Tu frase de marca va aquí.» en IBM Plex Mono. |

Orden sugerido de la portada: banner de campaña → banner de entrada (gafas) → portada de campaña → índice → colección → capítulo con video → galería → tira → franja collage (ya trae los fósforos) → servicio. «Choose your match» sigue disponible como sección sola.

- Estilos y tipografías: `src/design/tokens.css` (tokens `marca-*`, clases `.marca-*` en la capa `components`).
- Fotos y video de ejemplo: `src/design/assets/marca/` (solo para los valores por defecto). Si el panel guardó la URL de desarrollo (`/src/design/assets/marca/…`) o la de otra publicación (`/assets/…-HASH.jpg`), `marca/assets.ts` la cambia por la URL real al pintar la sección (se aplica en `registry.ts`).
- Productos: todo lo que muestra producto (nombre, foto de producto, precio, colores, enlace) sale del inventario del dashboard por `ctx.products`. Las secciones usan los productos elegidos en su campo «Productos» y, si no hay, los productos de la página (`sectionProducts`). No hay nombres, fotos de producto ni precios de ejemplo en los valores por defecto. Si a una sección le faltan productos, en el editor aparece un aviso (`EditorHint`) y en la tienda no se muestra.
- Fotos de modelo y de campaña son medios del panel: en Galería e Índice van en el mismo orden que los productos, que ponen nombre, precio y enlace.
- TODO(logica): las fotos de modelo (carpeta MODELO, por referencia y color) todavía no están en el inventario; si se cargan como fotos del producto marcadas como «modelo», las secciones y el catálogo las pueden usar solas.
- Tipografía de marca: Roboto Condensed (títulos, mayúscula) y Roboto Light (texto); IBM Plex Mono para detalles. Todas libres (OFL).
