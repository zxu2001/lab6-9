// Derived per-group balances and a deterministic simplified settlement plan.
// Balances are never stored: they are recomputed from APPROVED expenses and
// recorded payments every time (BR-BAL / BR-SET).
//
// Sign convention: net > 0 → the group owes this member; net < 0 → they owe.

export interface LedgerExpense {
  payerId: string;
  amountCents: number;
  shares: { userId: string; shareCents: number }[];
}

export interface LedgerPayment {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

export function computeNetBalances(
  memberIds: string[],
  approvedExpenses: LedgerExpense[],
  payments: LedgerPayment[],
): Map<string, number> {
  const net = new Map<string, number>(memberIds.map((id) => [id, 0]));
  const add = (id: string, cents: number) => net.set(id, (net.get(id) ?? 0) + cents);

  for (const e of approvedExpenses) {
    add(e.payerId, e.amountCents);
    for (const s of e.shares) add(s.userId, -s.shareCents);
  }
  for (const p of payments) {
    add(p.fromUserId, p.amountCents);
    add(p.toUserId, -p.amountCents);
  }
  return net;
}

/**
 * Greedy plan: repeatedly match the largest debtor with the largest creditor
 * (ties broken by the supplied stable order). At most k − 1 transfers.
 */
export function settlementPlan(net: Map<string, number>, order: (id: string) => number): Transfer[] {
  const byAmount = (a: [string, number], b: [string, number]) =>
    Math.abs(b[1]) - Math.abs(a[1]) || order(a[0]) - order(b[0]);
  const debtors = [...net].filter(([, v]) => v < 0).map(([k, v]): [string, number] => [k, v]);
  const creditors = [...net].filter(([, v]) => v > 0).map(([k, v]): [string, number] => [k, v]);
  const transfers: Transfer[] = [];

  while (debtors.length && creditors.length) {
    debtors.sort(byAmount);
    creditors.sort(byAmount);
    const d = debtors[0];
    const c = creditors[0];
    const amount = Math.min(-d[1], c[1]);
    transfers.push({ fromUserId: d[0], toUserId: c[0], amountCents: amount });
    d[1] += amount;
    c[1] -= amount;
    if (d[1] === 0) debtors.shift();
    if (c[1] === 0) creditors.shift();
  }
  return transfers;
}
