import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/demo-auth";
import { getGroupForMember, getGroupLedger } from "@/lib/queries";
import { formatCents } from "@/lib/money";
import { firstName, formatDate, formatShortDate } from "@/lib/format";
import { Avatar, Balance, Card, CardHeader, EmptyState, LinkButton, Money, PageHeader, Pill, StatusBadge, balanceLabel, cx } from "@/components/ui";

type Props = {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ tab?: string; status?: string }>;
};

const TABS = [
  { key: "expenses", label: "Expenses" },
  { key: "balances", label: "Balances" },
  { key: "members", label: "Members" },
  { key: "payments", label: "Payments" },
] as const;
const STATUSES = ["ALL", "PENDING", "APPROVED", "REJECTED"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { groupId } = await params;
  const g = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true } });
  return { title: g?.name ?? "Group" };
}

export default async function GroupPage({ params, searchParams }: Props) {
  const [{ groupId }, sp, me] = await Promise.all([params, searchParams, requireCurrentUser()]);
  const group = await getGroupForMember(groupId, me.id);
  if (!group) notFound(); // non-members get 404 (no enumeration)

  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "expenses";
  const ledger = await getGroupLedger(groupId);
  const myNet = ledger.net.get(me.id) ?? 0;
  const myDebts = ledger.plan.filter((t) => t.fromUserId === me.id);
  const nameOf = (id: string) => ledger.users.get(id)?.name ?? "Unknown";

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/groups" className="hover:underline">
            ← All groups
          </Link>
        }
        title={
          <span className="flex items-center gap-3">
            <span aria-hidden>{group.emoji}</span>
            {group.name}
          </span>
        }
        subtitle={group.description}
        actions={
          <>
            <LinkButton href={`/groups/${groupId}/expenses/new`}>+ Add expense</LinkButton>
            <LinkButton href={`/groups/${groupId}/settle`} variant="secondary">
              Settle up
            </LinkButton>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex -space-x-2">
          {group.members.map((m) => (
            <Avatar key={m.id} name={m.user.name} color={m.user.avatarColor} />
          ))}
        </div>
        <div className="text-sm text-slate-600">{group.members.map((m) => firstName(m.user.name)).join(", ")}</div>
        <div className="ml-auto text-right">
          <p className="text-xs text-slate-500">Your balance in this group</p>
          <Balance cents={myNet} className="text-lg" />
          <p className="text-xs text-slate-500">
            {myNet > 0 ? "you are owed" : myNet < 0 ? "you owe" : "all settled"}
          </p>
        </div>
      </div>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" aria-label="Group sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/groups/${groupId}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cx(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap",
              tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "expenses" && <ExpensesTab groupId={groupId} status={sp.status} meId={me.id} />}

      {tab === "balances" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Net balances" subtitle="From approved expenses and recorded payments" />
            <ul className="divide-y divide-slate-100">
              {group.members.map((m) => {
                const net = ledger.net.get(m.userId) ?? 0;
                return (
                  <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <Avatar name={m.user.name} color={m.user.avatarColor} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {m.user.name} {m.userId === me.id && <Pill tone="indigo">You</Pill>}
                      </p>
                      <p className="text-xs text-slate-500">{balanceLabel(net)}</p>
                    </div>
                    <Balance cents={net} />
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              Balances always sum to {formatCents([...ledger.net.values()].reduce((a, b) => a + b, 0))}. Pending and rejected expenses are not included.
            </p>
          </Card>

          <Card>
            <CardHeader title="Suggested settlements" subtitle="The simplest set of payments to settle everyone up" />
            {ledger.plan.length === 0 ? (
              <EmptyState icon="🎉" title="Everyone is settled up" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {ledger.plan.map((t) => (
                  <li key={`${t.fromUserId}-${t.toUserId}`} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <p className="min-w-0 flex-1 text-sm">
                      <strong>{t.fromUserId === me.id ? "You" : firstName(nameOf(t.fromUserId))}</strong> pay{t.fromUserId === me.id ? "" : "s"}{" "}
                      <strong>{t.toUserId === me.id ? "you" : firstName(nameOf(t.toUserId))}</strong>
                    </p>
                    <Money cents={t.amountCents} className="font-semibold" />
                    {t.fromUserId === me.id && (
                      <LinkButton href={`/groups/${groupId}/settle?to=${t.toUserId}`} variant="primary" className="py-1.5">
                        Record payment
                      </LinkButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {myDebts.length === 0 && ledger.plan.length > 0 && (
              <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                Only the person paying can record a payment. Use the demo user menu to act as them.
              </p>
            )}
          </Card>
        </div>
      )}

      {tab === "members" && <MembersTab groupId={groupId} members={group.members} meId={me.id} net={ledger.net} />}

      {tab === "payments" && <PaymentsTab groupId={groupId} meId={me.id} />}
    </>
  );
}

async function ExpensesTab({ groupId, status, meId }: { groupId: string; status?: string; meId: string }) {
  const filter = STATUSES.find((s) => s === status) ?? "ALL";
  const expenses = await prisma.expense.findMany({
    where: { groupId, ...(filter !== "ALL" ? { status: filter } : {}) },
    include: { payer: true, shares: { where: { userId: meId } } },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });

  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 sm:px-5" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/groups/${groupId}?tab=expenses${s === "ALL" ? "" : `&status=${s}`}`}
            aria-current={filter === s ? "true" : undefined}
            className={cx(
              "rounded-full px-3 py-1 text-sm font-medium",
              filter === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            {s === "ALL" ? "All" : s[0] + s.slice(1).toLowerCase()}
          </Link>
        ))}
      </div>
      {expenses.length === 0 ? (
        <EmptyState
          icon="🧾"
          title={filter === "ALL" ? "No expenses yet" : `No ${filter.toLowerCase()} expenses`}
          action={<LinkButton href={`/groups/${groupId}/expenses/new`}>+ Add the first one</LinkButton>}
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {expenses.map((e) => {
            const myShare = e.shares[0]?.shareCents;
            const iPaid = e.payerId === meId;
            return (
              <li key={e.id}>
                <Link href={`/expenses/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="w-12 shrink-0 text-center text-xs leading-tight text-slate-500">
                    {formatShortDate(e.expenseDate)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{e.description}</p>
                    <p className="truncate text-xs text-slate-500">
                      {iPaid ? "You" : firstName(e.payer.name)} paid · {e.category} · {e.splitMethod === "EQUAL" ? "Split equally" : "Split by %"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <Money cents={e.amountCents} className="font-semibold" />
                    <span className="text-xs text-slate-500">
                      {myShare !== undefined ? `your share ${formatCents(myShare)}` : "not involved"}
                    </span>
                  </div>
                  <div className="hidden w-20 text-right sm:block">
                    <StatusBadge status={e.status} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

async function MembersTab({
  groupId,
  members,
  meId,
  net,
}: {
  groupId: string;
  members: { id: string; userId: string; role: string; joinedAt: Date; user: { name: string; email: string; avatarColor: string } }[];
  meId: string;
  net: Map<string, number>;
}) {
  const [paid, shares] = await Promise.all([
    prisma.expense.groupBy({ by: ["payerId"], where: { groupId, status: "APPROVED" }, _sum: { amountCents: true } }),
    prisma.expenseShare.groupBy({ by: ["userId"], where: { expense: { groupId, status: "APPROVED" } }, _sum: { shareCents: true } }),
  ]);
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">Member</th>
              <th className="px-3 py-3 font-medium">Role</th>
              <th className="px-3 py-3 text-right font-medium">Paid</th>
              <th className="px-3 py-3 text-right font-medium">Share</th>
              <th className="px-5 py-3 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.user.name} color={m.user.avatarColor} size="sm" />
                    <div>
                      <p className="font-medium">
                        {m.user.name} {m.userId === meId && <Pill tone="indigo">You</Pill>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.user.email} · joined {formatDate(m.joinedAt)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">{m.role === "OWNER" ? <Pill tone="amber">Owner</Pill> : <Pill>Member</Pill>}</td>
                <td className="px-3 py-3 text-right">
                  <Money cents={paid.find((p) => p.payerId === m.userId)?._sum.amountCents ?? 0} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Money cents={shares.find((s) => s.userId === m.userId)?._sum.shareCents ?? 0} />
                </td>
                <td className="px-5 py-3 text-right">
                  <Balance cents={net.get(m.userId) ?? 0} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        Invitations and membership management are part of the production design and not included in this prototype.
      </p>
    </Card>
  );
}

async function PaymentsTab({ groupId, meId }: { groupId: string; meId: string }) {
  const payments = await prisma.payment.findMany({
    where: { groupId },
    include: { from: true, to: true },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });
  return (
    <Card>
      <CardHeader
        title="Payment history"
        subtitle="Recorded settlements are final and cannot be edited"
        action={<LinkButton href={`/groups/${groupId}/settle`} variant="secondary" className="py-1.5">Settle up</LinkButton>}
      />
      {payments.length === 0 ? (
        <EmptyState icon="💸" title="No payments recorded yet" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="flex -space-x-2">
                <Avatar name={p.from.name} color={p.from.avatarColor} size="sm" />
                <Avatar name={p.to.name} color={p.to.avatarColor} size="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {p.fromUserId === meId ? "You" : p.from.name} → {p.toUserId === meId ? "you" : p.to.name}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {formatDate(p.paidAt)}
                  {p.note && ` · ${p.note}`}
                </p>
              </div>
              <Money cents={p.amountCents} className="font-semibold" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
