// Accepts 0681234567 / 681234567 / 380681234567 / +380 68 123 45 67.
// Numbers without a country code are taken as Ukrainian, the owner's country.
export function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+') || digits.startsWith('380')) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `+38${digits}`;
  if (digits.length === 9) return `+380${digits}`;
  return `+${digits}`;
}
