const DEFAULT_INITIAL_USER = "massmedi@gmail.com";

function allowedEmails(): Set<string> {
  const configured = process.env.FINANCIAL_APP_ALLOWED_EMAILS ?? DEFAULT_INITIAL_USER;
  return new Set(
    configured
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().has(email.toLowerCase());
}
