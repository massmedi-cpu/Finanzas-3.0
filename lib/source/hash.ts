import { createHash } from "node:crypto";
import type { SourceRow } from "@/lib/source/types";

export function sourceRowHash(row: SourceRow): string {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}
