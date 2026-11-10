/** Preview reads the shared financial database through a restricted gateway.
 * It must not advertise a production-only bank source write action. */
export function isBankSourceWriteDisabled(vercelEnv: string | undefined) {
  return vercelEnv === "preview";
}
