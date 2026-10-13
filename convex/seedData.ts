// Seed content (BLUEPRINT 2.3, 8.3). Venue names, services, rules and menu are starting points marked "to be
// validated" with the owner: replace them with the real ones before the pilot. Every text is {en, es} (ADR 0004).
import type { Level, Role, Service } from "../lib/domain/types";

type L = { en: string; es: string };
const L = (en: string, es: string): L => ({ en, es });

export const COMPANY = { name: "The First Hospitality Group", slug: "tfhg" };

export const VENUES: Array<{ key: string; name: string; address: string; services: Array<{ key: Service; startsAt: string; endsAt: string }> }> = [
  { key: "v1", name: "The First Midtown", address: "Midtown, New York", services: [{ key: "lunch", startsAt: "11:30", endsAt: "15:00" }, { key: "dinner", startsAt: "17:00", endsAt: "23:00" }] },
  { key: "v2", name: "The First Tribeca", address: "Tribeca, New York", services: [{ key: "dinner", startsAt: "17:30", endsAt: "23:30" }, { key: "late", startsAt: "23:30", endsAt: "02:00" }] },
  { key: "v3", name: "The First West Village", address: "West Village, New York", services: [{ key: "lunch", startsAt: "12:00", endsAt: "15:30" }, { key: "dinner", startsAt: "17:30", endsAt: "23:00" }] },
  { key: "v4", name: "The First Brooklyn", address: "Williamsburg, Brooklyn", services: [{ key: "dinner", startsAt: "17:00", endsAt: "23:00" }] },
];

/** Demo people. All share the demo password (lib/demo/accounts.ts); usernames are what the login screen lists. */
export const PEOPLE: Array<{ username: string; name: string; role: Role; level: Level; venues: string[]; locale: "en" | "es"; email?: string }> = [
  { username: "owner", name: "Alexandra Reyes", role: "owner", level: "A", venues: [], locale: "en", email: "owner@thefirsthg.com" },
  { username: "maria.m", name: "María Morales", role: "manager", level: "A", venues: ["v1"], locale: "es", email: "maria@thefirsthg.com" },
  { username: "james.k", name: "James Kim", role: "manager", level: "A", venues: ["v2"], locale: "en" },
  { username: "sofia.r", name: "Sofía Ruiz", role: "manager", level: "A", venues: ["v3"], locale: "es" },
  { username: "daniel.o", name: "Daniel Okafor", role: "manager", level: "A", venues: ["v4"], locale: "en" },
  { username: "luis.c", name: "Luis Castillo", role: "captain", level: "A", venues: ["v1"], locale: "es" },
  { username: "ana.p", name: "Ana Pérez", role: "server", level: "B", venues: ["v1"], locale: "es" },
  { username: "tom.b", name: "Tom Becker", role: "server", level: "A", venues: ["v1"], locale: "en" },
  { username: "jade.w", name: "Jade Williams", role: "server", level: "C", venues: ["v1"], locale: "en" },
  { username: "carlos.g", name: "Carlos Gómez", role: "runner", level: "B", venues: ["v1"], locale: "es" },
  { username: "nina.s", name: "Nina Shah", role: "runner", level: "C", venues: ["v1"], locale: "en" },
  { username: "pedro.l", name: "Pedro López", role: "busser", level: "B", venues: ["v1"], locale: "es" },
  { username: "kevin.d", name: "Kevin Duarte", role: "busser", level: "C", venues: ["v1"], locale: "es" },
  { username: "sam.r", name: "Sam Rivera", role: "bartender", level: "A", venues: ["v1"], locale: "en" },
  { username: "lucia.f", name: "Lucía Fernández", role: "barback", level: "B", venues: ["v1"], locale: "es" },
  { username: "chef.marco", name: "Marco Bianchi", role: "kitchen", level: "A", venues: ["v1"], locale: "en" },
  { username: "rosa.h", name: "Rosa Hernández", role: "kitchen", level: "B", venues: ["v1"], locale: "es" },
  { username: "emma.t", name: "Emma Taylor", role: "server", level: "B", venues: ["v2"], locale: "en" },
  { username: "diego.v", name: "Diego Vargas", role: "bartender", level: "B", venues: ["v2"], locale: "es" },
  { username: "olivia.n", name: "Olivia Nguyen", role: "captain", level: "A", venues: ["v2"], locale: "en" },
  { username: "mateo.s", name: "Mateo Silva", role: "runner", level: "B", venues: ["v3"], locale: "es" },
  { username: "grace.l", name: "Grace Lee", role: "server", level: "A", venues: ["v3"], locale: "en" },
  { username: "andre.m", name: "André Martins", role: "server", level: "B", venues: ["v4"], locale: "en" },
];

