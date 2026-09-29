export function resolveStorageServerCredential({ secretKey = "", serviceRoleKey = "" } = {}) {
  if (typeof secretKey === "string" && secretKey.length > 0) {
    return {
      kind: "secret",
      headers: { apikey: secretKey },
    };
  }

  if (typeof serviceRoleKey === "string" && serviceRoleKey.length > 0) {
    return {
      kind: "service_role",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    };
  }

  return null;
}

export function expectedStorageObjectSize(metadata) {
  const rawSize = metadata?.size;
  if (rawSize === null || rawSize === undefined) return null;

  const size = Number(rawSize);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error("Storage object metadata contains an invalid size.");
  }
  return size;
}
