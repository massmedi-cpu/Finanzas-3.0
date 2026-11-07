export const RESPONSIVE_BREAKPOINTS = {
  compactPhone: 360,
  compact: 480,
  mobileMax: 768,
  content: 1024,
  desktopNavigation: 1100,
  dense: 1280,
  wide: 1440,
  ultraWide: 1728,
} as const;

export const RESPONSIVE_LAYOUT = {
  compactMaxRem: 30,
  mobileMaxRem: 48,
  desktopMinRem: 48.01,
  wideNavigationMaxRem: 90,
} as const;

export const RESPONSIVE_TEST_VIEWPORTS = {
  compactBefore: 479,
  compactAfter: 481,
  mobileBefore: 767,
  mobileEdge: RESPONSIVE_BREAKPOINTS.mobileMax,
  desktopStart: 769,
  wideBefore: 1439,
  wideEdge: RESPONSIVE_BREAKPOINTS.wide,
  wideAfter: 1441,
} as const;

export type ResponsiveBreakpointName = keyof typeof RESPONSIVE_BREAKPOINTS;