export const SECTIONS: Record<string, Array<{ name: string; tables: string[] }>> = {
  v1: [
    { name: "A", tables: ["10", "11", "12", "13", "14", "15"] },
    { name: "B", tables: ["20", "21", "22", "23", "24", "25", "26", "27", "28"] },
    { name: "C", tables: ["30", "31", "32", "33", "34"] },
    { name: "Bar", tables: ["B1", "B2", "B3", "B4", "B5", "B6"] },
  ],
  v2: [
    { name: "A", tables: ["1", "2", "3", "4", "5", "6"] },
    { name: "B", tables: ["7", "8", "9", "10", "11", "12"] },
  ],
  v3: [{ name: "A", tables: ["1", "2", "3", "4", "5", "6", "7", "8"] }],
  v4: [{ name: "A", tables: ["1", "2", "3", "4", "5", "6"] }],
};

/** Example house rules per role (BLUEPRINT 2.3, to be validated). `roles` lists who each rule applies to. */
const FLOOR: Role[] = ["server", "runner", "busser", "captain"];
const BAR: Role[] = ["bartender", "barback"];
const ALL: Role[] = ["server", "runner", "busser", "bartender", "barback", "kitchen", "captain", "manager"];
export const RULES: Array<{ key: string; roles: Role[]; title: L; body: L; howTo: L }> = [
  {
    key: "allergies",
    roles: ["server", "captain", "runner", "kitchen", "bartender"],
    title: L("Confirm allergies with the kitchen", "Confirma las alergias con la cocina"),
    body: L("Allergies and dietary notes are confirmed with the kitchen before the first course leaves.", "Las alergias y notas de dieta se confirman con la cocina antes de que salga el primer plato."),
    howTo: L("Add an allergy note to the table in The First and wait for the kitchen to confirm it.", "Agrega una nota de alergia a la mesa en The First y espera a que la cocina la confirme."),
  },
  {
    key: "id-check",
    roles: [...BAR, "server", "captain"],
    title: L("Check ID before serving alcohol", "Pide identificación antes de servir alcohol"),
    body: L("Anyone who looks under 30 shows an ID. Nobody under 21 is served alcohol.", "Toda persona que parezca menor de 30 muestra su identificación. Nadie menor de 21 recibe alcohol."),
    howTo: L("Ask politely at the first drink order. If in doubt, call the manager.", "Pídela con amabilidad en el primer pedido de bebida. Si dudas, llama al manager."),
  },
  {
    key: "phones",
    roles: ALL,
    title: L("Phones away on the floor", "El teléfono, guardado en el salón"),
    body: L("Phones stay away on the floor except to use The First.", "El teléfono queda guardado en el salón, salvo para usar The First."),
    howTo: L("Keep it in your apron pocket on silent with vibration on.", "Llévalo en el bolsillo del delantal, en silencio y con vibración."),
  },
  {
    key: "uniform",
    roles: ALL,
    title: L("Uniform and grooming at line-up", "Uniforme y presentación en el line-up"),
    body: L("Uniform and grooming meet the house standard at line-up.", "El uniforme y la presentación cumplen el estándar de la casa en el line-up."),
    howTo: L("Pressed shirt, clean apron, closed black shoes, hair tied back.", "Camisa planchada, delantal limpio, zapatos negros cerrados, pelo recogido."),
  },
  {
    key: "spills",
    roles: ALL,
    title: L("Report a broken glass or spill at once", "Avisa enseguida si se rompe un vaso o hay un derrame"),
    body: L("A broken glass or a spill is reported immediately and the area is marked.", "Un vaso roto o un derrame se avisa en el momento y se marca la zona."),
    howTo: L("Place the wet floor sign, then send a Help request so someone covers your tables.", "Pon el cartel de piso mojado y manda un pedido de Ayuda para que alguien cubra tus mesas."),
  },
  {
    key: "comps",
    roles: [...FLOOR, ...BAR],
    title: L("Every comp or void is approved", "Toda invitación o anulación se aprueba"),
    body: L("Every comp or void is approved by the manager on duty before it is done in the POS.", "Toda invitación o anulación la aprueba el manager de turno antes de hacerla en el POS."),
    howTo: L("Send the request from The First and wait for Approved.", "Manda el pedido desde The First y espera el Aprobado."),
  },
  {
    key: "bottles",
    roles: BAR,
    title: L("Bottles leave the bar with a count", "Las botellas salen de la barra con conteo"),
    body: L("Bottles leave the bar only with a count entry.", "Las botellas salen de la barra solo con un registro de conteo."),
    howTo: L("Record a move in Inventory before the bottle leaves.", "Registra el movimiento en Inventario antes de que salga la botella."),
  },
  {
    key: "closing",
    roles: ALL,
    title: L("Closing tasks before you leave", "Las tareas de cierre, antes de irte"),
    body: L("Closing tasks are done before clocking out.", "Las tareas de cierre se terminan antes de marcar la salida."),
    howTo: L("Finish your closing checklist in The First and show it to the manager.", "Termina tu checklist de cierre en The First y muéstraselo al manager."),
  },
];

