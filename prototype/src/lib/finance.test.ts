import { describe, expect, it } from "vitest";
import { allocateEqual, allocatePercentage } from "./split";
import { computeNetBalances, settlementPlan } from "./balances";
import { parseDollarsToCents, parsePercentToBasisPoints } from "./money";

const sum = (xs: { shareCents: number }[]) => xs.reduce((s, x) => s + x.shareCents, 0);
const P = [
  { userId: "c", seq: 12 },
  { userId: "a", seq: 7 },
  { userId: "b", seq: 9 },
];

describe("money parsing (integer cents, no floats)", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["0.10", 10],
    ["1,234.56", 123456],
    ["$7.01", 701],
  ])("parses %s", (input, cents) => expect(parseDollarsToCents(input)).toBe(cents));

  it.each(["", "abc", "1.234", "-5", "1e3"])("rejects %s", (input) => expect(parseDollarsToCents(input)).toBeNull());

  it("parses percentages to basis points", () => {
    expect(parsePercentToBasisPoints("33.33")).toBe(3333);
    expect(parsePercentToBasisPoints("100")).toBe(10000);
    expect(parsePercentToBasisPoints("1.234")).toBeNull();
  });
});

describe("equal split (BR-SPL-02)", () => {
  it("gives leftover cents to the lowest ids: $100.00 / 3", () => {
    expect(allocateEqual(10000, P)).toEqual([
      { userId: "a", shareCents: 3334 },
      { userId: "b", shareCents: 3333 },
      { userId: "c", shareCents: 3333 },
    ]);
  });

  it("allows zero shares: $0.02 / 3", () => {
    expect(allocateEqual(2, P).map((s) => s.shareCents)).toEqual([1, 1, 0]);
  });

  it("always sums to the amount and ignores input order", () => {
    for (let amount = 1; amount < 2000; amount += 37) {
      const a = allocateEqual(amount, P);
      expect(sum(a)).toBe(amount);
      expect(allocateEqual(amount, [...P].reverse())).toEqual(a);
    }
  });
});

describe("percentage split (BR-SPL-03)", () => {
  it("rejects totals other than 100%", () => {
    expect(() => allocatePercentage(1000, P.map((p) => ({ ...p, basisPts: 3333 })))).toThrow();
  });

  it("assigns leftover cents to the largest fractional remainders", () => {
    const shares = allocatePercentage(18642, [
      { userId: "a", seq: 1, basisPts: 4000 },
      { userId: "b", seq: 2, basisPts: 3000 },
      { userId: "c", seq: 3, basisPts: 3000 },
    ]);
    expect(shares.map((s) => s.shareCents)).toEqual([7457, 5593, 5592]);
    expect(sum(shares)).toBe(18642);
  });
});

describe("balances and settlement plan", () => {
  it("excludes the payer from the split and nets to zero", () => {
    const net = computeNetBalances(
      ["alice", "bob", "carol"],
      [{ payerId: "alice", amountCents: 9000, shares: [{ userId: "bob", shareCents: 4500 }, { userId: "carol", shareCents: 4500 }] }],
      [],
    );
    expect(Object.fromEntries(net)).toEqual({ alice: 9000, bob: -4500, carol: -4500 });
    expect([...net.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("produces a plan that settles everyone", () => {
    const net = new Map([
      ["a", 5000],
      ["b", -3000],
      ["c", -1500],
      ["d", -500],
    ]);
    const order = (id: string) => id.charCodeAt(0);
    const plan = settlementPlan(net, order);
    expect(plan.length).toBeLessThanOrEqual(3);
    const after = computeNetBalances([...net.keys()], [], plan);
    for (const [id, v] of after) expect(v + net.get(id)!).toBe(0);
  });
});
