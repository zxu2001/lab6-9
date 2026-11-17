import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/demo-auth";
import { formatCents } from "@/lib/money";
import { firstName, formatDate, toISODate } from "@/lib/format";
import { Alert, BUTTON_STYLES, Card, CardHeader, EmptyState, INPUT_STYLES, Money, PageHeader, StatusBadge, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Reports" };

type SP = { from?: string; to?: string; group?: string; type?: string; status?: string };

const TYPES = { all: "Expenses & payments", expenses: "Expenses only", payments: "Payments only" } as const;
const STATUS = { effective: "Approved only", all: "All statuses", PENDING: "Pending", REJECTED: "Rejected" } as const;

function parseDay(v: string | undefined, endOfDay = false): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, me] = await Promise.all([searchParams, requireCurrentUser()]);

  const today = new Date();
  const defaultFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 60));
  const fromStr = sp.from ?? toISODate(defaultFrom);
  const toStr = sp.to ?? toISODate(today);
  const type = (sp.type && sp.type in TYPES ? sp.type : "all") as keyof typeof TYPES;
  const status = (sp.status && sp.status in STATUS ? sp.status : "effective") as keyof typeof STATUS;

  const groups = await prisma.group.findMany({
    where: { members: { some: { userId: me.id } } },
    orderBy: { createdAt: "asc" },
  });
  const groupId = groups.some((g) => g.id === sp.group) ? sp.group! : "";
  const groupIds = groupId ? [groupId] : groups.map((g) => g.id);

  const from = parseDay(fromStr);
  const to = parseDay(toStr, true);
  const error = !from || !to ? "Enter valid start and end dates." : from > to ? "The start date must be on or before the end date." : null;

  const expenseStatusFilter =
    status === "effective" ? { status: "APPROVED" as const } : status === "all" ? {} : { status: status as "PENDING" | "REJECTED" };

  const [expenses, payments] = error
    ? [[], []]
    : await Promise.all([
        type === "payments"
          ? []
          : prisma.expense.findMany({
              where: { groupId: { in: groupIds }, expenseDate: { gte: from!, lte: to! }, ...expenseStatusFilter },
              include: { group: true, payer: true, shares: { where: { userId: me.id } } },
              orderBy: { expenseDate: "desc" },
            }),
        type === "expenses" || (status !== "effective" && status !== "all")
          ? []
          : prisma.payment.findMany({
              where: { groupId: { in: groupIds }, paidAt: { gte: from!, lte: to! } },
              include: { group: true, from: true, to: true },
              orderBy: { paidAt: "desc" },
            }),
      ]);

  const approved = expenses.filter((e) => e.status === "APPROVED");
  const totals = {
    expenseCount: expenses.length,
    approvedCents: approved.reduce((s, e) => s + e.amountCents, 0),
    myShareCents: approved.reduce((s, e) => s + (e.shares[0]?.shareCents ?? 0), 0),
    iPaidCents: approved.filter((e) => e.payerId === me.id).reduce((s, e) => s + e.amountCents, 0),
    paymentCents: payments.reduce((s, p) => s + p.amountCents, 0),
    paymentCount: payments.length,
  };

  // Per-group figures, side by side — never netted across groups.
  const perGroup = groups
    .filter((g) => groupIds.includes(g.id))
    .map((g) => {
      const ge = approved.filter((e) => e.groupId === g.id);
      const gp = payments.filter((p) => p.groupId === g.id);
      return {
        group: g,
        approvedCents: ge.reduce((s, e) => s + e.amountCents, 0),
        myShareCents: ge.reduce((s, e) => s + (e.shares[0]?.shareCents ?? 0), 0),
        paymentCents: gp.reduce((s, p) => s + p.amountCents, 0),
        count: ge.length + gp.length,
      };
    });

  const rows = [
    ...expenses.map((e) => ({
      key: `e-${e.id}`,
      date: e.expenseDate,
      href: `/expenses/${e.id}`,
      title: e.description,
      detail: `${e.category} · paid by ${e.payerId === me.id ? "you" : firstName(e.payer.name)}`,
      group: e.group.name,
      amountCents: e.amountCents,
      mine: e.shares[0]?.shareCents,
      badge: e.status as string,
    })),
    ...payments.map((p) => ({
      key: `p-${p.id}`,
      date: p.paidAt,
      href: `/groups/${p.groupId}?tab=payments`,
      title: `${p.fromUserId === me.id ? "You" : firstName(p.from.name)} → ${p.toUserId === me.id ? "you" : firstName(p.to.name)}`,
      detail: p.note || "Settlement",
      group: p.group.name,
      amountCents: p.amountCents,
      mine: undefined,
      badge: "PAYMENT",
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <>
      <PageHeader title="Reports" subtitle="Expenses and payments in the groups you belong to." />

      <Card className="mb-6 p-4 sm:p-5">
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div>
            <label htmlFor="from" className="mb-1.5 block text-sm font-medium">From</label>
            <input id="from" name="from" type="date" defaultValue={fromStr} className={INPUT_STYLES} />
          </div>
          <div>
            <label htmlFor="to" className="mb-1.5 block text-sm font-medium">To</label>
            <input id="to" name="to" type="date" defaultValue={toStr} className={INPUT_STYLES} />
          </div>
          <div>
            <label htmlFor="group" className="mb-1.5 block text-sm font-medium">Group</label>
            <select id="group" name="group" defaultValue={groupId} className={INPUT_STYLES}>
              <option value="">All my groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="type" className="mb-1.5 block text-sm font-medium">Show</label>
            <select id="type" name="type" defaultValue={type} className={INPUT_STYLES}>
              {Object.entries(TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="mb-1.5 block text-sm font-medium">Expense status</label>
            <select id="status" name="status" defaultValue={status} className={INPUT_STYLES}>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={cx(BUTTON_STYLES.primary, "flex-1")}>Apply</button>
            <Link href="/reports" className={BUTTON_STYLES.ghost}>Reset</Link>
          </div>
        </form>
      </Card>

      {error ? (
        <Alert tone="error" title="Can't run this report">{error}</Alert>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-600">
            Showing <strong>{TYPES[type].toLowerCase()}</strong> from <strong>{formatDate(from!)}</strong> to <strong>{formatDate(to!)}</strong> in{" "}
            <strong>{groupId ? groups.find((g) => g.id === groupId)?.name : "all your groups"}</strong>
            {type !== "payments" && <> · expenses: <strong>{STATUS[status].toLowerCase()}</strong></>}.
          </p>

          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Approved spending" value={formatCents(totals.approvedCents)} hint={`${approved.length} approved expense(s)`} />
            <Stat label="Your share" value={formatCents(totals.myShareCents)} hint="of approved expenses" />
            <Stat label="You paid" value={formatCents(totals.iPaidCents)} hint="as the payer" />
            <Stat label="Payments recorded" value={formatCents(totals.paymentCents)} hint={`${totals.paymentCount} payment(s)`} />
          </div>

          {!groupId && perGroup.length > 1 && (
            <Card className="mb-6">
              <CardHeader title="By group" subtitle="Each group is tracked separately — amounts are never netted across groups." />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Group</th>
                      <th className="px-3 py-2.5 text-right font-medium">Approved spend</th>
                      <th className="px-3 py-2.5 text-right font-medium">Your share</th>
                      <th className="px-5 py-2.5 text-right font-medium">Payments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {perGroup.map((g) => (
                      <tr key={g.group.id}>
                        <td className="px-5 py-3 font-medium">{g.group.emoji} {g.group.name}</td>
                        <td className="px-3 py-3 text-right"><Money cents={g.approvedCents} /></td>
                        <td className="px-3 py-3 text-right"><Money cents={g.myShareCents} /></td>
                        <td className="px-5 py-3 text-right"><Money cents={g.paymentCents} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Details" subtitle={`${rows.length} record(s)`} />
            {rows.length === 0 ? (
              <EmptyState icon="🔍" title="No records match these filters">
                Try widening the date range or choosing “All statuses”.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Date</th>
                      <th className="px-3 py-2.5 font-medium">Description</th>
                      <th className="px-3 py-2.5 font-medium">Group</th>
                      <th className="px-3 py-2.5 font-medium">Type</th>
                      <th className="px-3 py-2.5 text-right font-medium">Your share</th>
                      <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.key} className="hover:bg-slate-50">
                        <td className="px-5 py-3 whitespace-nowrap text-slate-600">{formatDate(r.date)}</td>
                        <td className="px-3 py-3">
                          <Link href={r.href} className="font-medium text-slate-900 hover:underline">{r.title}</Link>
                          <p className="text-xs text-slate-500">{r.detail}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{r.group}</td>
                        <td className="px-3 py-3"><StatusBadge status={r.badge} /></td>
                        <td className="px-3 py-3 text-right text-slate-600">{r.mine !== undefined ? <Money cents={r.mine} /> : "—"}</td>
                        <td className="px-5 py-3 text-right font-semibold"><Money cents={r.amountCents} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card as="div" className="px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </Card>
  );
}