type T = { role: Role; phase: "open" | "close"; title: L; due: number; weekly?: number[]; items: Array<[string, string, ("photo" | "critical" | "B" | "A")?]> };

/** Task templates per role (BLUEPRINT 2.2). Weekly ones (ADR 0015): Monday deep clean. Copied to every venue. */
export const TEMPLATES: T[] = [
  {
    role: "server",
    phase: "open",
    title: L("Server opening", "Apertura de mesero"),
    due: 0,
    items: [
      ["Polish glassware for your section", "Pule la cristalería de tu sección"],
      ["Set tables: linen, cutlery, glasses", "Arma las mesas: mantel, cubiertos, copas", "photo"],
      ["Fold napkins for 40 covers", "Dobla servilletas para 40 cubiertos"],
      ["Check menus are clean and current", "Revisa que las cartas estén limpias y al día"],
      ["Read tonight's specials and 86 list", "Lee los especiales y lo que no hay hoy", "critical"],
      ["Wine service station stocked", "Estación de servicio de vino completa", "B"],
    ],
  },
  {
    role: "server",
    phase: "close",
    title: L("Server closing", "Cierre de mesero"),
    due: 60,
    items: [
      ["Clear and reset your section", "Levanta y reacomoda tu sección"],
      ["Restock side station", "Repón la estación de apoyo"],
      ["Linen to the laundry bag", "Mantelería a la bolsa de lavandería"],
      ["Section clean for tomorrow", "Sección limpia para mañana", "photo"],
    ],
  },
  {
    role: "runner",
    phase: "open",
    title: L("Runner opening", "Apertura de runner"),
    due: 0,
    items: [
      ["Pass area clean and stocked", "Pase limpio y abastecido"],
      ["Trays polished and stacked", "Bandejas pulidas y apiladas"],
      ["Table numbers learned for tonight", "Números de mesa aprendidos para hoy", "critical"],
    ],
  },
  {
    role: "runner",
    phase: "close",
    title: L("Runner closing", "Cierre de runner"),
    due: 45,
    items: [
      ["Pass wiped down", "Pase limpio"],
      ["Trays washed and stored", "Bandejas lavadas y guardadas"],
    ],
  },
  {
    role: "busser",
    phase: "open",
    title: L("Busser opening", "Apertura de ayudante"),
    due: 0,
    items: [
      ["Water carafes filled and chilled", "Jarras de agua llenas y frías"],
      ["Bread station ready", "Estación de pan lista"],
      ["Bus tubs clean in place", "Cubetas limpias en su lugar"],
    ],
  },
  {
    role: "busser",
    phase: "close",
    title: L("Busser closing", "Cierre de ayudante"),
    due: 45,
    items: [
      ["Floors swept in all sections", "Pisos barridos en todas las secciones", "photo"],
      ["Carafes washed", "Jarras lavadas"],
      ["Trash out and bins lined", "Basura afuera y tachos con bolsa"],
    ],
  },
  {
    role: "bartender",
    phase: "open",
    title: L("Bar opening", "Apertura de barra"),
    due: -15,
    items: [
      ["Ice wells full", "Hieleras llenas"],
      ["Garnishes cut and covered", "Garnituras cortadas y tapadas", "photo"],
      ["Opening bottle count done", "Conteo de botellas de apertura hecho", "critical"],
      ["Speed rail stocked", "Speed rail completo"],
    ],
  },
  {
    role: "bartender",
    phase: "close",
    title: L("Bar closing", "Cierre de barra"),
    due: 60,
    items: [
      ["Closing bottle count done", "Conteo de botellas de cierre hecho", "critical"],
      ["Mats and drains clean", "Alfombras y desagües limpios", "photo"],
      ["Fruit wrapped and labeled", "Fruta envuelta y etiquetada"],
    ],
  },
  {
    role: "bartender",
    phase: "open",
    title: L("Monday deep clean", "Limpieza profunda del lunes"),
    due: 30,
    weekly: [1],
    items: [
      ["Deep clean the bar fridges", "Limpieza profunda de las heladeras de la barra", "photo"],
      ["Descale the coffee machine", "Descalcifica la cafetera"],
    ],
  },
  {
    role: "barback",
    phase: "open",
    title: L("Barback opening", "Apertura de barback"),
    due: -15,
    items: [
      ["Restock beer and mixers", "Repón cerveza y mixers"],
      ["Glass racks ready", "Racks de vasos listos"],
      ["Ice bins topped up", "Contenedores de hielo completos"],
    ],
  },
  {
    role: "barback",
    phase: "close",
    title: L("Barback closing", "Cierre de barback"),
    due: 45,
    items: [
      ["Empties to recycling", "Vacíos al reciclaje"],
      ["Cooler doors wiped", "Puertas de heladera limpias"],
    ],
  },
  {
    role: "kitchen",
    phase: "open",
    title: L("Kitchen opening", "Apertura de cocina"),
    due: -30,
    items: [
      ["Fridge temperatures logged", "Temperaturas de heladeras registradas", "critical"],
      ["Mise en place for the menu", "Mise en place del menú"],
      ["Allergen binder at the pass", "Carpeta de alérgenos en el pase"],
    ],
  },
  {
    role: "kitchen",
    phase: "close",
    title: L("Kitchen closing", "Cierre de cocina"),
    due: 60,
    items: [
      ["Food labeled and dated", "Comida etiquetada y fechada", "photo"],
      ["Line and hoods wiped", "Línea y campanas limpias"],
    ],
  },
  {
    role: "captain",
    phase: "open",
    title: L("Captain opening", "Apertura de capitán"),
    due: -10,
    items: [
      ["Sections assigned for tonight", "Secciones asignadas para hoy"],
      ["Line-up with the floor team", "Line-up con el equipo de salón", "critical"],
      ["Reservation notes reviewed", "Notas de reservas revisadas"],
    ],
  },
];

