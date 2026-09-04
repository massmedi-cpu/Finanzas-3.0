export const BREAKPOINTS = {
  mobileSmall: 360,
  mobileLarge: 480,
  tabletPortrait: 768,
  tabletLandscape: 1024,
  laptop: 1280,
  desktop: 1440,
  wide: 1728,
} as const;

export const TYPOGRAPHY = {
  pageTitle: "clamp(1.75rem, 1.35rem + 1.4vw, 2.75rem)",
  sectionTitle: "clamp(1.25rem, 1.12rem + 0.5vw, 1.625rem)",
  subtitle: "clamp(1rem, 0.95rem + 0.2vw, 1.125rem)",
  kpiPrimary: "clamp(1.625rem, 1.35rem + 1vw, 2.375rem)",
  kpiSecondary: "clamp(1.125rem, 1.05rem + 0.3vw, 1.375rem)",
  body: "1rem",
  bodySecondary: "0.9375rem",
  label: "0.875rem",
  table: "0.9375rem",
  button: "0.9375rem",
  helper: "0.8125rem",
} as const;

export const SPACING = {
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
  8: "2rem",
  10: "2.5rem",
  12: "3rem",
} as const;

export const RADII = {
  small: "0.625rem",
  medium: "0.875rem",
  large: "1.25rem",
  panel: "1.5rem",
  pill: "999px",
} as const;

export const MOTION = {
  fast: "120ms",
  normal: "180ms",
  slow: "260ms",
} as const;

export const TOUCH_TARGET = {
  minimum: 44,
  comfortable: 48,
} as const;
