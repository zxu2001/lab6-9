import Link from "next/link";
import type { Metadata } from "next";
import { requireCurrentUser } from "@/lib/demo-auth";
import { getPendingApprovalsFor } from "@/lib/queries";
import { formatBasisPoints, formatCents } from "@/lib/money";
import { firstName, formatDate, timeAgo } from "@/lib/format";
import { Card, EmptyState, LinkButton, Money, PageHeader, Pill } from "@/components/ui";
import { DecisionForm } from "@/components/decision-form";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const me = await requireCurrentUser();
  const approvals = await getPendingApprovalsFor(me.id);

  return (
    <>
      <PageHeader
        title="Pending approvals"
        subtitle="Approval is unanimous: an expense counts toward balances only after everyone involved approves."
      />
      {approvals.length === 0 ? (
        <Card>
          <EmptyState icon="✅" title="You're all caught up" action={<LinkButton href="/" variant="secondary">Back to dashboard</LinkButton>}>
            No expenses are waiting for your decision. Try switching to another demo user to see theirs.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {approvals.map(({ expense: e, createdAt }) => {
            const mine = e.shares.find((s) => s.userId === me.id);
            return (
              <Card key={e.id} as="article" className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      {e.group.emoji} {e.group.name}
                    </p>
                    <Link href={`/expenses/${e.id}`} className="text-lg font-semibold text-slate-900 hover:underline">
                      {e.description}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {e.category} · {formatDate(e.expenseDate)}
                    </p>
                  </div>
                  <Money cents={e.amountCents} className="text-xl font-bold" />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Paid by</dt>
                    <dd className="font-medium">{e.payerId === me.id ? "You" : e.payer.name}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Your share</dt>
                    <dd className="font-medium">{mine ? formatCents(mine.shareCents) : "Not in split"}</dd>
                  </div>
                </dl>

                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {e.shares.map((s) => (
                    <li key={s.id}>
                      <Pill tone={s.userId === me.id ? "indigo" : "slate"}>
                        {firstName(s.user.name)} {formatCents(s.shareCents)}
                        {s.percentBasisPts !== null && ` (${formatBasisPoints(s.percentBasisPts)})`}
                      </Pill>
                    </li>
                  ))}
                </ul>

                <p className="mt-3 text-xs text-slate-500">
                  Added by {e.createdBy.name} {timeAgo(createdAt)}
                </p>
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <DecisionForm expenseId={e.id} returnTo="/approvals" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