type M = { cat: string; name: L; desc: L; ing: L; allergens: string[]; price: number; tags?: string[] };

/** Sample menu (to be validated: real dishes, prices and photos come from the owner). Prices in cents. */
export const MENU: M[] = [
  { cat: "starters", name: L("Burrata, heirloom tomato", "Burrata con tomates heirloom"), desc: L("Creamy burrata, summer tomatoes, basil oil.", "Burrata cremosa, tomates de estación, aceite de albahaca."), ing: L("Burrata, tomato, basil, olive oil, sea salt", "Burrata, tomate, albahaca, aceite de oliva, sal marina"), allergens: ["milk"], price: 2400, tags: ["vegetarian"] },
  { cat: "starters", name: L("Tuna crudo", "Crudo de atún"), desc: L("Yellowfin tuna, citrus, chili, crispy shallot.", "Atún aleta amarilla, cítricos, ají, chalota crocante."), ing: L("Tuna, orange, lime, chili, shallot, soy", "Atún, naranja, lima, ají, chalota, soja"), allergens: ["fish", "soy"], price: 2600 },
  { cat: "starters", name: L("Steak tartare", "Steak tartare"), desc: L("Hand-cut beef, egg yolk, capers, grilled bread.", "Carne cortada a cuchillo, yema, alcaparras, pan grillado."), ing: L("Beef, egg yolk, capers, mustard, shallot, bread", "Carne, yema, alcaparras, mostaza, chalota, pan"), allergens: ["eggs", "mustard", "gluten"], price: 2800 },
  { cat: "starters", name: L("Oysters, half dozen", "Ostras, media docena"), desc: L("East Coast oysters, mignonette, lemon.", "Ostras de la costa este, mignonette, limón."), ing: L("Oysters, shallot, vinegar, lemon", "Ostras, chalota, vinagre, limón"), allergens: ["molluscs", "sulphites"], price: 2400 },
  { cat: "mains", name: L("Roast chicken for two", "Pollo asado para dos"), desc: L("Whole roast chicken, jus, potato purée.", "Pollo entero asado, jugo, puré de papa."), ing: L("Chicken, butter, potato, thyme, garlic", "Pollo, manteca, papa, tomillo, ajo"), allergens: ["milk"], price: 7800 },
  { cat: "mains", name: L("Black cod, miso", "Bacalao negro al miso"), desc: L("Miso-glazed black cod, bok choy, sesame.", "Bacalao negro glaseado con miso, bok choy, sésamo."), ing: L("Black cod, miso, sake, bok choy, sesame", "Bacalao negro, miso, sake, bok choy, sésamo"), allergens: ["fish", "soy", "sesame"], price: 4600 },
  { cat: "mains", name: L("Dry-aged ribeye", "Ojo de bife madurado"), desc: L("16 oz dry-aged ribeye, peppercorn sauce.", "Ojo de bife madurado de 450 g, salsa de pimienta."), ing: L("Beef, cream, peppercorn, brandy", "Carne, crema, pimienta, brandy"), allergens: ["milk", "sulphites"], price: 6800 },
  { cat: "mains", name: L("Wild mushroom risotto", "Risotto de hongos silvestres"), desc: L("Carnaroli rice, wild mushrooms, parmesan.", "Arroz carnaroli, hongos silvestres, parmesano."), ing: L("Rice, mushrooms, parmesan, butter, white wine, celery", "Arroz, hongos, parmesano, manteca, vino blanco, apio"), allergens: ["milk", "celery", "sulphites"], price: 3400, tags: ["vegetarian"] },
  { cat: "mains", name: L("Lobster linguine", "Linguine de langosta"), desc: L("Fresh linguine, Maine lobster, cherry tomato, chili.", "Linguine fresco, langosta de Maine, tomate cherry, ají."), ing: L("Pasta, lobster, tomato, garlic, chili, butter", "Pasta, langosta, tomate, ajo, ají, manteca"), allergens: ["gluten", "eggs", "crustaceans", "milk"], price: 5200 },
  { cat: "sides", name: L("Hand-cut fries", "Papas fritas cortadas a mano"), desc: L("Twice-fried, rosemary salt.", "Fritas dos veces, sal de romero."), ing: L("Potato, beef fat, rosemary, salt", "Papa, grasa vacuna, romero, sal"), allergens: [], price: 1200 },
  { cat: "sides", name: L("Charred broccolini", "Broccolini a la brasa"), desc: L("Lemon, chili, toasted almonds.", "Limón, ají, almendras tostadas."), ing: L("Broccolini, lemon, chili, almonds", "Broccolini, limón, ají, almendras"), allergens: ["tree_nuts"], price: 1400, tags: ["vegan"] },
  { cat: "desserts", name: L("Chocolate soufflé", "Soufflé de chocolate"), desc: L("Dark chocolate, vanilla crème anglaise. 15 minutes.", "Chocolate amargo, crema inglesa de vainilla. 15 minutos."), ing: L("Chocolate, eggs, sugar, butter, milk, flour", "Chocolate, huevos, azúcar, manteca, leche, harina"), allergens: ["eggs", "milk", "gluten"], price: 1600 },
  { cat: "desserts", name: L("Olive oil cake", "Torta de aceite de oliva"), desc: L("Citrus, whipped mascarpone.", "Cítricos, mascarpone batido."), ing: L("Flour, olive oil, eggs, orange, mascarpone", "Harina, aceite de oliva, huevos, naranja, mascarpone"), allergens: ["gluten", "eggs", "milk"], price: 1400 },
  { cat: "cocktails", name: L("The First Martini", "Martini The First"), desc: L("Gin, dry vermouth, olive brine, lemon twist.", "Gin, vermut seco, salmuera de aceituna, piel de limón."), ing: L("Gin, vermouth, olive", "Gin, vermut, aceituna"), allergens: ["sulphites"], price: 2000 },
  { cat: "cocktails", name: L("Smoked Old Fashioned", "Old Fashioned ahumado"), desc: L("Bourbon, demerara, bitters, oak smoke.", "Bourbon, demerara, amargos, humo de roble."), ing: L("Bourbon, sugar, bitters, orange", "Bourbon, azúcar, amargos, naranja"), allergens: [], price: 2100 },
  { cat: "wine", name: L("Sancerre, Loire 2022", "Sancerre, Loira 2022"), desc: L("Glass. Crisp, mineral, citrus.", "Copa. Fresco, mineral, cítrico."), ing: L("Sauvignon blanc", "Sauvignon blanc"), allergens: ["sulphites"], price: 2200 },
  { cat: "wine", name: L("Barolo, Piedmont 2018", "Barolo, Piamonte 2018"), desc: L("Bottle. Rose, tar, firm tannins.", "Botella. Rosa, alquitrán, taninos firmes."), ing: L("Nebbiolo", "Nebbiolo"), allergens: ["sulphites"], price: 16500 },
  { cat: "zero_proof", name: L("Garden spritz", "Spritz de jardín"), desc: L("Non-alcoholic aperitif, cucumber, tonic.", "Aperitivo sin alcohol, pepino, tónica."), ing: L("Non-alcoholic aperitif, cucumber, tonic", "Aperitivo sin alcohol, pepino, tónica"), allergens: [], price: 1200 },
];

