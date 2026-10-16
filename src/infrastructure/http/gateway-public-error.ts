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
