/** Extracción local (instantánea) de datos dictados por voz en el checkout. */

export type VoiceFields = Partial<{
  firstName: string;
  lastName: string;
  documentId: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  department: string;
  country: string;
}>;

const NUMBER_WORDS: Record<string, string> = {
  cero: "0", uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4", cinco: "5",
  seis: "6", siete: "7", ocho: "8", nueve: "9", diez: "10", once: "11", doce: "12",
  trece: "13", catorce: "14", quince: "15", dieciseis: "16", diecisiete: "17",
  dieciocho: "18", diecinueve: "19", veinte: "20", treinta: "30", cuarenta: "40",
  cincuenta: "50", sesenta: "60", setenta: "70", ochenta: "80", noventa: "90", cien: "100",
};

const CITIES: Record<string, string> = {
  "bogota": "Cundinamarca", "medellin": "Antioquia", "cali": "Valle del Cauca",
  "barranquilla": "Atlántico", "cartagena": "Bolívar", "bucaramanga": "Santander",
  "pereira": "Risaralda", "manizales": "Caldas", "armenia": "Quindío",
  "santa marta": "Magdalena", "cucuta": "Norte de Santander", "ibague": "Tolima",
  "villavicencio": "Meta", "pasto": "Nariño", "neiva": "Huila", "monteria": "Córdoba",
  "popayan": "Cauca", "palmira": "Valle del Cauca", "tulua": "Valle del Cauca",
  "buenaventura": "Valle del Cauca", "envigado": "Antioquia", "sabaneta": "Antioquia",
  "bello": "Antioquia", "rionegro": "Antioquia", "chia": "Cundinamarca",
  "soacha": "Cundinamarca", "sincelejo": "Sucre", "valledupar": "Cesar",
  "riohacha": "La Guajira", "tunja": "Boyacá", "florencia": "Caquetá",
  "yopal": "Casanare", "quibdo": "Chocó", "monteria ": "Córdoba",
};

const STREET = "(?:carrera|kra|cra|calle|cll|avenida|avenida carrera|av|transversal|trans|tv|diagonal|diag|dg|circular|circunvalar|autopista|manzana)";

const strip = (text: string) =>
  text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const titleCase = (text: string) =>
  text.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

/** Convierte números hablados sueltos a dígitos y limpia muletillas. */
export function normalizeSpeech(raw: string) {
  let text = ` ${raw.trim()} `;
  for (const [word, digit] of Object.entries(NUMBER_WORDS)) {
    text = text.replace(new RegExp(`(?<=[\\s#-])${word}(?=[\\s.,-])`, "gi"), digit);
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

function emailFrom(text: string) {
  const spoken = text
    .replace(/\s*(arroba|at)\s*/gi, "@")
    .replace(/\s*punto\s*/gi, ".")
    .replace(/\s*guion bajo\s*/gi, "_")
    .replace(/\s*guion\s*/gi, "-")
    .replace(/(?<=[\w.@-])\s+(?=[\w.@-])/g, "");
  const match = spoken.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0].toLowerCase();
}

function digitsAfter(text: string, labels: string) {
  const match = text.match(new RegExp(`(?:${labels})[^0-9]{0,20}([0-9][0-9\\s.]{5,})`, "i"));
  if (!match) return undefined;
  const digits = match[1].replace(/[^0-9]/g, "");
  return digits.length >= 6 ? digits : undefined;
}

/** Interpreta un fragmento dictado y devuelve solo los campos reconocidos. */
export function extractFields(rawText: string): VoiceFields {
  const text = normalizeSpeech(rawText);
  const flat = strip(text);
  const out: VoiceFields = {};

  const email = emailFrom(text);
  if (email) out.email = email;

  const document = digitsAfter(flat, "cedula|documento|identificacion|c\\.c");
  if (document) out.documentId = document;

  const phone = digitsAfter(flat, "celular|telefono|cel|movil|numero de contacto|whatsapp");
  if (phone) out.phone = phone;
  if (!phone && !document) {
    const loose = flat.replace(/[^\d\s]/g, " ").match(/\b(3\d[\d\s]{7,})\b/);
    if (loose) {
      const digits = loose[1].replace(/\D/g, "");
      if (digits.length >= 10) out.phone = digits.slice(0, 10);
    }
  }

  const name = text.match(/(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,3})/i);
  if (name) {
    const parts = name[1].trim().split(/\s+/).filter((w) => w.length > 1);
    if (parts[0]) out.firstName = titleCase(parts[0]);
    if (parts.length > 1) out.lastName = titleCase(parts.slice(1).join(" "));
  }

  const address = text.match(new RegExp(`${STREET}\\s+[^,]{2,70}`, "i"));
  if (address) {
    let line = address[0]
      .replace(/\s*(numero|nro|no)\s*/gi, " # ")
      .replace(/\s*(guion|menos)\s*/gi, "-")
      .replace(/\s+(apartamento|apto|apt|torre|casa|interior|oficina|local|piso|bloque|conjunto)\b[\s\S]*$/i, "")
      .replace(/\s+en\s+[a-záéíóúñ\s]+$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    line = line.replace(/#\s+/g, "#").replace(/\s+-\s+/g, "-");
    if (line.length > 4) out.line1 = titleCase(line);
  }

  const complement = text.match(/\b(apartamento|apto|apt|torre|casa|interior|oficina|local|piso|bloque|conjunto)\b\s*([\w\s-]{1,24})/i);
  if (complement) out.line2 = titleCase(`${complement[1]} ${complement[2]}`.trim());

  for (const [city, department] of Object.entries(CITIES)) {
    if (new RegExp(`\\b${city}\\b`).test(flat)) {
      out.city = titleCase(city);
      out.department = department;
      out.country = "Colombia";
      break;
    }
  }

  return out;
}

/** Detección local de la intención de avanzar, por si la decisión remota tarda. */
export function localAdvance(rawText: string) {
  return /\b(continuar|continua|sigue|siguiente|listo|ya esta|ya está|avanza|next)\b/i.test(rawText);
}
