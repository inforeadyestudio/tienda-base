export const COUNTRIES = [
  "Colombia", "Panamá", "Estados Unidos", "México", "España", "Argentina", "Chile", "Perú", "Ecuador",
  "Brasil", "Uruguay", "Paraguay", "Bolivia", "Venezuela", "Costa Rica", "Guatemala", "Honduras",
  "El Salvador", "Nicaragua", "República Dominicana", "Puerto Rico", "Cuba", "Canadá", "Reino Unido",
  "Francia", "Italia", "Alemania", "Portugal", "Países Bajos", "Bélgica", "Suiza", "Australia", "Japón",
  "Emiratos Árabes Unidos",
];

export const COLOMBIA_DEPARTMENTS: Record<string, string[]> = {
  "Amazonas": ["Leticia", "Puerto Nariño"],
  "Antioquia": ["Medellín", "Bello", "Itagüí", "Envigado", "Sabaneta", "La Estrella", "Caldas", "Copacabana", "Girardota", "Barbosa", "Rionegro", "La Ceja", "Marinilla", "Guarne", "El Retiro", "Apartadó", "Turbo", "Carepa", "Chigorodó", "Caucasia", "Puerto Berrío", "Santa Fe de Antioquia", "Jericó", "Andes", "Támesis", "Yarumal", "Segovia", "Necoclí", "Urrao", "Sonsón"],
  "Arauca": ["Arauca", "Arauquita", "Saravena", "Tame", "Fortul", "Puerto Rondón", "Cravo Norte"],
  "Atlántico": ["Barranquilla", "Soledad", "Malambo", "Puerto Colombia", "Galapa", "Sabanalarga", "Baranoa", "Sabanagrande", "Palmar de Varela", "Santo Tomás"],
  "Bogotá D.C.": ["Bogotá"],
  "Bolívar": ["Cartagena", "Magangué", "Turbaco", "Arjona", "El Carmen de Bolívar", "Mompós", "San Juan Nepomuceno", "María la Baja", "Santa Rosa", "Clemencia"],
  "Boyacá": ["Tunja", "Duitama", "Sogamoso", "Chiquinquirá", "Paipa", "Villa de Leyva", "Puerto Boyacá", "Moniquirá", "Nobsa", "Garagoa", "Samacá", "Tibasosa"],
  "Caldas": ["Manizales", "Villamaría", "Chinchiná", "La Dorada", "Riosucio", "Anserma", "Supía", "Salamina", "Neira", "Manzanares"],
  "Caquetá": ["Florencia", "San Vicente del Caguán", "Puerto Rico", "El Doncello", "Belén de los Andaquíes", "Curillo"],
  "Casanare": ["Yopal", "Aguazul", "Villanueva", "Tauramena", "Monterrey", "Paz de Ariporo", "Maní", "Trinidad"],
  "Cauca": ["Popayán", "Santander de Quilichao", "Puerto Tejada", "Piendamó", "El Tambo", "Miranda", "Corinto", "Silvia", "Guapi", "Patía"],
  "Cesar": ["Valledupar", "Aguachica", "Bosconia", "Codazzi", "La Jagua de Ibirico", "Curumaní", "El Copey", "San Diego"],
  "Chocó": ["Quibdó", "Istmina", "Tadó", "Riosucio", "Bahía Solano", "Nuquí", "Condoto", "Acandí"],
  "Córdoba": ["Montería", "Cereté", "Lorica", "Sahagún", "Planeta Rica", "Montelíbano", "Tierralta", "Ciénaga de Oro", "San Antero", "Coveñas"],
  "Cundinamarca": ["Soacha", "Chía", "Zipaquirá", "Facatativá", "Fusagasugá", "Mosquera", "Madrid", "Funza", "Cajicá", "Girardot", "Cota", "La Calera", "Tocancipá", "Sopó", "Tenjo", "Sibaté", "Ubaté", "Villeta", "Anapoima", "La Mesa", "Silvania", "Chocontá"],
  "Guainía": ["Inírida"],
  "Guaviare": ["San José del Guaviare", "Calamar", "El Retorno", "Miraflores"],
  "Huila": ["Neiva", "Pitalito", "Garzón", "La Plata", "Campoalegre", "Gigante", "Rivera", "San Agustín", "Palermo", "Aipe"],
  "La Guajira": ["Riohacha", "Maicao", "Uribia", "Manaure", "San Juan del Cesar", "Fonseca", "Villanueva", "Albania", "Dibulla"],
  "Magdalena": ["Santa Marta", "Ciénaga", "Fundación", "El Banco", "Plato", "Aracataca", "Zona Bananera", "Pivijay"],
  "Meta": ["Villavicencio", "Acacías", "Granada", "Puerto López", "Puerto Gaitán", "Restrepo", "Cumaral", "San Martín"],
  "Nariño": ["Pasto", "Ipiales", "Tumaco", "Túquerres", "La Unión", "Samaniego", "Sandoná", "Buesaco", "Barbacoas"],
  "Norte de Santander": ["Cúcuta", "Ocaña", "Villa del Rosario", "Los Patios", "Pamplona", "Tibú", "El Zulia", "Chinácota", "Ábrego"],
  "Putumayo": ["Mocoa", "Puerto Asís", "Orito", "Valle del Guamuez", "Villagarzón", "Sibundoy"],
  "Quindío": ["Armenia", "Calarcá", "Montenegro", "La Tebaida", "Quimbaya", "Circasia", "Filandia", "Salento"],
  "Risaralda": ["Pereira", "Dosquebradas", "Santa Rosa de Cabal", "La Virginia", "Marsella", "Belén de Umbría", "Quinchía"],
  "San Andrés y Providencia": ["San Andrés", "Providencia"],
  "Santander": ["Bucaramanga", "Floridablanca", "Girón", "Piedecuesta", "Barrancabermeja", "San Gil", "Socorro", "Barbosa", "Málaga", "Vélez", "Lebrija", "Zapatoca"],
  "Sucre": ["Sincelejo", "Corozal", "Sampués", "San Marcos", "Tolú", "San Onofre", "Since", "Coveñas"],
  "Tolima": ["Ibagué", "Espinal", "Melgar", "Honda", "Líbano", "Chaparral", "Mariquita", "Purificación", "Guamo", "Flandes"],
  "Valle del Cauca": ["Cali", "Palmira", "Buenaventura", "Tuluá", "Cartago", "Buga", "Jamundí", "Yumbo", "Candelaria", "Florida", "Pradera", "Zarzal", "Roldanillo", "Sevilla", "Caicedonia", "La Unión", "Dagua", "Ginebra", "El Cerrito"],
  "Vaupés": ["Mitú", "Carurú", "Taraira"],
  "Vichada": ["Puerto Carreño", "La Primavera", "Santa Rosalía", "Cumaribo"],
};

