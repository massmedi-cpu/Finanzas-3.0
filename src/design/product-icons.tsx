import type { ReactNode, SVGProps } from "react";

export type ProductIconName =
  | "home"
  | "onboarding"
  | "review"
  | "transactions"
  | "analysis"
  | "accounts"
  | "budgets"
  | "recurrences"
  | "forecast"
  | "documents"
  | "settings"
  | "wallet"
  | "balance"
  | "chart"
  | "budget"
  | "future"
  | "activity"
  | "arrow"
  | "spent"
  | "remaining"
  | "progress"
  | "spark"
  | "category"
  | "refresh"
  | "warning"
  | "merchant"
  | "rules"
  | "bank"
  | "privacy";

const iconPaths: Record<ProductIconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/></>,
  onboarding: <><path d="M12 3v4M12 17v4M4.2 4.2 7 7M17 17l2.8 2.8M3 12h4M17 12h4M4.2 19.8 7 17M17 7l2.8-2.8"/><circle cx="12" cy="12" r="4"/></>,
  review: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5"/><path d="m14.5 16 1.5 1.5 3-3"/></>,
  transactions: <><path d="M4 7h13"/><path d="m14 4 3 3-3 3"/><path d="M20 17H7"/><path d="m10 14-3 3 3 3"/></>,
  analysis: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  accounts: <><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M7 6V4h10v2M3 11h18"/></>,
  budgets: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10M8.5 9.5c0-1.1 1.3-2 3.5-2s3.5.9 3.5 2-1 1.8-3.5 2.5-3.5 1.4-3.5 2.5 1.3 2 3.5 2 3.5-.9 3.5-2"/></>,
  recurrences: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 9A7 7 0 0 1 18.7 7L20 12M4 12l1.3 5A7 7 0 0 0 17.9 15"/></>,
  forecast: <><path d="M4 18h16"/><path d="M6 15 10 9l4 3 4-6"/><circle cx="6" cy="15" r="1"/><circle cx="10" cy="9" r="1"/><circle cx="14" cy="12" r="1"/><circle cx="18" cy="6" r="1"/></>,
  documents: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  wallet: <><path d="M3.5 7h16v11h-16a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13v3"/><path d="M15 11h7v4h-7a2 2 0 1 1 0-4Z"/></>,
  balance: <><path d="M12 3v18M5 7h14M7 7l-4 7h8L7 7Zm10 0-4 7h8l-4-7Z"/></>,
  chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-5 3 3 5-7"/></>,
  budget: <><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/></>,
  future: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  activity: <path d="M3 12h4l2-5 4 10 2-5h6"/>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
  spent: <><path d="M4 4v16h16"/><path d="m7 15 4-4 3 3 5-6"/><path d="M16 8h3v3"/></>,
  remaining: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  progress: <><path d="M4 18V9"/><path d="M10 18V5"/><path d="M16 18v-7"/><path d="M22 18H2"/></>,
  spark: <><path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/></>,
  category: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  refresh: <><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6.4 6.4L4 9"/><path d="M5.5 15A7 7 0 0 0 17.6 17.6L20 15"/></>,
  warning: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
  merchant: <><path d="M4 10h16l-1.5-5h-13L4 10Z"/><path d="M5 10v9h14v-9M9 19v-5h6v5"/></>,
  rules: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></>,
  bank: <><path d="m3 9 9-5 9 5"/><path d="M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 19h16"/></>,
  privacy: <><path d="M12 3 5 6v5c0 4.5 2.8 7.7 7 10 4.2-2.3 7-5.5 7-10V6Z"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11"/></>,
};

type ProductIconProps = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: ProductIconName;
  size?: number | string;
};

export function ProductIcon({ name, size = "1em", ...props }: ProductIconProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}
