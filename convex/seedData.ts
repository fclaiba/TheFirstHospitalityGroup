// Seed content (BLUEPRINT 2.1, 2.7, 8.3). Venue names, services, positions, floor plans, rules and menu are starting
// points marked "to be validated" with the owner (docs/PREGUNTAS-DUENO.md): replace them with the real ones before the
// pilot. Every text is {en, es} (ADR 0004). No prices or costs anywhere (ADR 0018).
import type { BarItemKind, MenuKind, Position, Service } from "../lib/domain/types";
import { POSITIONS } from "../lib/domain/types";

type L = { en: string; es: string };
const L = (en: string, es: string): L => ({ en, es });

export const COMPANY = { name: "The First Hospitality Group", slug: "tfhg" };

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const TUE_SUN = [0, 2, 3, 4, 5, 6];

/** Positions every venue uses by default (sommelier only where there is a wine program). */
const STANDARD: Position[] = POSITIONS.filter((p) => p !== "dev" && p !== "owner" && p !== "director" && p !== "sommelier");

export const VENUES: Array<{
  key: string;
  name: string;
  address: string;
  services: Array<{ key: Service; weekdays: number[]; startsAt: string; endsAt: string; preShiftMin: number }>;
  positionsUsed: Position[];
  localNames: Array<{ position: Position; name: L }>;
  reservationsUrl?: string;
}> = [
  {
    key: "v1",
    name: "The First Midtown",
    address: "Midtown, New York",
    services: [
      { key: "lunch", weekdays: [1, 2, 3, 4, 5], startsAt: "11:30", endsAt: "15:00", preShiftMin: 30 },
      { key: "dinner", weekdays: EVERY_DAY, startsAt: "17:00", endsAt: "23:00", preShiftMin: 30 },
    ],
    positionsUsed: [...STANDARD, "sommelier"],
    localNames: [],
    reservationsUrl: "https://resy.com",
  },
  {
    key: "v2",
    name: "The First Tribeca",
    address: "Tribeca, New York",
    services: [
      { key: "dinner", weekdays: TUE_SUN, startsAt: "17:30", endsAt: "23:30", preShiftMin: 30 },
      { key: "late", weekdays: [4, 5, 6], startsAt: "23:30", endsAt: "02:00", preShiftMin: 15 },
    ],
    positionsUsed: [...STANDARD, "sommelier"],
    localNames: [{ position: "captain", name: L("Head waiter", "Jefe de rango") }],
  },
  {
    key: "v3",
    name: "The First West Village",
    address: "West Village, New York",
    services: [
      { key: "lunch", weekdays: [3, 4, 5, 6, 0], startsAt: "12:00", endsAt: "15:30", preShiftMin: 30 },
      { key: "dinner", weekdays: EVERY_DAY, startsAt: "17:30", endsAt: "23:00", preShiftMin: 30 },
    ],
    positionsUsed: STANDARD,
    localNames: [{ position: "busser", name: L("Back server", "Ayudante de salón") }],
  },
  {
    key: "v4",
    name: "The First Brooklyn",
    address: "Williamsburg, Brooklyn",
    services: [{ key: "dinner", weekdays: TUE_SUN, startsAt: "17:00", endsAt: "23:00", preShiftMin: 30 }],
    positionsUsed: STANDARD,
    localNames: [],
  },
];

export type SeedPerson = { username: string; name: string; position: Position; enabled?: Position[]; title?: string; venues: string[]; locale: "en" | "es"; email?: string };

