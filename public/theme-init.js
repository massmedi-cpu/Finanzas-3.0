(() => {
  const STORAGE_KEY = "financial-app:visual-preferences-v1";
  const root = document.documentElement;
  let preference = "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.theme === "light" || parsed?.theme === "dark" || parsed?.theme === "system") {
        preference = parsed.theme;
      }
    }
  } catch {}

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
})();
