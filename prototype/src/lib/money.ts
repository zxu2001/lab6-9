// Money helpers. All amounts are integer cents; parsing never goes through
// floating point so "0.1 + 0.2" style rounding errors cannot occur.

export const MAX_AMOUNT_CENTS = 100_000_000; // $1,000,000.00

/** Parse a user-entered dollar string (e.g. "12", "12.5", "1,234.56") into cents. */
export function parseDollarsToCents(input: string): number | null {
  const s = input.trim().replace(/[$,\s]/g, "");
  const m = /^(\d{1,9})(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  return whole * 100 + frac;
}

/** Parse a percentage string with ≤ 2 decimals ("33.33") into basis points (3333). */
export function parsePercentToBasisPoints(input: string): number | null {
  const s = input.trim().replace(/%$/, "");
  const m = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** Format with an explicit sign, e.g. "+$12.00" / "−$4.50". */
export function formatSignedCents(cents: number): string {
  if (cents === 0) return formatCents(0);
  return `${cents > 0 ? "+" : "−"}${formatCents(Math.abs(cents))}`;
}

export function formatBasisPoints(bp: number): string {
  return `${(bp / 100).toFixed(2).replace(/\.00$/, "")}%`;
}