/** Demo people, the whole organization of Midtown plus a few at the other venues. All share the demo password. */
export const PEOPLE: SeedPerson[] = [
  { username: "owner", name: "Alexandra Reyes", position: "owner", venues: [], locale: "en", email: "owner@thefirsthg.com" },
  { username: "victor.h", name: "Victor Hale", position: "director", venues: [], locale: "en", email: "victor@thefirsthg.com" },
  // Midtown: venue management
  { username: "elena.g", name: "Elena García", position: "gm", venues: ["v1"], locale: "es", email: "elena@thefirsthg.com" },
  { username: "ryan.p", name: "Ryan Park", position: "agm", venues: ["v1"], locale: "en" },
  { username: "maria.m", name: "María Morales", position: "floor_manager", venues: ["v1"], locale: "es", email: "maria@thefirsthg.com" },
  // Midtown: reception
  { username: "claire.d", name: "Claire Dubois", position: "maitre_d", venues: ["v1"], locale: "en" },
  { username: "maya.j", name: "Maya Johnson", position: "host", venues: ["v1"], locale: "en" },
  // Midtown: floor
  { username: "luis.c", name: "Luis Castillo", position: "captain", venues: ["v1"], locale: "es" },
  { username: "ana.p", name: "Ana Pérez", position: "server", venues: ["v1"], locale: "es" },
  { username: "tom.b", name: "Tom Becker", position: "server", enabled: ["captain"], venues: ["v1"], locale: "en" },
  { username: "jade.w", name: "Jade Williams", position: "server", venues: ["v1"], locale: "en" },
  { username: "carlos.g", name: "Carlos Gómez", position: "runner", enabled: ["server"], venues: ["v1"], locale: "es" },
  { username: "nina.s", name: "Nina Shah", position: "runner", enabled: ["busser"], venues: ["v1"], locale: "en" },
  { username: "pedro.l", name: "Pedro López", position: "busser", enabled: ["runner"], venues: ["v1"], locale: "es" },
  { username: "kevin.d", name: "Kevin Duarte", position: "busser", venues: ["v1"], locale: "es" },
  { username: "omar.b", name: "Omar Benali", position: "polisher", enabled: ["busser", "barback"], venues: ["v1"], locale: "en" },
  // Midtown: pass
  { username: "irene.k", name: "Irene Kowalski", position: "expo", venues: ["v1"], locale: "en" },
  // Midtown: bar and wine
  { username: "sam.r", name: "Sam Rivera", position: "head_bartender", venues: ["v1"], locale: "en" },
  { username: "zoe.a", name: "Zoe Adams", position: "bartender", venues: ["v1"], locale: "en" },
  { username: "lucia.f", name: "Lucía Fernández", position: "barback", venues: ["v1"], locale: "es" },
  { username: "henri.l", name: "Henri Laurent", position: "sommelier", venues: ["v1"], locale: "en" },
  // Midtown: kitchen
  { username: "chef.marco", name: "Marco Bianchi", position: "chef_de_cuisine", venues: ["v1"], locale: "en" },
  { username: "rosa.h", name: "Rosa Hernández", position: "sous_chef", venues: ["v1"], locale: "es" },
  { username: "ken.w", name: "Ken Watanabe", position: "line_cook", venues: ["v1"], locale: "en" },
  { username: "lina.q", name: "Lina Quispe", position: "prep_cook", venues: ["v1"], locale: "es" },
  { username: "jose.r", name: "José Ramírez", position: "dishwasher", venues: ["v1"], locale: "es" },
  // Other venues
  { username: "james.k", name: "James Kim", position: "gm", venues: ["v2"], locale: "en" },
  { username: "olivia.n", name: "Olivia Nguyen", position: "captain", venues: ["v2"], locale: "en" },
  { username: "emma.t", name: "Emma Taylor", position: "server", venues: ["v2"], locale: "en" },
  { username: "diego.v", name: "Diego Vargas", position: "bartender", venues: ["v2"], locale: "es" },
  { username: "sofia.r", name: "Sofía Ruiz", position: "floor_manager", venues: ["v3"], locale: "es" },
  { username: "grace.l", name: "Grace Lee", position: "server", venues: ["v3"], locale: "en" },
  { username: "mateo.s", name: "Mateo Silva", position: "runner", venues: ["v3"], locale: "es" },
  { username: "daniel.o", name: "Daniel Okafor", position: "gm", venues: ["v4"], locale: "en" },
  { username: "andre.m", name: "André Martins", position: "server", venues: ["v4"], locale: "en" },
];

type T = { number: string; seats: number; x: number; y: number };
const row = (prefix: number, count: number, seats: number, y: number, x0 = 10, step = 14): T[] =>
  Array.from({ length: count }, (_, i) => ({ number: String(prefix + i), seats, x: x0 + i * step, y }));

