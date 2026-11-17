import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/demo-auth";
import { formatBasisPoints } from "@/lib/money";
import { formatDate, timeAgo } from "@/lib/format";
import { Alert, Avatar, Card, CardHeader, Money, PageHeader, Pill, StatusBadge } from "@/components/ui";
import { DecisionForm } from "@/components/decision-form";

type Props = { params: Promise<{ expenseId: string }> };

export const metadata: Metadata = { title: "Expense" };

export default async function ExpensePage({ params }: Props) {
  const [{ expenseId }, me] = await Promise.all([params, requireCurrentUser()]);
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, group: { members: { some: { userId: me.id } } } },
    include: {
      group: true,
      payer: true,
      createdBy: true,
      shares: { include: { user: true }, orderBy: { user: { seq: "asc" } } },
      approvals: { include: { approver: true }, orderBy: { approver: { seq: "asc" } } },
    },
  });
  if (!expense) notFound();

  const myApproval = expense.approvals.find((a) => a.approverId === me.id);
  const canDecide = expense.status === "PENDING" && myApproval?.decision === "PENDING";
  const approvedCount = expense.approvals.filter((a) => a.decision === "APPROVED").length;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/groups/${expense.groupId}`} className="hover:underline">
            ← {expense.group.emoji} {expense.group.name}
          </Link>
        }
        title={expense.description}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={expense.status} />
            <span>
              {expense.category} · {formatDate(expense.expenseDate)}
            </span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">Total</p>
                <Money cents={expense.amountCents} className="text-3xl font-bold" />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Avatar name={expense.payer.name} color={expense.payer.avatarColor} size="sm" />
                <span>
                  Paid by <strong>{expense.payerId === me.id ? "you" : expense.payer.name}</strong>
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Added by {expense.createdById === me.id ? "you" : expense.createdBy.name} {timeAgo(expense.createdAt)} · split{" "}
              {expense.splitMethod === "EQUAL" ? "equally" : "by percentage"}
            </p>
          </Card>

          <Card>
            <CardHeader title="Split" subtitle={`${expense.shares.length} participant(s)`} />
            <ul className="divide-y divide-slate-100">
              {expense.shares.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar name={s.user.name} color={s.user.avatarColor} size="sm" />
                  <span className="flex-1 text-sm font-medium">
                    {s.user.name} {s.userId === me.id && <Pill tone="indigo">You</Pill>}
                  </span>
                  {s.percentBasisPts !== null && <span className="text-sm text-slate-500">{formatBasisPoints(s.percentBasisPts)}</span>}
                  <Money cents={s.shareCents} className="w-24 text-right font-semibold" />
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {canDecide && (
            <Card className="border-amber-300 p-5 ring-1 ring-amber-200">
              <h2 className="font-semibold">Your approval is needed</h2>
              <p className="mt-1 mb-4 text-sm text-slate-600">
                This expense will only affect balances after every required approver approves. Any rejection is final.
              </p>
              <DecisionForm expenseId={expense.id} returnTo={`/expenses/${expense.id}`} />
            </Card>
          )}

          {expense.status === "REJECTED" && (
            <Alert tone="error" title="Rejected — does not affect balances">
              {expense.rejectionReason && <>Reason: “{expense.rejectionReason}”</>}
            </Alert>
          )}
          {expense.status === "APPROVED" && (
            <Alert tone="success" title="Approved">
              Included in group balances{expense.decidedAt ? ` since ${formatDate(expense.decidedAt)}` : ""}.
            </Alert>
          )}

          <Card>
            <CardHeader
              title="Approvals"
              subtitle={
                expense.approvals.length === 0
                  ? "No approvers required — approved automatically"
                  : `${approvedCount} of ${expense.approvals.length} approved`
              }
            />
            {expense.approvals.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {expense.approvals.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <Avatar name={a.approver.name} color={a.approver.avatarColor} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{a.approverId === me.id ? "You" : a.approver.name}</p>
                      {a.reason && <p className="text-xs text-slate-500">“{a.reason}”</p>}
                      {a.decidedAt && <p className="text-xs text-slate-400">{timeAgo(a.decidedAt)}</p>}
                    </div>
                    <StatusBadge status={a.decision} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
