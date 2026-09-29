export function pseudonymizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '[PHONE_REDACTED]';
  // Keep country code (2-3 digits) and last 4 digits
  const countryCode = digits.slice(0, digits.length > 10 ? 2 : 3);
  const last4 = digits.slice(-4);
  const visible = countryCode.length + 4;
  const masked = 'X'.repeat(Math.max(0, digits.length - visible));
  return `+${countryCode}${masked}${last4}`;
}

export function pseudonymizeName(name: string): string {
  if (!name || name.length <= 2) return '[NAME_REDACTED]';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0][0] + '*'.repeat(parts[0].length - 1);
  }
  return parts.map(p => p[0] + '*'.repeat(Math.max(0, p.length - 1))).join(' ');
}

export function pseudonymizeEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '[EMAIL_REDACTED]';
  const maskedLocal = local[0] + '*'.repeat(Math.max(0, local.length - 1));
  return `${maskedLocal}@${domain}`;
}

const PHONE_FIELDS = [
  'phone', 'from', 'to', 'chatId', 'remoteJid', 'senderPhone',
  'recipientPhone', 'notifyPhone',
];

const NAME_FIELDS = [
  'name', 'notifyName', 'pushName', 'contactName',
  'senderName', 'recipientName',
];

const EMAIL_FIELDS = ['email', 'senderEmail', 'recipientEmail'];

const NESTED_FIELDS = ['_data', 'payload', 'data'];

function applyFields(
  obj: Record<string, unknown>,
  fields: string[],
  mask: (value: string) => string
): void {
  for (const field of fields) {
    if (obj[field] && typeof obj[field] === 'string') {
      obj[field] = mask(obj[field]);
    }
  }
}

export function pseudonymizeWahaPayload(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return payload;
  const obj = { ...payload } as Record<string, unknown>;

  // Pseudonymize phone fields
  applyFields(obj, PHONE_FIELDS, pseudonymizePhone);

  // Pseudonymize name fields
  applyFields(obj, NAME_FIELDS, pseudonymizeName);

  // Pseudonymize email fields
  applyFields(obj, EMAIL_FIELDS, pseudonymizeEmail);

  // Recurse into nested objects
  for (const field of NESTED_FIELDS) {
    if (obj[field] && typeof obj[field] === 'object') {
      obj[field] = pseudonymizeWahaPayload(obj[field]);
    }
  }

  return obj;
}