// Códigos postales base por ciudad (Colombia). Sirven como sugerencia en el
// checkout y como respaldo al generar guías cuando el cliente no lo escribió.
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const BASE: Record<string, string> = {
  bogota: "110111", "bogota d.c.": "110111", "bogota, d.c.": "110111",
  medellin: "050001", envigado: "055420", sabaneta: "055450", itagui: "055410", bello: "051050", rionegro: "054040", "la estrella": "055460",
  cali: "760001", jamundi: "764001", palmira: "763531", yumbo: "760501", tulua: "763021", buga: "763041", cartago: "762021",
  barranquilla: "080001", soledad: "083001", cartagena: "130001", "cartagena de indias": "130001", "santa marta": "470001",
  bucaramanga: "680001", floridablanca: "681001", giron: "687541", piedecuesta: "681011",
  pereira: "660001", dosquebradas: "661001", manizales: "170001", armenia: "630001",
  ibague: "730001", neiva: "410001", pasto: "520001", popayan: "190001", villavicencio: "500001",
  monteria: "230001", sincelejo: "700001", valledupar: "200001", riohacha: "440001", cucuta: "540001",
  tunja: "150001", yopal: "850001", quibdo: "270001", florencia: "180001", leticia: "910001",
  "san andres": "880001", chia: "250001", zipaquira: "250251", soacha: "250051", cajica: "250240", mosquera: "250040", funza: "250020",
  girardot: "252431", fusagasuga: "252211", sogamoso: "152210", duitama: "150461", "puerto colombia": "081001",
};

export function suggestPostalCode(city: string | null | undefined): string {
  if (!city) return "";
  return BASE[norm(city)] ?? "";
}

// Skydropx Colombia reconoce el código DANE del municipio (5 dígitos), no el
// código postal de 6: con el postal cotiza pero rechaza la guía («no existe»).
const DANE: Record<string, string> = {
  bogota: "11001", "bogota d.c.": "11001", "bogota, d.c.": "11001",
  medellin: "05001", envigado: "05266", sabaneta: "05631", itagui: "05360", bello: "05088", rionegro: "05615", "la estrella": "05380",
  cali: "76001", "santiago de cali": "76001", jamundi: "76364", palmira: "76520", yumbo: "76892", tulua: "76834", buga: "76111", cartago: "76147",
  barranquilla: "08001", soledad: "08758", cartagena: "13001", "cartagena de indias": "13001", "santa marta": "47001",
  bucaramanga: "68001", floridablanca: "68276", giron: "68307", piedecuesta: "68547",
  pereira: "66001", dosquebradas: "66170", manizales: "17001", armenia: "63001",
  ibague: "73001", neiva: "41001", pasto: "52001", popayan: "19001", villavicencio: "50001",
  monteria: "23001", sincelejo: "70001", valledupar: "20001", riohacha: "44001", cucuta: "54001",
  tunja: "15001", yopal: "85001", quibdo: "27001", florencia: "18001", leticia: "91001",
  "san andres": "88001", chia: "25175", zipaquira: "25899", soacha: "25754", cajica: "25126", mosquera: "25473", funza: "25286",
  girardot: "25307", fusagasuga: "25290", sogamoso: "15759", duitama: "15238", "puerto colombia": "08573",
};

/** Código que Skydropx acepta para Colombia: DANE del municipio si lo conocemos. */
export function skydropxPostal(country: string | null | undefined, city: string | null | undefined, zip: string): string {
  if (String(country ?? "CO").toUpperCase().slice(0, 2) !== "CO") return zip;
  const d = DANE[norm(String(city ?? ""))];
  if (d) return d;
  return /^\d{5}$/.test(zip) ? zip : zip;
}
