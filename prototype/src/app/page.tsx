import Link from "next/link";
import { requireCurrentUser } from "@/lib/demo-auth";
import { getGroupSummaries, getPendingApprovalsFor, getRecentActivity } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { firstName, formatShortDate, timeAgo } from "@/lib/format";
import { Balance, Card, CardHeader, EmptyState, LinkButton, Money, PageHeader, StatusBadge } from "@/components/ui";
import { DecisionForm } from "@/components/decision-form";

export default async function DashboardPage() {
  const me = await requireCurrentUser();
  const [groups, approvals, activity, users] = await Promise.all([
    getGroupSummaries(me.id),
    getPendingApprovalsFor(me.id),
    getRecentActivity(me.id),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const nameOf = (id: string) => firstName(users.find((u) => u.id === id)?.name ?? "Someone");

  // Totals are shown side by side, never netted across groups (FR-049).
  const owedToMe = groups.reduce((s, g) => s + Math.max(0, g.myNetCents), 0);
  const iOwe = groups.reduce((s, g) => s + Math.max(0, -g.myNetCents), 0);

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName(me.name)} 👋`}
        subtitle="Here's where things stand across your groups."
        actions={
          <>
            <LinkButton href="/expenses/new">+ Add expense</LinkButton>
            <LinkButton href="/reports" variant="secondary">
              View reports
            </LinkButton>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="You are owed" value={formatCents(owedToMe)} tone="emerald" hint={`across ${groups.filter((g) => g.myNetCents > 0).length} group(s)`} />
        <StatCard label="You owe" value={formatCents(iOwe)} tone="rose" hint={`across ${groups.filter((g) => g.myNetCents < 0).length} group(s)`} />
        <StatCard
          label="Waiting on you"
          value={`${approvals.length} approval${approvals.length === 1 ? "" : "s"}`}
          tone="amber"
          hint={approvals.length ? <Link className="underline" href="/approvals">Review now →</Link> : "You're all caught up"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Group balances" subtitle="Your net position in each group" action={<Link href="/groups" className="text-sm font-medium text-indigo-600 hover:underline">All groups</Link>} />
            {groups.length === 0 ? (
              <EmptyState icon="👥" title="You're not in any groups yet">
                Groups are created in the production app. Switch to another demo user to explore.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {groups.map((g) => (
                  <li key={g.id}>
                    <Link href={`/groups/${g.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl" aria-hidden>
                        {g.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{g.name}</p>
                        <p className="truncate text-sm text-slate-500">
                          {g.myTransfers.length === 0
                            ? "You're settled up"
                            : g.myTransfers
                                .map((t) =>
                                  t.fromUserId === me.id
                                    ? `You owe ${nameOf(t.toUserId)} ${formatCents(t.amountCents)}`
                                    : `${nameOf(t.fromUserId)} owes you ${formatCents(t.amountCents)}`,
                                )
                                .join(" · ")}
                        </p>
                      </div>
                      <div className="text-right">
                        <Balance cents={g.myNetCents} />
                        {g.pendingCount > 0 && <p className="text-xs text-amber-700">{g.pendingCount} pending</p>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent activity" />
            {activity.length === 0 ? (
              <EmptyState icon="🧾" title="No activity yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {activity.map((a) => (
                  <li key={`${a.kind}-${a.id}`}>
                    <Link
                      href={a.kind === "expense" ? `/expenses/${a.id}` : `/groups/${a.groupId}?tab=payments`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100" aria-hidden>
                        {a.kind === "expense" ? "🧾" : "💸"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{a.title}</p>
                        <p className="truncate text-xs text-slate-500">
                          {a.groupName} · {a.kind === "expense" ? `paid by ${firstName(a.actorName)} · ` : ""}
                          {formatShortDate(a.date)} · added {timeAgo(a.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Money cents={a.amountCents} className="text-sm font-semibold" />
                        <StatusBadge status={a.kind === "expense" ? a.status : "PAYMENT"} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Pending approvals"
              subtitle="Expenses that need your decision"
              action={approvals.length > 3 ? <Link href="/approvals" className="text-sm font-medium text-indigo-600 hover:underline">See all</Link> : undefined}
            />
            {approvals.length === 0 ? (
              <EmptyState icon="✅" title="Nothing to review">
                When someone adds an expense involving you, it will show up here.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {approvals.slice(0, 3).map(({ expense: e }) => {
                  const myShare = e.shares.find((s) => s.userId === me.id)?.shareCents ?? 0;
                  return (
                    <li key={e.id} className="space-y-3 px-4 py-4 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/expenses/${e.id}`} className="font-medium text-slate-900 hover:underline">
                            {e.description}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {e.group.name} · {firstName(e.payer.name)} paid · {formatShortDate(e.expenseDate)}
                          </p>
                        </div>
                        <div className="text-right">
                          <Money cents={e.amountCents} className="font-semibold" />
                          <p className="text-xs text-slate-500">your share {formatCents(myShare)}</p>
                        </div>
                      </div>
                      <DecisionForm expenseId={e.id} returnTo="/" compact />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint?: React.ReactNode; tone: "emerald" | "rose" | "amber" }) {
  const accent = { emerald: "text-emerald-700", rose: "text-rose-700", amber: "text-amber-700" }[tone];
  return (
    <Card className="px-5 py-4" as="div">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}
