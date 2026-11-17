"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DEMO_USER_COOKIE, requireCurrentUser } from "@/lib/demo-auth";
import { getGroupLedger } from "@/lib/queries";
import { allocateEqual, allocatePercentage, type Allocation } from "@/lib/split";
import { MAX_AMOUNT_CENTS, formatCents, parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/money";
import { CATEGORIES, type ActionState } from "@/lib/constants";

// All mutations re-validate on the server and run inside one transaction.
// The client UI is never trusted for amounts, membership, or permissions.

function parseDateInput(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Store as UTC noon so the calendar day is stable across time zones.
  const d = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeReturnPath(value: FormDataEntryValue | null): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

// ─── Demo user switcher (PROTOTYPE ONLY) ────────────────────────────────────

export async function switchDemoUser(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    (await cookies()).set(DEMO_USER_COOKIE, user.id, { path: "/", sameSite: "lax", httpOnly: true });
  }
  revalidatePath("/", "layout");
  redirect(safeReturnPath(formData.get("returnTo")));
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export async function createExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentUser();
  const groupId = String(formData.get("groupId") ?? "");
  const group = await prisma.group.findFirst({
    where: { id: groupId, members: { some: { userId: me.id } } },
    include: { members: { include: { user: true } } },
  });
  if (!group) return { status: "error", message: "Group not found or you are not a member." };

  const memberById = new Map(group.members.map((m) => [m.userId, m.user]));
  const errors: Record<string, string> = {};

  const description = String(formData.get("description") ?? "").trim();
  if (!description) errors.description = "Enter a description.";
  else if (description.length > 120) errors.description = "Keep the description under 120 characters.";

  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  if (amountCents === null) errors.amount = "Enter an amount like 42.50 (at most 2 decimals).";
  else if (amountCents < 1) errors.amount = "Amount must be at least $0.01.";
  else if (amountCents > MAX_AMOUNT_CENTS) errors.amount = "Amount cannot exceed $1,000,000.00.";

  const expenseDate = parseDateInput(formData.get("date"));
  if (!expenseDate) errors.date = "Choose a valid date.";

  const category = String(formData.get("category") ?? "General");
  if (!(CATEGORIES as readonly string[]).includes(category)) errors.category = "Choose a category.";

  const payerId = String(formData.get("payerId") ?? "");
  if (!memberById.has(payerId)) errors.payerId = "The payer must be a member of this group.";

  const splitMethod = formData.get("splitMethod") === "PERCENTAGE" ? "PERCENTAGE" : "EQUAL";
  const participantIds = [...new Set(formData.getAll("participants").map(String))];
  if (participantIds.length === 0) errors.participants = "Select at least one participant.";
  else if (participantIds.some((id) => !memberById.has(id)))
    errors.participants = "Participants must be members of this group.";

  let allocations: Allocation[] = [];
  if (!errors.participants && amountCents !== null && !errors.amount) {
    const participants = participantIds.map((id) => ({ userId: id, seq: memberById.get(id)!.seq }));
    if (splitMethod === "EQUAL") {
      allocations = allocateEqual(amountCents, participants);
    } else {
      const withPct = participants.map((p) => ({
        ...p,
        basisPts: parsePercentToBasisPoints(String(formData.get(`percent_${p.userId}`) ?? "")),
      }));
      const bad = withPct.find((p) => p.basisPts === null || p.basisPts <= 0 || p.basisPts > 10_000);
      if (bad) {
        errors.percentages = `Enter a percentage between 0.01 and 100 for ${memberById.get(bad.userId)!.name}.`;
      } else {
        const total = withPct.reduce((s, p) => s + (p.basisPts ?? 0), 0);
        if (total !== 10_000) {
          errors.percentages = `Percentages must total exactly 100% (currently ${(total / 100).toFixed(2)}%).`;
        } else {
          allocations = allocatePercentage(amountCents, withPct as (typeof withPct[number] & { basisPts: number })[]);
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: errors };
  }

  // Required approvers = (participants ∪ payer) − creator (FR-012).
  const approverIds = [...new Set([...participantIds, payerId])].filter((id) => id !== me.id);
  const autoApproved = approverIds.length === 0;

  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: {
        groupId,
        description,
        category,
        amountCents: amountCents!,
        expenseDate: expenseDate!,
        splitMethod,
        payerId,
        createdById: me.id,
        status: autoApproved ? "APPROVED" : "PENDING",
        decidedAt: autoApproved ? new Date() : null,
        shares: { create: allocations },
        approvals: { create: approverIds.map((approverId) => ({ approverId })) },
      },
    });
    if (!autoApproved) {
      await tx.notification.createMany({
        data: approverIds.map((userId) => ({
          userId,
          expenseId: created.id,
          message: `${me.name} added “${description}” (${formatCents(amountCents!)}) in ${group.name}. Your approval is needed.`,
        })),
      });
    }
    return created;
  });

  revalidatePath("/", "layout");
  redirect(`/expenses/${expense.id}?notice=${autoApproved ? "expense-auto-approved" : "expense-created"}`);
}

