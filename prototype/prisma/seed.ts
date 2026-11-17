// Idempotent demo seed for the SplitSmart prototype.
//
//   npm run db:seed        (or: npx prisma db seed)
//
// Every record has a fixed id and is written with `upsert(..., update: {})`,
// so running this repeatedly never duplicates, overwrites, or deletes data —
// it only fills in demo rows that are missing. Changes made in the app
// (approvals, new expenses, payments) are preserved.

import "dotenv/config";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { allocateEqual, allocatePercentage } from "../src/lib/split";

const raw = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").replace(/^file:/, "");
const url = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

const USERS = [
  { id: "user-alice", seq: 1, name: "Alice Chen", email: "alice@demo.splitsmart.test", avatarColor: "#6366f1" },
  { id: "user-bob", seq: 2, name: "Bob Martinez", email: "bob@demo.splitsmart.test", avatarColor: "#0ea5e9" },
  { id: "user-carol", seq: 3, name: "Carol Okafor", email: "carol@demo.splitsmart.test", avatarColor: "#f59e0b" },
  { id: "user-dan", seq: 4, name: "Dan Kowalski", email: "dan@demo.splitsmart.test", avatarColor: "#10b981" },
  { id: "user-erin", seq: 5, name: "Erin Walsh", email: "erin@demo.splitsmart.test", avatarColor: "#ec4899" },
] as const;
type UserKey = "alice" | "bob" | "carol" | "dan" | "erin";
const U = (k: UserKey) => `user-${k}`;
const seqOf = (id: string) => USERS.find((u) => u.id === id)!.seq;

const GROUPS = [
  {
    id: "group-apartment",
    name: "Maple Street Apartment",
    emoji: "🏠",
    description: "Rent, utilities, and groceries for unit 4B.",
    owner: "alice",
    members: ["alice", "bob", "carol"],
  },
  {
    id: "group-lisbon",
    name: "Lisbon Trip 2026",
    emoji: "✈️",
    description: "Five days of pastéis de nata and tram rides.",
    owner: "dan",
    members: ["alice", "bob", "dan", "erin"],
  },
  {
    id: "group-lunch",
    name: "Office Lunch Club",
    emoji: "🥗",
    description: "Team lunches and the office coffee fund.",
    owner: "carol",
    members: ["alice", "carol", "dan"],
  },
] as const;

type SeedExpense = {
  id: string;
  groupId: string;
  description: string;
  category: string;
  amountCents: number;
  date: number; // days ago
  payer: UserKey;
  createdBy: UserKey;
  split: { method: "EQUAL"; with: UserKey[] } | { method: "PERCENTAGE"; with: [UserKey, number][] };
  // Decisions by approver. Missing approvers stay PENDING.
  decisions?: Partial<Record<UserKey, "APPROVED" | { rejected: string }>>;
};

const EXPENSES: SeedExpense[] = [
  // Maple Street Apartment
  { id: "exp-rent", groupId: "group-apartment", description: "Monthly rent", category: "Rent & Utilities", amountCents: 240000, date: 24, payer: "alice", createdBy: "alice", split: { method: "EQUAL", with: ["alice", "bob", "carol"] }, decisions: { bob: "APPROVED", carol: "APPROVED" } },
  { id: "exp-internet", groupId: "group-apartment", description: "Internet bill", category: "Rent & Utilities", amountCents: 7500, date: 18, payer: "bob", createdBy: "bob", split: { method: "EQUAL", with: ["alice", "bob", "carol"] }, decisions: { alice: "APPROVED", carol: "APPROVED" } },
  { id: "exp-costco", groupId: "group-apartment", description: "Costco run", category: "Groceries", amountCents: 18642, date: 12, payer: "carol", createdBy: "carol", split: { method: "PERCENTAGE", with: [["alice", 40], ["bob", 30], ["carol", 30]] }, decisions: { alice: "APPROVED", bob: "APPROVED" } },
  { id: "exp-cleaning", groupId: "group-apartment", description: "Cleaning supplies", category: "Household", amountCents: 3217, date: 2, payer: "bob", createdBy: "bob", split: { method: "EQUAL", with: ["alice", "bob", "carol"] }, decisions: { carol: "APPROVED" } },
  // Lisbon Trip 2026
  { id: "exp-airbnb", groupId: "group-lisbon", description: "Airbnb in Alfama", category: "Travel", amountCents: 128000, date: 40, payer: "dan", createdBy: "dan", split: { method: "EQUAL", with: ["alice", "bob", "dan", "erin"] }, decisions: { alice: "APPROVED", bob: "APPROVED", erin: "APPROVED" } },
  { id: "exp-seafood", groupId: "group-lisbon", description: "Seafood dinner at Ramiro", category: "Dining", amountCents: 21480, date: 33, payer: "erin", createdBy: "erin", split: { method: "EQUAL", with: ["alice", "bob", "dan", "erin"] }, decisions: { alice: "APPROVED", bob: "APPROVED", dan: "APPROVED" } },
  { id: "exp-tram", groupId: "group-lisbon", description: "Tram & metro passes", category: "Transport", amountCents: 9600, date: 5, payer: "alice", createdBy: "alice", split: { method: "EQUAL", with: ["alice", "bob", "dan", "erin"] }, decisions: { dan: "APPROVED" } },
  { id: "exp-fado", groupId: "group-lisbon", description: "Fado show tickets", category: "Entertainment", amountCents: 15000, date: 3, payer: "bob", createdBy: "bob", split: { method: "PERCENTAGE", with: [["alice", 33.33], ["bob", 33.33], ["erin", 33.34]] }, decisions: { erin: "APPROVED" } },
  { id: "exp-souvenir", groupId: "group-lisbon", description: "Souvenir shopping", category: "General", amountCents: 6000, date: 30, payer: "erin", createdBy: "erin", split: { method: "EQUAL", with: ["alice", "erin"] }, decisions: { alice: { rejected: "I didn't buy anything at that shop." } } },
  // Office Lunch Club
  { id: "exp-pizza", groupId: "group-lunch", description: "Friday pizza", category: "Dining", amountCents: 5460, date: 15, payer: "carol", createdBy: "carol", split: { method: "EQUAL", with: ["alice", "carol", "dan"] }, decisions: { alice: "APPROVED", dan: "APPROVED" } },
  { id: "exp-coffee", groupId: "group-lunch", description: "Coffee beans (2 kg)", category: "Groceries", amountCents: 2800, date: 8, payer: "dan", createdBy: "dan", split: { method: "EQUAL", with: ["alice", "carol", "dan"] }, decisions: { alice: "APPROVED", carol: "APPROVED" } },
];

