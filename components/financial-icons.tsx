import type { ReactNode, SVGProps } from "react";

export type FinancialIconName =
  | "home" | "cash-flow" | "movements" | "analysis" | "archive" | "more"
  | "accounts" | "categories" | "rules" | "automation" | "import" | "scan"
  | "integrations" | "control" | "settings" | "help" | "intelligence"
  | "budget" | "goals" | "net-worth" | "plan" | "forecast" | "explain"
  | "search" | "filter" | "plus" | "edit" | "trash" | "link" | "check"
  | "pending" | "document" | "close" | "chevron-right" | "sync";

type Props = SVGProps<SVGSVGElement> & { name: FinancialIconName; active?: boolean };

const paths: Record<FinancialIconName, ReactNode> = {
  home:<><path d="M3.5 10.5 12 3.6l8.5 6.9"/><path d="M5.8 9.2v10.2h12.4V9.2M9.3 19.4v-6.2h5.4v6.2"/></>,
  "cash-flow":<><path d="M4 7.2h13.5"/><path d="m14.8 4.5 2.8 2.7-2.8 2.7"/><path d="M20 16.8H6.5"/><path d="m9.2 14.1-2.8 2.7 2.8 2.7"/></>,
  movements:<><path d="M5 5.5h14M5 12h14M5 18.5h14"/><path d="M8 3.8v3.4M15.5 10.3v3.4M10.5 16.8v3.4"/></>,
  analysis:<><path d="M4.5 19.5V12h3.7v7.5M10.2 19.5V7.5h3.7v12M15.9 19.5V4h3.7v15.5"/><path d="M3.5 19.5h17"/></>,
  archive:<><path d="M4 7.5h16v12H4z"/><path d="M3 4.5h18v3H3zM9 11h6"/></>,
  more:<><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></>,
  accounts:<><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17M7 14h4"/></>,
  categories:<><path d="M4 5.5h6v6H4zM14 5.5h6v6h-6zM4 15h6v5H4zM14 15h6v5h-6z"/></>,
  rules:<><path d="M6 4v16M18 4v16M6 8h7M11 16h7"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/></>,
  automation:<><path d="M7 5.5A8 8 0 0 1 20 12"/><path d="m17 4.5 3 1-1 3M17 18.5A8 8 0 0 1 4 12"/><path d="m7 19.5-3-1 1-3"/><path d="M12 8.5v4l2.5 1.5"/></>,
  import:<><path d="M12 3.5v11"/><path d="m8.5 11 3.5 3.5 3.5-3.5"/><path d="M4.5 16.5v3h15v-3"/></>,
  scan:<><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/><path d="M7 12h10M8.5 9.5h7M9.5 14.5h5"/></>,
  integrations:<><path d="M8.5 8.5 5.8 5.8a2.3 2.3 0 0 0-3.3 3.3l3.7 3.7a2.3 2.3 0 0 0 3.3 0l2.2-2.2"/><path d="m15.5 15.5 2.7 2.7a2.3 2.3 0 1 0 3.3-3.3l-3.7-3.7a2.3 2.3 0 0 0-3.3 0l-2.2 2.2"/><path d="m9 15 6-6"/></>,
  control:<><path d="M12 3.5 19 6v5.4c0 4.1-2.4 7.3-7 9.1-4.6-1.8-7-5-7-9.1V6z"/><path d="m8.8 12 2.1 2.1 4.5-4.6"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  help:<><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.2.9-1.2 1.7v.5"/><path d="M12 17.2h.01"/></>,
  intelligence:<><path d="M12 3.5 14 8l4.5 2-4.5 2-2 4.5-2-4.5-4.5-2L10 8z"/><path d="m18.5 15 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></>,
  budget:<><path d="M4 7h16v12H4z"/><path d="M7 7V5h10v2M8 12h8M8 15.5h5"/></>,
  goals:<><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="m12 12 6-6"/></>,
  "net-worth":<><path d="M4 18.5V6.5M4 18.5h16"/><path d="m6.5 15 4-4 3 2 5-6"/><path d="M16 7h2.5v2.5"/></>,
  plan:<><path d="M6 4.5h12v15H6z"/><path d="M9 8h6M9 11.5h6M9 15h4"/></>,
  forecast:<><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7 3.5v3M17 3.5v3M3.5 9h17"/><path d="M8 13h2M14 13h2M8 16.5h2"/></>,
  explain:<><path d="M5 4.5h14v15H5z"/><path d="M8 8h8M8 11.5h8M8 15h5"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
  filter:<><path d="M4 5h16l-6.3 7.2v5.2l-3.4 1.6v-6.8z"/></>,
  plus:<><path d="M12 5v14M5 12h14"/></>,
  edit:<><path d="m4.5 19.5 4-.8 10.2-10.2-3.2-3.2L5.3 15.5zM13.8 7l3.2 3.2"/></>,
  trash:<><path d="M5 7h14M9 7V4.5h6V7M7 7l.8 13h8.4L17 7M10 10.5v6M14 10.5v6"/></>,
  link:<><path d="M9.5 14.5 8 16a3.2 3.2 0 1 1-4.5-4.5L7 8"/><path d="m14.5 9.5 1.5-1.5a3.2 3.2 0 1 1 4.5 4.5L17 16"/><path d="m8.5 15.5 7-7"/></>,
  check:<><circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.7 2.7 5.5-5.8"/></>,
  pending:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 1.7"/></>,
  document:<><path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4M9 12h6M9 15.5h6"/></>,
  close:<><path d="m6 6 12 12M18 6 6 18"/></>,
  "chevron-right":<path d="m9 5 7 7-7 7"/>,
  sync:<><path d="M19 8a8 8 0 0 0-13-2L4 8"/><path d="M4 4v4h4M5 16a8 8 0 0 0 13 2l2-2"/><path d="M20 20v-4h-4"/></>,
};

export function FinancialIcon({name,active=false,className="",...props}:Props){
  return <svg className={`financial-icon${active?" is-active":""}${className?` ${className}`:""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" {...props}>
    {active&&<rect className="financial-icon-tone" x="1.75" y="1.75" width="20.5" height="20.5" rx="6"/>}
    <g>{paths[name]}</g>
  </svg>;
}
