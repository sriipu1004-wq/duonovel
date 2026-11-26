function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseOperatorEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[\n,]/)
    .map((item) => normalizeEmail(item))
    .filter((item, index, array) => item.length > 0 && array.indexOf(item) === index);
}

export function getOperatorEmails(): string[] {
  // Server-only setting. A NEXT_PUBLIC_ name is intentionally not read: such
  // names can be inlined into the browser bundle.
  return parseOperatorEmails(process.env.LIBREAD_OPERATOR_EMAILS);
}

export function isOperatorUser(email: string | null | undefined): boolean {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const operatorEmails = getOperatorEmails();
  if (operatorEmails.length === 0) {
    return false;
  }

  return operatorEmails.includes(normalizedEmail);
}