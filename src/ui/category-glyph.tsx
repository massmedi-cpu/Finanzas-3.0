type Props = {
  name: string;
  size?: number;
};

export function CategoryGlyph({ name, size = 18 }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    "data-category-icon": name,
  };

  switch (name) {
    case "wallet": return <svg {...common}><path d="M4 6.5h14a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h12"/><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z"/></svg>;
    case "home": return <svg {...common}><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></svg>;
    case "building": return <svg {...common}><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/></svg>;
    case "cart": return <svg {...common}><path d="M3 4h2l2.2 10h10.4l2-7H7"/><circle cx="9" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/></svg>;
    case "utensils": return <svg {...common}><path d="M7 3v8M4 3v4a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 1 4 4 4 7h-4"/></svg>;
    case "coffee": return <svg {...common}><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M17 10h1a2 2 0 0 1 0 4h-1M8 3v2M12 3v2"/></svg>;
    case "car": return <svg {...common}><path d="m5 16-1-4 2-5h12l2 5-1 4"/><path d="M4 12h16M7 16h10"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/></svg>;
    case "fuel": return <svg {...common}><rect x="4" y="3" width="10" height="18" rx="1"/><path d="M7 7h4M14 8h3l2 2v7a2 2 0 0 1-4 0v-3"/></svg>;
    case "bus": return <svg {...common}><rect x="5" y="3" width="14" height="17" rx="3"/><path d="M7 8h10M8 13h.01M16 13h.01M8 20v1M16 20v1"/></svg>;
    case "train": return <svg {...common}><rect x="6" y="3" width="12" height="15" rx="3"/><path d="M8 8h8M9 13h.01M15 13h.01M9 18l-2 3M15 18l2 3M8 21h8"/></svg>;
    case "parking": return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M10 17V7h3a3 3 0 0 1 0 6h-3"/></svg>;
    case "wrench": return <svg {...common}><path d="M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 3-3-3Z"/></svg>;
    case "heart": return <svg {...common}><path d="M20.8 5.6a5.3 5.3 0 0 0-7.5 0L12 6.9l-1.3-1.3a5.3 5.3 0 1 0-7.5 7.5L12 21l8.8-7.9a5.3 5.3 0 0 0 0-7.5Z"/></svg>;
    case "pill": return <svg {...common}><path d="m8 16 8-8a4 4 0 0 0-6-6l-8 8a4 4 0 0 0 6 6Z"/><path d="m7 7 6 6"/></svg>;
    case "stethoscope": return <svg {...common}><path d="M6 3v5a4 4 0 0 0 8 0V3M4 3h4M12 3h4M10 14v2a4 4 0 0 0 8 0v-3"/><circle cx="18" cy="11" r="2"/></svg>;
    case "dumbbell": return <svg {...common}><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>;
    case "sparkles": return <svg {...common}><path d="m12 3 1.4 4.1L17 9l-3.6 1.9L12 15l-1.4-4.1L7 9l3.6-1.9ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8ZM19 13l.7 1.8L22 16l-2.3.8L19 19l-.7-2.2L16 16l2.3-1.2Z"/></svg>;
    case "film": return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M17 9h4M3 15h4M17 15h4"/></svg>;
    case "gamepad": return <svg {...common}><path d="M8 8h8a5 5 0 0 1 4.8 6.5l-1 3A2 2 0 0 1 16.6 19L14 17H10l-2.6 2a2 2 0 0 1-3.2-1.5l-1-3A5 5 0 0 1 8 8Z"/><path d="M7 12v4M5 14h4M16 12h.01M18 15h.01"/></svg>;
    case "music": return <svg {...common}><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>;
    case "ticket": return <svg {...common}><path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4Z"/><path d="M12 9v1M12 14v1M12 18v1"/></svg>;
    case "trophy": return <svg {...common}><path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/></svg>;
    case "bag": return <svg {...common}><path d="M5 8h14l1 12H4Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>;
    case "shirt": return <svg {...common}><path d="m8 4-5 3 3 5 2-1v10h8V11l2 1 3-5-5-3a4 4 0 0 1-8 0Z"/></svg>;
    case "laptop": return <svg {...common}><rect x="5" y="4" width="14" height="11" rx="1"/><path d="M3 19h18l-2-4H5Z"/></svg>;
    case "gift": return <svg {...common}><rect x="3" y="9" width="18" height="12" rx="1"/><path d="M12 9v12M3 13h18M12 9H8a2.5 2.5 0 1 1 2.5-2.5C10.5 8 12 9 12 9Zm0 0h4a2.5 2.5 0 1 0-2.5-2.5C13.5 8 12 9 12 9Z"/></svg>;
    case "receipt": return <svg {...common}><path d="M6 3h12v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 21Z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>;
    case "phone": return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M10 5h4M11 19h2"/></svg>;
    case "wifi": return <svg {...common}><path d="M4 9a12 12 0 0 1 16 0M7 12a8 8 0 0 1 10 0M10 15a4 4 0 0 1 4 0"/><circle cx="12" cy="18" r="1"/></svg>;
    case "cloud": return <svg {...common}><path d="M6 18a4 4 0 0 1-.4-8A6 6 0 0 1 17 8a5 5 0 0 1 1 10Z"/></svg>;
    case "bolt": return <svg {...common}><path d="m13 2-8 12h7l-1 8 8-12h-7Z"/></svg>;
    case "droplet": return <svg {...common}><path d="M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12Z"/></svg>;
    case "flame": return <svg {...common}><path d="M12 22a7 7 0 0 0 7-7c0-5-4-8-5-13-3 2-5 5-5 8-1-1-2-2-3-2-1 2-1 4-1 6a7 7 0 0 0 7 8Z"/></svg>;
    case "shield": return <svg {...common}><path d="M12 3 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6Z"/><path d="m9 12 2 2 4-4"/></svg>;
    case "plane": return <svg {...common}><path d="m2 16 20-8-8 14-2-7Z"/><path d="m12 15-5 4"/></svg>;
    case "briefcase": return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/></svg>;
    case "landmark": return <svg {...common}><path d="m3 9 9-5 9 5M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M4 18h16M3 21h18"/></svg>;
    case "banknote": return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 9h.01M17 15h.01"/></svg>;
    case "piggy-bank": return <svg {...common}><path d="M6 11a6 5 0 0 1 11-3h3v4h-2a5 5 0 0 1-3 4v3h-3v-2H9v2H6v-3a5 5 0 0 1 0-5Z"/><path d="M8 6c1-2 4-2 5 0M16 10h.01"/></svg>;
    case "book": return <svg {...common}><path d="M4 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4ZM20 4h-6a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h6Z"/></svg>;
    case "paw": return <svg {...common}><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="5" cy="13" r="1.7"/><circle cx="19" cy="13" r="1.7"/><path d="M8 19c0-3 2-5 4-5s4 2 4 5c0 2-2 3-4 2-2 1-4 0-4-2Z"/></svg>;
    case "scissors": return <svg {...common}><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.5 8.5 11 7M8.5 15.5l11-7"/></svg>;
    case "coins": return <svg {...common}><ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5M4 11v4c0 1.4 2.2 2.5 5 2.5"/><ellipse cx="16" cy="15" rx="4" ry="2"/><path d="M12 15v4c0 1.1 1.8 2 4 2s4-.9 4-2v-4"/></svg>;
    case "arrows": return <svg {...common}><path d="M4 7h13l-3-3M20 17H7l3 3M17 7l-3 3M7 17l3-3"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M9 12h6"/></svg>;
  }
}