const PAYMENTS = [
  { id: "pay-bob-alice-rent", groupId: "group-apartment", from: "bob", to: "alice", amountCents: 50000, date: 10, note: "Part of rent via bank transfer" },
  { id: "pay-alice-carol-pizza", groupId: "group-lunch", from: "alice", to: "carol", amountCents: 1820, date: 14, note: "Pizza — cash" },
] as const;

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({ where: { id: u.id }, update: {}, create: u });
  }

  for (const g of GROUPS) {
    await prisma.group.upsert({
      where: { id: g.id },
      update: {},
      create: {
        id: g.id,
        name: g.name,
        emoji: g.emoji,
        description: g.description,
        createdAt: daysAgo(60),
      },
    });
    for (const m of g.members) {
      await prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: g.id, userId: U(m) } },
        update: {},
        create: { groupId: g.id, userId: U(m), role: m === g.owner ? "OWNER" : "MEMBER", joinedAt: daysAgo(60) },
      });
    }
  }

  for (const e of EXPENSES) {
    if (await prisma.expense.findUnique({ where: { id: e.id }, select: { id: true } })) continue;

    const shares =
      e.split.method === "EQUAL"
        ? allocateEqual(e.amountCents, e.split.with.map((k) => ({ userId: U(k), seq: seqOf(U(k)) })))
        : allocatePercentage(
            e.amountCents,
            e.split.with.map(([k, pct]) => ({ userId: U(k), seq: seqOf(U(k)), basisPts: Math.round(pct * 100) })),
          );

    const participantKeys = e.split.method === "EQUAL" ? e.split.with : e.split.with.map(([k]) => k);
    const approverKeys = [...new Set([...participantKeys, e.payer])].filter((k) => k !== e.createdBy);
    const decisionOf = (k: UserKey) => e.decisions?.[k];
    const rejected = approverKeys.find((k) => typeof decisionOf(k) === "object");
    const allApproved = approverKeys.every((k) => decisionOf(k) === "APPROVED");
    const status = rejected ? "REJECTED" : allApproved ? "APPROVED" : "PENDING";
    const created = daysAgo(e.date);
    const decided = new Date(created.getTime() + 6 * 3600_000);
    const creatorName = USERS.find((u) => u.id === U(e.createdBy))!.name;
    const groupName = GROUPS.find((g) => g.id === e.groupId)!.name;

    await prisma.expense.create({
      data: {
        id: e.id,
        groupId: e.groupId,
        description: e.description,
        category: e.category,
        amountCents: e.amountCents,
        expenseDate: created,
        splitMethod: e.split.method,
        payerId: U(e.payer),
        createdById: U(e.createdBy),
        status,
        rejectionReason: rejected ? (decisionOf(rejected) as { rejected: string }).rejected : null,
        decidedAt: status === "PENDING" ? null : decided,
        createdAt: created,
        shares: { create: shares },
        approvals: {
          create: approverKeys.map((k) => {
            const d = decisionOf(k);
            return {
              approverId: U(k),
              decision: d === "APPROVED" ? "APPROVED" : d ? "REJECTED" : "PENDING",
              reason: typeof d === "object" ? d.rejected : null,
              decidedAt: d ? decided : null,
              createdAt: created,
            } as const;
          }),
        },
        notifications: {
          create: approverKeys.map((k) => ({
            userId: U(k),
            read: decisionOf(k) !== undefined || status !== "PENDING",
            createdAt: created,
            message: `${creatorName} added “${e.description}” ($${(e.amountCents / 100).toFixed(2)}) in ${groupName}. Your approval is needed.`,
          })),
        },
      },
    });
  }

  for (const p of PAYMENTS) {
    await prisma.payment.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        groupId: p.groupId,
        fromUserId: U(p.from),
        toUserId: U(p.to),
        amountCents: p.amountCents,
        paidAt: daysAgo(p.date),
        note: p.note,
        createdAt: daysAgo(p.date),
      },
    });
  }

  const counts = await Promise.all([
    prisma.user.count(),
    prisma.group.count(),
    prisma.expense.count(),
    prisma.payment.count(),
  ]);
  console.log(`✔ Demo data ready — users: ${counts[0]}, groups: ${counts[1]}, expenses: ${counts[2]}, payments: ${counts[3]}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