export async function decideExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentUser();
  const expenseId = String(formData.get("expenseId") ?? "");
  const decision = formData.get("decision") === "REJECTED" ? "REJECTED" : "APPROVED";
  const reason = String(formData.get("reason") ?? "").trim();
  const returnTo = safeReturnPath(formData.get("returnTo"));

  if (decision === "REJECTED" && !reason) {
    return { status: "error", message: "A reason is required to reject.", fieldErrors: { reason: "A reason is required to reject this expense." } };
  }
  if (reason.length > 300) {
    return { status: "error", message: "Reason is too long.", fieldErrors: { reason: "Max 300 characters." } };
  }

  const result = await prisma.$transaction(async (tx) => {
    const approval = await tx.expenseApproval.findUnique({
      where: { expenseId_approverId: { expenseId, approverId: me.id } },
      include: { expense: true },
    });
    if (!approval) return "You are not a required approver for this expense.";
    if (approval.expense.status !== "PENDING") return "This expense has already been decided.";
    if (approval.decision !== "PENDING") return "You have already recorded a decision.";

    const now = new Date();
    await tx.expenseApproval.update({
      where: { id: approval.id },
      data: { decision, reason: reason || null, decidedAt: now },
    });

    if (decision === "REJECTED") {
      await tx.expense.update({
        where: { id: expenseId },
        data: { status: "REJECTED", rejectionReason: reason, decidedAt: now },
      });
    } else {
      const remaining = await tx.expenseApproval.count({ where: { expenseId, decision: "PENDING" } });
      if (remaining === 0) {
        await tx.expense.update({ where: { id: expenseId }, data: { status: "APPROVED", decidedAt: now } });
      }
    }
    await tx.notification.updateMany({ where: { userId: me.id, expenseId }, data: { read: true } });
    return null;
  });

  if (result) return { status: "error", message: result };
  revalidatePath("/", "layout");
  const sep = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${sep}notice=${decision === "APPROVED" ? "approved" : "rejected"}`);
}

// ─── Payments (PROTOTYPE: records a settlement; no money is moved) ──────────

export async function recordPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentUser();
  const groupId = String(formData.get("groupId") ?? "");
  const toUserId = String(formData.get("toUserId") ?? "");
  const displayedCents = Number(formData.get("displayedCents") ?? 0);
  const paidAt = parseDateInput(formData.get("paidAt"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  const errors: Record<string, string> = {};

  if (!toUserId) errors.toUserId = "Choose who you paid.";
  if (!paidAt) errors.paidAt = "Choose a valid date.";
  if (formData.get("confirmFinal") !== "on") errors.confirmFinal = "Confirm that recorded payments are final.";
  if (Object.keys(errors).length) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: errors };

  const outcome = await prisma.$transaction(async (tx) => {
    const membership = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: me.id } } });
    if (!membership) return { error: "Group not found or you are not a member." } as const;

    // Recompute the current obligation inside the transaction (stale-amount protection).
    const { plan } = await getGroupLedger(groupId, tx);
    const transfer = plan.find((t) => t.fromUserId === me.id && t.toUserId === toUserId);
    if (!transfer) return { error: "You no longer owe this member anything — balances may have changed." } as const;

    await tx.payment.create({
      data: { groupId, fromUserId: me.id, toUserId, amountCents: transfer.amountCents, paidAt: paidAt!, note },
    });
    return { amountCents: transfer.amountCents } as const;
  });

  if ("error" in outcome) return { status: "error", message: outcome.error };
  revalidatePath("/", "layout");
  const adjusted = outcome.amountCents !== displayedCents ? "&adjusted=1" : "";
  redirect(`/groups/${groupId}?tab=balances&notice=payment-recorded&amount=${outcome.amountCents}${adjusted}`);
}

// ─── Notifications (PROTOTYPE: in-app only) ─────────────────────────────────

export async function markAllNotificationsRead() {
  const me = await requireCurrentUser();
  await prisma.notification.updateMany({ where: { userId: me.id, read: false }, data: { read: true } });
  revalidatePath("/", "layout");
}
