export const REGIONAL_CONFIG = {
  locale: "es-ES",
  currency: "EUR",
  timeZone: "Europe/Madrid",
  visualDatePattern: "DD/MM/AAAA",
} as const;

export type RegionalConfig = typeof REGIONAL_CONFIG;