/** Floor plans (ADR 0021, to be validated venue by venue). Coordinates are percentages of the plan area. */
export const FLOOR_PLANS: Record<string, Array<{ id: string; name: string; tables: T[] }>> = {
  v1: [
    { id: "a", name: "A", tables: row(10, 6, 2, 15) },
    { id: "b", name: "B", tables: [...row(20, 5, 4, 40), ...row(25, 4, 6, 55, 17)] },
    { id: "c", name: "C", tables: row(30, 5, 4, 78) },
    { id: "bar", name: "Bar", tables: Array.from({ length: 6 }, (_, i) => ({ number: `B${i + 1}`, seats: 2, x: 88, y: 10 + i * 14 })) },
  ],
  v2: [
    { id: "a", name: "A", tables: row(1, 6, 4, 25) },
    { id: "b", name: "B", tables: row(7, 6, 4, 65) },
  ],
  v3: [{ id: "a", name: "A", tables: row(1, 8, 2, 40, 6, 11) }],
  v4: [{ id: "a", name: "A", tables: row(1, 6, 4, 45) }],
};

const BAR: Position[] = ["barback", "bartender", "head_bartender"];
const KITCHEN: Position[] = ["dishwasher", "prep_cook", "line_cook", "sous_chef"];

/**
 * Example house rules (BLUEPRINT 2.6, to be validated). `positions: "company"` rules form the company set that applies
 * to everyone; the rest form one set per listed position.
 */
