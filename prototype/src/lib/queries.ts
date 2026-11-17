import "server-only";
import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import { computeNetBalances, settlementPlan, type Transfer } from "./balances";

export type MemberLite = { id: string; name: string; seq: number; avatarColor: string };

/** Throws-free membership check: returns the group only if the user belongs to it. */
export async function getGroupForMember(groupId: string, userId: string) {
  return prisma.group.findFirst({
    where: { id: groupId, members: { some: { userId } } },
    include: {
      members: {
        include: { user: true },
        orderBy: { user: { seq: "asc" } },
      },
    },
  });
}

/** Derived balances + plan for one group (recomputed from the ledger). */
export async function getGroupLedger(groupId: string, db: Prisma.TransactionClient = prisma) {
  const [members, expenses, payments] = await Promise.all([
    db.groupMember.findMany({ where: { groupId }, include: { user: true } }),
    db.expense.findMany({
      where: { groupId, status: "APPROVED" },
      select: { payerId: true, amountCents: true, shares: { select: { userId: true, shareCents: true } } },
    }),
    db.payment.findMany({
      where: { groupId },
      select: { fromUserId: true, toUserId: true, amountCents: true },
    }),
  ]);
  const users = new Map<string, MemberLite>(members.map((m) => [m.userId, m.user]));
  const net = computeNetBalances([...users.keys()], expenses, payments);
  const plan = settlementPlan(net, (id) => users.get(id)?.seq ?? 0);
  return { users, net, plan };
}

export interface GroupSummary {
  id: string;
  name: string;
  emoji: string;
  description: string;
  memberCount: number;
  myNetCents: number;
  pendingCount: number;
  approvedTotalCents: number;
  myTransfers: Transfer[];
}

export async function getGroupSummaries(userId: string): Promise<GroupSummary[]> {
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId } } },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    groups.map(async (g) => {
      const [{ net, plan }, pendingCount, approved] = await Promise.all([
        getGroupLedger(g.id),
        prisma.expense.count({ where: { groupId: g.id, status: "PENDING" } }),
        prisma.expense.aggregate({ where: { groupId: g.id, status: "APPROVED" }, _sum: { amountCents: true } }),
      ]);
      return {
        id: g.id,
        name: g.name,
        emoji: g.emoji,
        description: g.description,
        memberCount: g._count.members,
        myNetCents: net.get(userId) ?? 0,
        pendingCount,
        approvedTotalCents: approved._sum.amountCents ?? 0,
        myTransfers: plan.filter((t) => t.fromUserId === userId || t.toUserId === userId),
      };
    }),
  );
}

/** Approvals waiting on this user (only for expenses still pending). */
export async function getPendingApprovalsFor(userId: string) {
  return prisma.expenseApproval.findMany({
    where: { approverId: userId, decision: "PENDING", expense: { status: "PENDING" } },
    include: {
      expense: {
        include: {
          group: true,
          payer: true,
          createdBy: true,
          shares: { include: { user: true }, orderBy: { user: { seq: "asc" } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export type ActivityItem =
  | {
      kind: "expense";
      id: string;
      date: Date;
      createdAt: Date;
      title: string;
      groupName: string;
      groupId: string;
      amountCents: number;
      status: "PENDING" | "APPROVED" | "REJECTED";
      actorName: string;
    }
  | {
      kind: "payment";
      id: string;
      date: Date;
      createdAt: Date;
      title: string;
      groupName: string;
      groupId: string;
      amountCents: number;
      actorName: string;
    };

export async function getRecentActivity(userId: string, take = 8): Promise<ActivityItem[]> {
  const inMyGroups = { group: { members: { some: { userId } } } };
  const [expenses, payments] = await Promise.all([
    prisma.expense.findMany({
      where: inMyGroups,
      include: { group: true, payer: true },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.payment.findMany({
      where: inMyGroups,
      include: { group: true, from: true, to: true },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);
  const items: ActivityItem[] = [
    ...expenses.map((e) => ({
      kind: "expense" as const,
      id: e.id,
      date: e.expenseDate,
      createdAt: e.createdAt,
      title: e.description,
      groupName: e.group.name,
      groupId: e.groupId,
      amountCents: e.amountCents,
      status: e.status,
      actorName: e.payer.name,
    })),
    ...payments.map((p) => ({
      kind: "payment" as const,
      id: p.id,
      date: p.paidAt,
      createdAt: p.createdAt,
      title: `${p.from.name} paid ${p.to.name}`,
      groupName: p.group.name,
      groupId: p.groupId,
      amountCents: p.amountCents,
      actorName: p.from.name,
    })),
  ];
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take);
}

export async function getUnreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}
