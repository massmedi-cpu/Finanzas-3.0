export type GlobalSearchShortcutInput = {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  targetTagName?: string | null;
  targetContentEditable?: boolean;
};

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function shouldOpenGlobalSearchShortcut(input: GlobalSearchShortcutInput) {
  const tagName = input.targetTagName?.toUpperCase() ?? null;
  const typing = Boolean(tagName && EDITABLE_TAGS.has(tagName)) || input.targetContentEditable === true;
  const slashShortcut = input.key === "/" || input.code === "Slash";

  return !typing && slashShortcut && !input.metaKey && !input.ctrlKey && !input.altKey;
}
