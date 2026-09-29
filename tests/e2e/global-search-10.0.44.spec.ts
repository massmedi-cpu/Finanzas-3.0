import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  MAX_GLOBAL_SEARCH_QUERY_LENGTH,
  moveGlobalSearchIndex,
  prepareGlobalSearchQuery,
} from "../../app/global-search-policy";
import { shouldOpenGlobalSearchShortcut } from "../../app/global-search-shortcut";

test("global search accepts only bounded meaningful queries", () => {
  expect(prepareGlobalSearchQuery(" a ")).toBeNull();
  expect(prepareGlobalSearchQuery("  café  ")).toBe("café");
  expect(prepareGlobalSearchQuery("x".repeat(MAX_GLOBAL_SEARCH_QUERY_LENGTH))).toHaveLength(MAX_GLOBAL_SEARCH_QUERY_LENGTH);
  expect(prepareGlobalSearchQuery("x".repeat(MAX_GLOBAL_SEARCH_QUERY_LENGTH + 1))).toBeNull();
});

test("global search keyboard navigation wraps without invalid indexes", () => {
  expect(moveGlobalSearchIndex(-1, 3, "next")).toBe(0);
  expect(moveGlobalSearchIndex(2, 3, "next")).toBe(0);
  expect(moveGlobalSearchIndex(-1, 3, "previous")).toBe(2);
  expect(moveGlobalSearchIndex(0, 3, "previous")).toBe(2);
  expect(moveGlobalSearchIndex(0, 0, "next")).toBe(-1);
});

test("slash shortcut never steals focus from editable controls", () => {
  expect(shouldOpenGlobalSearchShortcut({ key: "/", code: "Slash", metaKey: false, ctrlKey: false, altKey: false, targetTagName: "DIV" })).toBe(true);
  expect(shouldOpenGlobalSearchShortcut({ key: "/", code: "Slash", metaKey: false, ctrlKey: false, altKey: false, targetTagName: "INPUT" })).toBe(false);
  expect(shouldOpenGlobalSearchShortcut({ key: "/", code: "Slash", metaKey: false, ctrlKey: false, altKey: false, targetTagName: "DIV", targetContentEditable: true })).toBe(false);
});

test("global search client rejects stale responses and restores modal focus safely", () => {
  const source = readFileSync("app/global-search.tsx", "utf8");
  expect(source).toContain("requestSequenceRef");
  expect(source).toContain("requestSequence !== requestSequenceRef.current");
  expect(source).toContain("payload.query !== preparedQuery");
  expect(source).toContain("requestRef.current?.abort()");
  expect(source).toContain("opener?.isConnected");
  expect(source).toContain("FOCUSABLE_SELECTOR");
  expect(source).toContain('event.key !== "Tab"');
  expect(source).toContain('role="status"');
  expect(source).toContain('aria-live="polite"');
  expect(source).toContain("MAX_GLOBAL_SEARCH_QUERY_LENGTH");
});

test("global search API uses the same query policy as the client", () => {
  const route = readFileSync("app/api/search/route.ts", "utf8");
  expect(route).toContain('import { prepareGlobalSearchQuery } from "../../global-search-policy"');
  expect(route).toContain("const query = prepareGlobalSearchQuery(rawQuery)");
  expect(route).toContain('"cache-control": "private, no-store"');
  expect(route).toContain("MAX_RESULTS = 18");
});