/** Bar items per venue, in tenths, with average cost per bottle in cents. */
export const BAR_ITEMS: Array<{ name: string; category: string; unit: "bottle" | "unit"; par: number; cost: number; onHand: number }> = [
  { name: "Gin, London Dry", category: "spirits", unit: "bottle", par: 40, cost: 2600, onHand: 52 },
  { name: "Vodka", category: "spirits", unit: "bottle", par: 40, cost: 2200, onHand: 47 },
  { name: "Bourbon", category: "spirits", unit: "bottle", par: 30, cost: 3400, onHand: 36 },
  { name: "Tequila Blanco", category: "spirits", unit: "bottle", par: 30, cost: 3100, onHand: 28 },
  { name: "Mezcal", category: "spirits", unit: "bottle", par: 20, cost: 4200, onHand: 21 },
  { name: "Dry Vermouth", category: "aperitif", unit: "bottle", par: 20, cost: 1500, onHand: 24 },
  { name: "Campari", category: "aperitif", unit: "bottle", par: 20, cost: 2700, onHand: 15 },
  { name: "Sancerre", category: "wine", unit: "bottle", par: 60, cost: 2400, onHand: 72 },
  { name: "Barolo 2018", category: "wine", unit: "bottle", par: 24, cost: 6200, onHand: 30 },
  { name: "Champagne Brut", category: "wine", unit: "bottle", par: 36, cost: 4100, onHand: 40 },
];
