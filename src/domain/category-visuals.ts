export const CATEGORY_ICON_OPTIONS = [
  { value: "wallet", label: "Cartera" },
  { value: "home", label: "Vivienda" },
  { value: "building", label: "Edificio" },
  { value: "cart", label: "Supermercado" },
  { value: "utensils", label: "Restauración" },
  { value: "coffee", label: "Café" },
  { value: "car", label: "Coche" },
  { value: "fuel", label: "Combustible" },
  { value: "bus", label: "Autobús" },
  { value: "train", label: "Tren" },
  { value: "parking", label: "Aparcamiento" },
  { value: "wrench", label: "Mantenimiento" },
  { value: "heart", label: "Salud" },
  { value: "pill", label: "Farmacia" },
  { value: "stethoscope", label: "Médico" },
  { value: "dumbbell", label: "Deporte" },
  { value: "sparkles", label: "Ocio" },
  { value: "film", label: "Cine" },
  { value: "gamepad", label: "Videojuegos" },
  { value: "music", label: "Música" },
  { value: "ticket", label: "Entradas" },
  { value: "trophy", label: "Premios" },
  { value: "bag", label: "Compras" },
  { value: "shirt", label: "Ropa" },
  { value: "laptop", label: "Tecnología" },
  { value: "gift", label: "Regalos" },
  { value: "receipt", label: "Recibos" },
  { value: "phone", label: "Teléfono" },
  { value: "wifi", label: "Internet" },
  { value: "cloud", label: "Nube" },
  { value: "bolt", label: "Electricidad" },
  { value: "droplet", label: "Agua" },
  { value: "flame", label: "Gas" },
  { value: "shield", label: "Seguros" },
  { value: "plane", label: "Viajes" },
  { value: "briefcase", label: "Trabajo" },
  { value: "landmark", label: "Administración" },
  { value: "banknote", label: "Ingresos" },
  { value: "piggy-bank", label: "Ahorro" },
  { value: "book", label: "Educación" },
  { value: "paw", label: "Mascotas" },
  { value: "scissors", label: "Cuidado personal" },
  { value: "coins", label: "Efectivo" },
  { value: "arrows", label: "Transferencias" },
  { value: "more", label: "Otros" },
] as const;

export const CATEGORY_COLOR_OPTIONS = [
  { value: "category.blue", label: "Azul", hex: "#4d8dff" },
  { value: "category.cyan", label: "Cian", hex: "#2bd9f7" },
  { value: "category.green", label: "Verde", hex: "#35d07f" },
  { value: "category.amber", label: "Ámbar", hex: "#ffbf47" },
  { value: "category.violet", label: "Violeta", hex: "#9f77ff" },
  { value: "category.rose", label: "Rosa", hex: "#ff5d73" },
  { value: "category.indigo", label: "Índigo", hex: "#6675ff" },
  { value: "category.teal", label: "Turquesa", hex: "#2dd4bf" },
  { value: "category.emerald", label: "Esmeralda", hex: "#10b981" },
  { value: "category.lime", label: "Lima", hex: "#84cc16" },
  { value: "category.yellow", label: "Amarillo", hex: "#eab308" },
  { value: "category.orange", label: "Naranja", hex: "#f97316" },
  { value: "category.red", label: "Rojo", hex: "#ef4444" },
  { value: "category.pink", label: "Fucsia suave", hex: "#ec4899" },
  { value: "category.fuchsia", label: "Fucsia", hex: "#d946ef" },
  { value: "category.purple", label: "Púrpura", hex: "#a855f7" },
  { value: "category.sky", label: "Celeste", hex: "#38bdf8" },
  { value: "category.slate", label: "Pizarra", hex: "#94a3b8" },
] as const;

const ICON_KEYS = new Set<string>(CATEGORY_ICON_OPTIONS.map((item) => item.value));
const COLOR_TOKENS = new Set<string>(CATEGORY_COLOR_OPTIONS.map((item) => item.value));
const COLOR_BY_TOKEN = new Map(CATEGORY_COLOR_OPTIONS.map((item) => [item.value, item.hex] as const));

export function isSupportedCategoryIcon(value: string) {
  return ICON_KEYS.has(value);
}

export function isSupportedCategoryColor(value: string) {
  return COLOR_TOKENS.has(value);
}

export function categoryColorHex(value: string) {
  return COLOR_BY_TOKEN.get(value) ?? CATEGORY_COLOR_OPTIONS[0].hex;
}