export const RULES: Array<{ key: string; positions: Position[] | "company"; title: L; body: L; howTo: L }> = [
  {
    key: "uniform",
    positions: "company",
    title: L("Uniform and grooming at pre-shift", "Uniforme y presentación en el pre-shift"),
    body: L("Uniform and grooming meet the house standard at pre-shift.", "El uniforme y la presentación cumplen el estándar de la casa en el pre-shift."),
    howTo: L("Pressed shirt, clean apron, closed black shoes, hair tied back.", "Camisa planchada, delantal limpio, zapatos negros cerrados, pelo recogido."),
  },
  {
    key: "phones",
    positions: "company",
    title: L("Phones away during service", "El teléfono, guardado durante el servicio"),
    body: L("Phones stay away during service except to use The First.", "El teléfono queda guardado durante el servicio, salvo para usar The First."),
    howTo: L("Keep it in your apron pocket on silent with vibration on.", "Llévalo en el bolsillo del delantal, en silencio y con vibración."),
  },
  {
    key: "punctuality",
    positions: "company",
    title: L("On time for pre-shift", "Puntual para el pre-shift"),
    body: L("You are in uniform at your station when pre-shift starts.", "Estás de uniforme en tu puesto cuando empieza el pre-shift."),
    howTo: L("Check your shift in The First the day before and arrive ten minutes early.", "Revisa tu turno en The First el día anterior y llega diez minutos antes."),
  },
  {
    key: "spills",
    positions: "company",
    title: L("Report a broken glass or spill at once", "Avisa enseguida si se rompe un vaso o hay un derrame"),
    body: L("A broken glass or a spill is reported immediately and the area is marked.", "Un vaso roto o un derrame se avisa en el momento y se marca la zona."),
    howTo: L("Place the wet floor sign, then send a Help request so someone covers your tables.", "Pon el cartel de piso mojado y manda un pedido de Ayuda para que alguien cubra tus mesas."),
  },
  {
    key: "closing",
    positions: "company",
    title: L("Closing side work before you leave", "El trabajo de cierre, antes de irte"),
    body: L("Closing side work is done and checked in The First before you leave.", "El trabajo de cierre se termina y se marca en The First antes de irte."),
    howTo: L("Finish your closing checklist and tell your lead.", "Termina tu checklist de cierre y avísale a tu líder."),
  },
  {
    key: "allergies",
    positions: ["server", "captain", "runner", "expo", "maitre_d", "bartender", "sommelier", "line_cook", "sous_chef"],
    title: L("Allergies go to the expo with the seat", "Las alergias van al expo con el asiento"),
    body: L("Every allergy is noted on the table with the seat and confirmed by the expo before the first course leaves.", "Toda alergia se anota en la mesa con el asiento y el expo la confirma antes de que salga el primer plato."),
    howTo: L("Add an allergy note to the table in The First and wait for the expo to confirm it.", "Agrega una nota de alergia a la mesa en The First y espera a que el expo la confirme."),
  },
  {
    key: "no-ticket-no-plate",
    positions: ["expo", "runner"],
    title: L("No ticket, no plate", "Sin comanda, no sale plato"),
    body: L("No plate leaves the pass without its ticket, table and seat.", "Ningún plato sale del pase sin su comanda, mesa y asiento."),
    howTo: L("Read the table and seat from the ticket, then deliver by seat number.", "Lee la mesa y el asiento de la comanda y entrega por número de asiento."),
  },
  {
    key: "id-check",
    positions: ["server", "captain", "bartender", "barback", "head_bartender", "sommelier"],
    title: L("Check ID before serving alcohol", "Pide identificación antes de servir alcohol"),
    body: L("Anyone who looks under 30 shows an ID. Nobody under 21 is served alcohol.", "Toda persona que parezca menor de 30 muestra su identificación. Nadie menor de 21 recibe alcohol."),
    howTo: L("Ask politely at the first drink order. If in doubt, call the manager.", "Pídela con amabilidad en el primer pedido de bebida. Si dudas, llama al manager."),
  },
  {
    key: "glassware",
    positions: ["polisher", "busser", "barback"],
    title: L("Glassware by the stem, never stacked", "La cristalería por el tallo, nunca apilada"),
    body: L("Glasses are carried by the stem or in racks, never stacked or by the rim.", "Las copas se llevan por el tallo o en racks, nunca apiladas ni por el borde."),
    howTo: L("Use a rack for more than four glasses and polish with a dry cloth.", "Usa un rack para más de cuatro copas y pule con un paño seco."),
  },
  {
    key: "shortages",
    positions: BAR,
    title: L("Mark a bottle Low before it runs out", "Marca una botella como Poca antes de que se acabe"),
    body: L("Bartender and barback own every bottle running out: mark it Low or Out as soon as you see it.", "Bartender y barback son responsables de toda botella que se acaba: márcala como Poca o Agotada apenas lo veas."),
    howTo: L("Open Bar in The First and tap Low or Out on the item.", "Abre Barra en The First y toca Poca o Agotada en el producto."),
  },
  {
    key: "sections",
    positions: ["host", "maitre_d", "captain"],
    title: L("Seat by today's sections", "Sienta según las secciones del día"),
    body: L("Guests are seated following today's sections so every server's load stays even.", "Los clientes se sientan según las secciones del día para que la carga de cada mesero sea pareja."),
    howTo: L("Check the floor map in The First before opening the doors.", "Revisa el mapa del salón en The First antes de abrir las puertas."),
  },
  {
    key: "labels",
    positions: KITCHEN,
    title: L("Label and date every container", "Etiqueta y fecha cada recipiente"),
    body: L("Every container in the walk-in has a label with the product and the date.", "Todo recipiente de la cámara tiene etiqueta con el producto y la fecha."),
    howTo: L("Use the day-dot labels and write the prep date.", "Usa las etiquetas de colores y escribe la fecha de preparación."),
  },
  {
    key: "eighty-six",
    positions: ["line_cook", "sous_chef", "expo"],
    title: L("Call 86s to the expo at once", "Avisa los 86 al expo enseguida"),
    body: L("When an item is about to run out, the expo hears it before the next ticket.", "Cuando un producto está por acabarse, el expo lo sabe antes de la próxima comanda."),
    howTo: L("Tell the sous chef; the expo marks the 86 in The First.", "Avísale al sous chef; el expo marca el 86 en The First."),
  },
];

type Tpl = { positions: Position[]; phase: "open" | "close"; title: L; due: number; weekly?: number[]; items: Array<[string, string, ("photo" | "critical")?, number?]> };

