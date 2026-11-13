// Credenciales privadas de integraciones (pagos, etc.). Solo servidor.
//
// Orden de lectura:
//   1. Variable del servidor (Vercel): el nombre de la clave en mayúsculas,
//      p. ej. `wompi_private_key` → WOMPI_PRIVATE_KEY. Es la forma recomendada.
//   2. Tabla `integration_secrets` (lo que se guarda desde el panel).

/** Nombre de la variable del servidor para una clave. */
export function secretEnvName(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Valor de la variable del servidor, o "" si no está. */
export function envSecret(key: string): string {
  return String(process.env[secretEnvName(key)] ?? "").trim();
}

/** Lee una credencial: variable del servidor primero, luego la tabla. */
export async function readSecret(db: any, key: string): Promise<string> {
  const fromEnv = envSecret(key);
  if (fromEnv) return fromEnv;
  const { data } = await db.from("integration_secrets").select("value").eq("key", key).maybeSingle();
  return String(data?.value ?? "").trim();
}