export const PANAMA_PROVINCES: Record<string, string[]> = {
  "Panamá": ["Ciudad de Panamá", "San Miguelito", "Tocumen", "Chepo", "Pacora"],
  "Panamá Oeste": ["La Chorrera", "Arraiján", "Capira", "Chame", "San Carlos"],
  "Colón": ["Colón", "Portobelo", "Chagres", "Santa Isabel"],
  "Chiriquí": ["David", "Boquete", "Bugaba", "Dolega", "Barú"],
  "Coclé": ["Penonomé", "Aguadulce", "Natá", "Antón", "La Pintada"],
  "Herrera": ["Chitré", "Ocú", "Pesé", "Parita", "Santa María"],
  "Los Santos": ["Las Tablas", "Guararé", "Pedasí", "Macaracas", "Tonosí"],
  "Veraguas": ["Santiago", "Soná", "Atalaya", "Montijo", "Las Palmas"],
  "Bocas del Toro": ["Bocas del Toro", "Changuinola", "Chiriquí Grande"],
  "Darién": ["La Palma", "Metetí", "Yaviza"],
};

export function regionsFor(country: string): Record<string, string[]> | null {
  const value = country.trim().toLowerCase();
  if (value === "colombia") return COLOMBIA_DEPARTMENTS;
  if (value === "panamá" || value === "panama") return PANAMA_PROVINCES;
  return null;
}

export const COUNTRY_FLAGS: Record<string, string> = {
  "Colombia": "🇨🇴", "Panamá": "🇵🇦", "Estados Unidos": "🇺🇸", "México": "🇲🇽",
  "España": "🇪🇸", "Argentina": "🇦🇷", "Chile": "🇨🇱", "Perú": "🇵🇪", "Ecuador": "🇪🇨",
  "Brasil": "🇧🇷", "Uruguay": "🇺🇾", "Paraguay": "🇵🇾", "Bolivia": "🇧🇴", "Venezuela": "🇻🇪",
  "Costa Rica": "🇨🇷", "Guatemala": "🇬🇹", "Honduras": "🇭🇳", "El Salvador": "🇸🇻",
  "Nicaragua": "🇳🇮", "República Dominicana": "🇩🇴", "Puerto Rico": "🇵🇷", "Cuba": "🇨🇺",
  "Canadá": "🇨🇦", "Reino Unido": "🇬🇧", "Francia": "🇫🇷", "Italia": "🇮🇹", "Alemania": "🇩🇪",
  "Portugal": "🇵🇹", "Países Bajos": "🇳🇱", "Bélgica": "🇧🇪", "Suiza": "🇨🇭",
  "Australia": "🇦🇺", "Japón": "🇯🇵", "Emiratos Árabes Unidos": "🇦🇪",
};

export function countryFlag(country: string | null | undefined): string {
  if (!country) return "";
  const value = country.trim().toLowerCase();
  for (const [name, flag] of Object.entries(COUNTRY_FLAGS)) {
    if (name.toLowerCase() === value) return flag;
  }
  // alias comunes
  if (["panama"].includes(value)) return "🇵🇦";
  if (["estados unidos", "usa", "us", "united states", "eeuu", "ee.uu."].includes(value)) return "🇺🇸";
  if (["republica dominicana", "dominican republic"].includes(value)) return "🇩🇴";
  if (["espana", "spain"].includes(value)) return "🇪🇸";
  if (["mexico"].includes(value)) return "🇲🇽";
  if (["peru"].includes(value)) return "🇵🇪";
  if (["canada"].includes(value)) return "🇨🇦";
  return "🌎";
}

/** Ciudades conocidas para un país (Colombia y Panamá tienen lista; el resto devuelve vacío). */
export function citiesFor(country: string): string[] {
  const regions = regionsFor(country);
  if (!regions) return [];
  return Object.values(regions).flat().sort((a, b) => a.localeCompare(b, "es"));
}