/** Side-work templates by position (BLUEPRINT 2.6). Estimated minutes feed the side-work indicator. Copied to every venue. */
export const TEMPLATES: Tpl[] = [
  {
    positions: ["polisher"],
    phase: "open",
    title: L("Polisher opening", "Apertura de polisher"),
    due: -15,
    items: [
      ["Polish wine glasses for 120 covers", "Pule copas de vino para 120 cubiertos", undefined, 40],
      ["Polish silverware and sort it", "Pule y ordena los cubiertos", undefined, 30],
      ["Fold napkins for the night", "Dobla las servilletas de la noche", undefined, 20],
      ["Stations restocked", "Estaciones repuestas", "photo", 10],
    ],
  },
  {
    positions: ["server"],
    phase: "open",
    title: L("Server opening", "Apertura de mesero"),
    due: 0,
    items: [
      ["Set your section: linen, cutlery, glasses", "Arma tu sección: mantel, cubiertos, copas", "photo", 20],
      ["Check menus are clean and current", "Revisa que las cartas estén limpias y al día", undefined, 5],
      ["Read tonight's 86s and pre-shift notes", "Lee los 86 y las notas del pre-shift", "critical", 5],
    ],
  },
  {
    positions: ["server"],
    phase: "close",
    title: L("Server closing", "Cierre de mesero"),
    due: 60,
    items: [
      ["Clear and reset your section", "Levanta y reacomoda tu sección", undefined, 15],
      ["Restock the side station", "Repón la estación de apoyo", undefined, 10],
      ["Section clean for tomorrow", "Sección limpia para mañana", "photo", 10],
    ],
  },
  {
    positions: ["runner"],
    phase: "open",
    title: L("Runner opening", "Apertura de runner"),
    due: 0,
    items: [
      ["Pass area clean and stocked", "Pase limpio y abastecido", undefined, 10],
      ["Trays polished and stacked", "Bandejas pulidas y apiladas", undefined, 10],
      ["Table and seat numbers learned for tonight", "Números de mesa y asiento aprendidos para hoy", "critical", 5],
    ],
  },
  {
    positions: ["busser"],
    phase: "open",
    title: L("Busser opening", "Apertura de ayudante"),
    due: 0,
    items: [
      ["Water carafes filled and chilled", "Jarras de agua llenas y frías", undefined, 10],
      ["Bread station ready", "Estación de pan lista", undefined, 10],
      ["Bus tubs clean in place", "Cubetas limpias en su lugar", undefined, 5],
    ],
  },
  {
    positions: ["busser", "runner"],
    phase: "close",
    title: L("Floor closing", "Cierre de salón"),
    due: 45,
    items: [
      ["Floors swept in your section", "Piso barrido en tu sección", "photo", 15],
      ["Carafes and trays washed", "Jarras y bandejas lavadas", undefined, 10],
    ],
  },
  {
    positions: ["captain", "maitre_d"],
    phase: "open",
    title: L("Lead opening", "Apertura de líder"),
    due: -10,
    items: [
      ["Sections assigned for tonight", "Secciones asignadas para hoy", undefined, 5],
      ["Pre-shift with the floor team", "Pre-shift con el equipo de salón", "critical", 15],
      ["Reservation and VIP notes reviewed", "Notas de reservas y VIP revisadas", undefined, 10],
    ],
  },
  {
    positions: ["host"],
    phase: "open",
    title: L("Host opening", "Apertura de host"),
    due: -10,
    items: [
      ["Book reviewed against today's sections", "Libro revisado con las secciones del día", undefined, 10],
      ["Entrance and coat check ready", "Entrada y guardarropa listos", undefined, 10],
    ],
  },
  {
    positions: ["expo"],
    phase: "open",
    title: L("Expo opening", "Apertura de expo"),
    due: -10,
    items: [
      ["Pass set: tickets, rail, lamps", "Pase listo: comandas, riel, lámparas", undefined, 10],
      ["Read the menu changes and 86s", "Lee los cambios de menú y los 86", "critical", 5],
    ],
  },
  {
    positions: ["bartender", "head_bartender"],
    phase: "open",
    title: L("Bar opening", "Apertura de barra"),
    due: -15,
    items: [
      ["Ice wells full", "Hieleras llenas", undefined, 10],
      ["Garnishes cut and covered", "Garnituras cortadas y tapadas", "photo", 20],
      ["Check the bottles and mark any Low", "Revisa las botellas y marca las que están pocas", "critical", 10],
    ],
  },
  {
    positions: ["bartender", "head_bartender"],
    phase: "close",
    title: L("Bar closing", "Cierre de barra"),
    due: 60,
    items: [
      ["Mats and drains clean", "Alfombras y desagües limpios", "photo", 15],
      ["Fruit wrapped and labeled", "Fruta envuelta y etiquetada", undefined, 10],
    ],
  },
  {
    positions: ["bartender", "barback"],
    phase: "open",
    title: L("Monday deep clean", "Limpieza profunda del lunes"),
    due: 30,
    weekly: [1],
    items: [
      ["Deep clean of the bar fridges", "Limpieza profunda de las heladeras de la barra", "photo", 40],
      ["Descale the coffee machine", "Descalcifica la cafetera", undefined, 20],
    ],
  },
  {
    positions: ["barback"],
    phase: "open",
    title: L("Barback opening", "Apertura de barback"),
    due: -15,
    items: [
      ["Restock beer and mixers", "Repón cerveza y mixers", undefined, 15],
      ["Glass racks ready", "Racks de vasos listos", undefined, 10],
      ["Ice bins topped up", "Contenedores de hielo completos", undefined, 10],
    ],
  },
  {
    positions: ["barback"],
    phase: "close",
    title: L("Barback closing", "Cierre de barback"),
    due: 45,
    items: [
      ["Empties to recycling", "Vacíos al reciclaje", undefined, 10],
      ["Cooler doors wiped", "Puertas de heladera limpias", undefined, 10],
    ],
  },
  {
    positions: ["line_cook", "sous_chef"],
    phase: "open",
    title: L("Station opening", "Apertura de estación"),
    due: -30,
    items: [
      ["Fridge temperatures logged", "Temperaturas de heladeras registradas", "critical"],
      ["Mise en place for the menu", "Mise en place del menú"],
      ["Allergen binder at the pass", "Carpeta de alérgenos en el pase"],
    ],
  },
  {
    positions: ["prep_cook"],
    phase: "open",
    title: L("Prep list", "Lista de prep"),
    due: -60,
    items: [
      ["Prep list of the day done", "Lista de prep del día terminada", "critical"],
      ["Everything labeled and dated", "Todo etiquetado y fechado", "photo"],
    ],
  },
  {
    positions: ["dishwasher"],
    phase: "close",
    title: L("Dish and porter closing", "Cierre de bacha"),
    due: 60,
    items: [
      ["Dish machine drained and cleaned", "Lavavajillas vaciado y limpio"],
      ["Trash and recycling out", "Basura y reciclaje afuera"],
      ["Floors mopped", "Pisos trapeados", "photo"],
    ],
  },
  {
    positions: ["line_cook", "sous_chef"],
    phase: "close",
    title: L("Kitchen closing", "Cierre de cocina"),
    due: 60,
    items: [
      ["Food labeled and dated", "Comida etiquetada y fechada", "photo"],
      ["Line and hoods wiped", "Línea y campanas limpias"],
    ],
  },
];

