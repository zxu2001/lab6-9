// Deterministic split allocation (Business Rules BR-SPL-02 / BR-SPL-03).
// Every function guarantees Σ shares === amountCents.

export interface Participant {
  userId: string;
  /** Stable ordering key (lower = earlier tie-break). */
  seq: number;
}

export interface Allocation {
  userId: string;
  shareCents: number;
  percentBasisPts?: number;
}

/** Equal split: floor(A/n) each; the r = A mod n lowest-seq participants get +1¢. */
export function allocateEqual(amountCents: number, participants: Participant[]): Allocation[] {
  if (participants.length === 0) throw new Error("At least one participant is required");
  const sorted = [...participants].sort((a, b) => a.seq - b.seq);
  const n = sorted.length;
  const base = Math.floor(amountCents / n);
  const remainder = amountCents % n;
  return sorted.map((p, i) => ({ userId: p.userId, shareCents: base + (i < remainder ? 1 : 0) }));
}

/**
 * Percentage split in basis points (Σ = 10 000). Each share is floored; the
 * leftover cents go to the largest fractional remainders, ties by lowest seq.
 */
export function allocatePercentage(
  amountCents: number,
  participants: (Participant & { basisPts: number })[],
): Allocation[] {
  if (participants.length === 0) throw new Error("At least one participant is required");
  const total = participants.reduce((s, p) => s + p.basisPts, 0);
  if (total !== 10_000) throw new Error("Percentages must total exactly 100%");

  const rows = participants.map((p) => {
    const raw = amountCents * p.basisPts;
    return { ...p, floor: Math.floor(raw / 10_000), frac: raw % 10_000 };
  });
  let leftover = amountCents - rows.reduce((s, r) => s + r.floor, 0);
  const order = [...rows].sort((a, b) => b.frac - a.frac || a.seq - b.seq);
  const bonus = new Set<string>();
  for (const r of order) {
    if (leftover <= 0) break;
    bonus.add(r.userId);
    leftover--;
  }
  return [...rows]
    .sort((a, b) => a.seq - b.seq)
    .map((r) => ({
      userId: r.userId,
      shareCents: r.floor + (bonus.has(r.userId) ? 1 : 0),
      percentBasisPts: r.basisPts,
    }));
}
