import { z } from "zod";

export const SIGNUP_DELAY_MS = 10_000;
export const SIGNUP_SETTINGS_KEY = "signup_discount";
export const signupSettingsSchema = z.object({
  enabled: z.boolean(),
  discountPct: z.number().int().min(1).max(100),
  imageUrl: z.union([z.string().url().refine((url) => url.startsWith("https://")), z.literal("")]),
  title: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(400),
  buttonText: z.string().trim().min(1).max(60),
  successText: z.string().trim().min(1).max(300),
});
export type SignupSettings = z.infer<typeof signupSettingsSchema>;
export const DEFAULT_SIGNUP_SETTINGS: SignupSettings = {
  enabled: false, discountPct: 10, imageUrl: "",
  title: "Bienvenida a Tu Marca",
  message: "Inscríbete y recibe {descuento}% de descuento en tus prendas favoritas.",
  buttonText: "Recibir mi descuento",
  successText: "Gracias por inscribirte. Tu código de descuento está listo.",
};
export function normalizeSignupSettings(raw: unknown): SignupSettings {
  const result = signupSettingsSchema.safeParse({ ...DEFAULT_SIGNUP_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) });
  return result.success ? result.data : DEFAULT_SIGNUP_SETTINGS;
}
export function signupCopy(text: string, percentage: number) { return text.replaceAll("{descuento}", String(percentage)); }
export function isSignupStorefrontPath(path: string) {
  return !/^\/(admin|pos|b2b|auth|reset-password|cuenta|api|pago-retorno|gracias|devolucion-dinero)(\/|$)/.test(path);
}
export const signupInputSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(100),
  email: z.string().trim().email("Escribe un correo válido").max(255).transform((value) => value.toLowerCase()),
  consent: z.literal(true, { errorMap: () => ({ message: "Acepta la política de privacidad para inscribirte" }) }),
  website: z.string().max(0).optional(),
});