type M = { kind: MenuKind; cat: string; name: L; desc: L; ing: L; allergens: string[]; pairing?: L; course?: number; tags?: string[] };

/** Sample menu (to be validated: real dishes, drinks, wines and photos come from the chef). No prices (ADR 0018). */
export const MENU: M[] = [
  { kind: "food", cat: "starters", name: L("Burrata, heirloom tomato", "Burrata con tomates heirloom"), desc: L("Creamy burrata, summer tomatoes, basil oil.", "Burrata cremosa, tomates de estación, aceite de albahaca."), ing: L("Burrata, tomato, basil, olive oil, sea salt", "Burrata, tomate, albahaca, aceite de oliva, sal marina"), allergens: ["milk"], pairing: L("Sancerre", "Sancerre"), tags: ["vegetarian"] },
  { kind: "food", cat: "starters", name: L("Tuna crudo", "Crudo de atún"), desc: L("Yellowfin tuna, citrus, chili, crispy shallot.", "Atún aleta amarilla, cítricos, ají, chalota crocante."), ing: L("Tuna, orange, lime, chili, shallot, soy", "Atún, naranja, lima, ají, chalota, soja"), allergens: ["fish", "soy"] },
  { kind: "food", cat: "starters", name: L("Steak tartare", "Steak tartare"), desc: L("Hand-cut beef, egg yolk, capers, grilled bread.", "Carne cortada a cuchillo, yema, alcaparras, pan grillado."), ing: L("Beef, egg yolk, capers, mustard, shallot, bread", "Carne, yema, alcaparras, mostaza, chalota, pan"), allergens: ["eggs", "mustard", "gluten"] },
  { kind: "food", cat: "starters", name: L("Oysters, half dozen", "Ostras, media docena"), desc: L("East Coast oysters, mignonette, lemon.", "Ostras de la costa este, mignonette, limón."), ing: L("Oysters, shallot, vinegar, lemon", "Ostras, chalota, vinagre, limón"), allergens: ["molluscs", "sulphites"], pairing: L("Champagne Brut", "Champagne Brut") },
  { kind: "food", cat: "mains", name: L("Roast chicken for two", "Pollo asado para dos"), desc: L("Whole roast chicken, jus, potato purée.", "Pollo entero asado, jugo, puré de papa."), ing: L("Chicken, butter, potato, thyme, garlic", "Pollo, manteca, papa, tomillo, ajo"), allergens: ["milk"] },
  { kind: "food", cat: "mains", name: L("Black cod, miso", "Bacalao negro al miso"), desc: L("Miso-glazed black cod, bok choy, sesame.", "Bacalao negro glaseado con miso, bok choy, sésamo."), ing: L("Black cod, miso, sake, bok choy, sesame", "Bacalao negro, miso, sake, bok choy, sésamo"), allergens: ["fish", "soy", "sesame"] },
  { kind: "food", cat: "mains", name: L("Dry-aged ribeye", "Ojo de bife madurado"), desc: L("16 oz dry-aged ribeye, peppercorn sauce.", "Ojo de bife madurado de 450 g, salsa de pimienta."), ing: L("Beef, cream, peppercorn, brandy", "Carne, crema, pimienta, brandy"), allergens: ["milk", "sulphites"], pairing: L("Barolo 2018", "Barolo 2018") },
  { kind: "food", cat: "mains", name: L("Wild mushroom risotto", "Risotto de hongos silvestres"), desc: L("Carnaroli rice, wild mushrooms, parmesan.", "Arroz carnaroli, hongos silvestres, parmesano."), ing: L("Rice, mushrooms, parmesan, butter, white wine, celery", "Arroz, hongos, parmesano, manteca, vino blanco, apio"), allergens: ["milk", "celery", "sulphites"], tags: ["vegetarian"] },
  { kind: "food", cat: "mains", name: L("Lobster linguine", "Linguine de langosta"), desc: L("Fresh linguine, Maine lobster, cherry tomato, chili.", "Linguine fresco, langosta de Maine, tomate cherry, ají."), ing: L("Pasta, lobster, tomato, garlic, chili, butter", "Pasta, langosta, tomate, ajo, ají, manteca"), allergens: ["gluten", "eggs", "crustaceans", "milk"] },
  { kind: "food", cat: "sides", name: L("Hand-cut fries", "Papas fritas cortadas a mano"), desc: L("Twice-fried, rosemary salt.", "Fritas dos veces, sal de romero."), ing: L("Potato, beef fat, rosemary, salt", "Papa, grasa vacuna, romero, sal"), allergens: [] },
  { kind: "food", cat: "sides", name: L("Charred broccolini", "Broccolini a la brasa"), desc: L("Lemon, chili, toasted almonds.", "Limón, ají, almendras tostadas."), ing: L("Broccolini, lemon, chili, almonds", "Broccolini, limón, ají, almendras"), allergens: ["tree_nuts"], tags: ["vegan"] },
  { kind: "food", cat: "desserts", name: L("Chocolate soufflé", "Soufflé de chocolate"), desc: L("Dark chocolate, vanilla crème anglaise. 15 minutes.", "Chocolate amargo, crema inglesa de vainilla. 15 minutos."), ing: L("Chocolate, eggs, sugar, butter, milk, flour", "Chocolate, huevos, azúcar, manteca, leche, harina"), allergens: ["eggs", "milk", "gluten"] },
  { kind: "food", cat: "desserts", name: L("Olive oil cake", "Torta de aceite de oliva"), desc: L("Citrus, whipped mascarpone.", "Cítricos, mascarpone batido."), ing: L("Flour, olive oil, eggs, orange, mascarpone", "Harina, aceite de oliva, huevos, naranja, mascarpone"), allergens: ["gluten", "eggs", "milk"] },
  { kind: "drink", cat: "cocktails", name: L("The First Martini", "Martini The First"), desc: L("Gin, dry vermouth, olive brine, lemon twist.", "Gin, vermut seco, salmuera de aceituna, piel de limón."), ing: L("Gin, vermouth, olive", "Gin, vermut, aceituna"), allergens: ["sulphites"] },
  { kind: "drink", cat: "cocktails", name: L("Smoked Old Fashioned", "Old Fashioned ahumado"), desc: L("Bourbon, demerara, bitters, oak smoke.", "Bourbon, demerara, amargos, humo de roble."), ing: L("Bourbon, sugar, bitters, orange", "Bourbon, azúcar, amargos, naranja"), allergens: [] },
  { kind: "drink", cat: "zero_proof", name: L("Garden spritz", "Spritz de jardín"), desc: L("Non-alcoholic aperitif, cucumber, tonic.", "Aperitivo sin alcohol, pepino, tónica."), ing: L("Non-alcoholic aperitif, cucumber, tonic", "Aperitivo sin alcohol, pepino, tónica"), allergens: [] },
  { kind: "wine", cat: "wine_white", name: L("Sancerre, Loire 2022", "Sancerre, Loira 2022"), desc: L("Crisp, mineral, citrus.", "Fresco, mineral, cítrico."), ing: L("Sauvignon blanc", "Sauvignon blanc"), allergens: ["sulphites"], pairing: L("Burrata, tuna crudo", "Burrata, crudo de atún") },
  { kind: "wine", cat: "wine_red", name: L("Barolo, Piedmont 2018", "Barolo, Piamonte 2018"), desc: L("Rose, tar, firm tannins.", "Rosa, alquitrán, taninos firmes."), ing: L("Nebbiolo", "Nebbiolo"), allergens: ["sulphites"], pairing: L("Dry-aged ribeye", "Ojo de bife madurado") },
  { kind: "wine", cat: "wine_sparkling", name: L("Champagne Brut NV", "Champagne Brut NV"), desc: L("Brioche, green apple, fine bubbles.", "Brioche, manzana verde, burbuja fina."), ing: L("Chardonnay, pinot noir, pinot meunier", "Chardonnay, pinot noir, pinot meunier"), allergens: ["sulphites"], pairing: L("Oysters", "Ostras") },
];

/** Bar items per venue for the shortage list (ADR 0023). Juices, ice and garnish are configuration per venue. */
export const BAR_ITEMS: Array<{ name: string; kind: BarItemKind }> = [
  { name: "Gin, London Dry", kind: "bottle" },
  { name: "Vodka", kind: "bottle" },
  { name: "Bourbon", kind: "bottle" },
  { name: "Tequila Blanco", kind: "bottle" },
  { name: "Mezcal", kind: "bottle" },
  { name: "Dry Vermouth", kind: "bottle" },
  { name: "Campari", kind: "bottle" },
  { name: "Sancerre", kind: "bottle" },
  { name: "Barolo 2018", kind: "bottle" },
  { name: "Champagne Brut", kind: "bottle" },
  { name: "Lime juice", kind: "juice" },
  { name: "Tonic water", kind: "soda" },
  { name: "Large ice cubes", kind: "ice" },
  { name: "Lemon twists", kind: "garnish" },
];
