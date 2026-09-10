import { createClient } from "supabase-js";

const BUCKET = "financial-app-documents";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 1000;
const MAX_DISCOVERED_ENTRIES = 100000;
const MAX_FOLDER_DEPTH = 32;

function stableError(code: string): Error {
  return new Error(code);
}

function managedPrefix(workspaceId: string): string {
  if (!UUID.test(workspaceId)) throw stableError("workspace_deletion_storage_workspace_invalid");
  return `uploads/${workspaceId}`;
}

function assertManagedPath(path: string, workspaceId: string): void {
  const prefix = `${managedPrefix(workspaceId)}/`;
  const segments = path.split("/");
  if (!path.startsWith(prefix) || path.includes("\0") || segments.includes("..")) {
    throw stableError("workspace_deletion_storage_scope_violation");
  }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

type StorageClient = ReturnType<typeof createClient>;

type Discovery = {
  files: string[];
  foldersVisited: number;
  entriesSeen: number;
};

async function discoverManagedObjects(
  client: StorageClient,
  workspaceId: string,
): Promise<Discovery> {
  const root = managedPrefix(workspaceId);
  const pending: Array<{ path: string; depth: number }> = [{ path: root, depth: 0 }];
  const visited = new Set<string>();
  const files: string[] = [];
  let entriesSeen = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current.path)) continue;
    visited.add(current.path);
    if (current.depth > MAX_FOLDER_DEPTH) {
      throw stableError("workspace_deletion_storage_depth_limit");
    }

    let offset = 0;
    while (true) {
      const { data, error } = await client.storage.from(BUCKET).list(current.path, {
        limit: LIST_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error || !Array.isArray(data)) {
        throw stableError("workspace_deletion_storage_list_failed");
      }

      for (const entry of data) {
        if (!entry || typeof entry.name !== "string" || entry.name.length === 0) {
          throw stableError("workspace_deletion_storage_entry_invalid");
        }
        const fullPath = `${current.path}/${entry.name}`;
        assertManagedPath(fullPath, workspaceId);
        entriesSeen += 1;
        if (entriesSeen > MAX_DISCOVERED_ENTRIES) {
          throw stableError("workspace_deletion_storage_entry_limit");
        }

        if (entry.id === null) {
          pending.push({ path: fullPath, depth: current.depth + 1 });
        } else {
          files.push(fullPath);
        }
      }

      if (data.length < LIST_PAGE_SIZE) break;
      offset += data.length;
    }
  }

  return { files, foldersVisited: visited.size, entriesSeen };
}

export async function cleanupWorkspaceStorage(workspaceId: string): Promise<{
  removed: number;
  foldersVisited: number;
  entriesSeen: number;
}> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw stableError("workspace_deletion_storage_configuration_missing");
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const discovery = await discoverManagedObjects(client, workspaceId);

  for (const batch of chunks(discovery.files, REMOVE_BATCH_SIZE)) {
    const { error } = await client.storage.from(BUCKET).remove(batch);
    if (error) throw stableError("workspace_deletion_storage_remove_failed");
  }

  const residue = await discoverManagedObjects(client, workspaceId);
  if (residue.files.length !== 0 || residue.entriesSeen !== 0) {
    throw stableError("workspace_deletion_storage_residue");
  }

  return {
    removed: discovery.files.length,
    foldersVisited: discovery.foldersVisited,
    entriesSeen: discovery.entriesSeen,
  };
}
