export function normalizePhone(input: string): string {
  return (input || "").replace(/\D/g, "");
}

export function maskPhone(digitsOnlyPhone: string): string {
  const d = (digitsOnlyPhone || "").replace(/\D/g, "");
  const last4 = d.length >= 4 ? d.slice(-4) : d;
  return `***${last4}`;
}

