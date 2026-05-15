export function normalizePhone(input: string): string {
  return (input || "").replace(/\D/g, "");
}

export function maskPhone(digitsOnlyPhone: string): string {
  const d = (digitsOnlyPhone || "").replace(/\D/g, "");
  const last4 = d.length >= 4 ? d.slice(-4) : d;
  return `***${last4}`;
}

/** Formats entered digits for display (US 10- or 11-digit with leading 1). */
export function formatPhoneDisplay(input: string): string {
  const d = normalizePhone(input);
  const core = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (core.length === 10) {
    return `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6)}`;
  }
  if (d.length > 0 && d.length < 10) {
    return d;
  }
  return d || "—";
}

