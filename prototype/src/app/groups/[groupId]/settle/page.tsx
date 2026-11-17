import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireCurrentUser } from "@/lib/demo-auth";
import { getGroupForMember, getGroupLedger } from "@/lib/queries";
import { switchDemoUser } from "@/app/actions";
import { firstName } from "@/lib/format";
import { Avatar, Card, CardHeader, EmptyState, LinkButton, Money, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";
import { PaymentForm } from "@/components/payment-form";

export const metadata: Metadata = { title: "Settle up" };

type Props = { params: Promise<{ groupId: string }>; searchParams: Promise<{ to?: string }> };

export default async function SettlePage({ params, searchParams }: Props) {
  const [{ groupId }, { to }, me] = await Promise.all([params, searchParams, requireCurrentUser()]);
  const group = await getGroupForMember(groupId, me.id);
  if (!group) notFound();

  const { plan, users } = await getGroupLedger(groupId);
  const debts = plan
    .filter((t) => t.fromUserId === me.id)
    .map((t) => {
      const u = users.get(t.toUserId)!;
      return { toUserId: t.toUserId, name: u.name, avatarColor: u.avatarColor, amountCents: t.amountCents };
    });
  const others = plan.filter((t) => t.fromUserId !== me.id);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/groups/${groupId}?tab=balances`} className="hover:underline">
            ← {group.emoji} {group.name}
          </Link>
        }
        title="Settle up"
        subtitle="Record a payment you made to another member."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {debts.length > 0 ? (
            <PaymentForm groupId={groupId} debts={debts} defaultTo={to} />
          ) : (
            <Card>
              <EmptyState
                icon="🎉"
                title="You don't owe anyone in this group"
                action={<LinkButton href={`/groups/${groupId}?tab=balances`} variant="secondary">View balances</LinkButton>}
              >
                Only the person who owes money can record a payment.
                {others.length > 0 && " To demo a payment, act as one of the members below."}
              </EmptyState>
            </Card>
          )}
        </div>

        <aside className="lg:col-span-2">
          <Card>
            <CardHeader title="Everyone's suggested payments" />
            {plan.length === 0 ? (
              <EmptyState icon="✨" title="Everyone is settled up" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {plan.map((t) => {
                  const from = users.get(t.fromUserId)!;
                  const toU = users.get(t.toUserId)!;
                  return (
                    <li key={`${t.fromUserId}-${t.toUserId}`} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                      <Avatar name={from.name} color={from.avatarColor} size="sm" />
                      <p className="min-w-0 flex-1 text-sm">
                        <strong>{t.fromUserId === me.id ? "You" : firstName(from.name)}</strong> → {t.toUserId === me.id ? "you" : firstName(toU.name)}
                      </p>
                      <Money cents={t.amountCents} className="font-semibold" />
                      {t.fromUserId !== me.id && (
                        <form action={switchDemoUser}>
                          <input type="hidden" name="userId" value={t.fromUserId} />
                          <input type="hidden" name="returnTo" value={`/groups/${groupId}/settle?to=${t.toUserId}`} />
                          <SubmitButton variant="secondary" className="px-2.5 py-1 text-xs" pendingText="Switching…">
                            Act as {firstName(from.name)}
                          </SubmitButton>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              “Act as” is a prototype shortcut that switches the demo user. It does not exist in the production design.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}
