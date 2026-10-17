// Financial gateway errors can contain raw SQL text, values or infrastructure
// details. Only stable, machine-readable domain codes may cross to the client.
// Never log or serialize an arbitrary thrown Error.message.
const PUBLIC_DOMAIN_ERROR_CODE =
  /^(?:invalid|duplicate|missing|unsupported|account|category|merchant|rule|transaction|financial|budget|forecast|recurrence|document|source|sync|google|workspace|gateway|export|deletion|transfer|tax|user|permission|test|storage|audit|ocr)(?:_[a-z]+){1,9}$/;

export function publicGatewayErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "gateway_error";
  const message = error.message;
  return message.length <= 80 && PUBLIC_DOMAIN_ERROR_CODE.test(message)
    ? message
    : "gateway_error";
}


/**
 * Never return the message of a third-party exception just because its
 * *name* matches a known failure. The response code must itself be an exact
 * member of the route's public allowlist.
 */
export function knownPublicErrorCode(
  error: unknown,
  statuses: Readonly<Record<string, number>>,
): string | null {
  if (!(error instanceof Error)) return null;
  if (Object.prototype.hasOwnProperty.call(statuses, error.message)) return error.message;
  if (Object.prototype.hasOwnProperty.call(statuses, error.name)) return error.name;
  return null;
}

/** The remote Edge response is untrusted, even if its JSON has an `error` field. */
export function publicRemoteGatewayCode(rawCode: unknown): string | null {
  if (typeof rawCode !== "string" || rawCode.length === 0) return null;
  return publicGatewayErrorCode(new Error(rawCode));
}
