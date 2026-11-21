# SQL para pruebas

Copias del SQL de algunas funciones de la base (numeración de pedidos, códigos de
descuento, puntos, cambios por error de inventario, B2B, traslados, empaque),
tal como se crearon en el sistema del que salió esta tienda.

- **Solo las usan las pruebas** (`src/lib/**/*-database.test.js`), que montan una
  base de prueba en memoria y verifican esas reglas. **No se aplican a la base
  real** ni reemplazan a `db/changes/`.
- Las funciones existen hoy en la base de la marca (verificado el 21 nov 2026).
- El prefijo de la numeración de pedidos de `0051_b2b_order_number_channel.sql`
  es el de esta marca, igual que en su base real. Al crear una marca nueva desde
  la tienda base, cambiar ese prefijo aquí y en `order-number-database.test.js`.
- Si un cambio en `db/changes/` modifica alguna de estas funciones, actualizar
  aquí la copia y su prueba en el mismo commit.
