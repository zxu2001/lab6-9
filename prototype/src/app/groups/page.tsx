import Link from "next/link";
import type { Metadata } from "next";
import { requireCurrentUser } from "@/lib/demo-auth";
import { getGroupSummaries } from "@/lib/queries";
import { Balance, Card, EmptyState, Money, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Groups" };

export default async function GroupsPage() {
  const me = await requireCurrentUser();
  const groups = await getGroupSummaries(me.id);

  return (
    <>
      <PageHeader title="Your groups" subtitle="Balances are tracked separately in each group." />
      {groups.length === 0 ? (
        <Card>
          <EmptyState icon="👥" title="No groups yet">
            This demo user doesn&apos;t belong to any groups. Switch users from the header menu.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-indigo-600">
              <Card as="article" className="h-full p-5 transition group-hover:border-indigo-300 group-hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl" aria-hidden>
                    {g.emoji}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-slate-900">{g.name}</h2>
                    <p className="text-sm text-slate-500">{g.memberCount} members</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-slate-600">{g.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                  <div>
                    <dt className="text-slate-500">Your balance</dt>
                    <dd>
                      <Balance cents={g.myNetCents} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Approved spend</dt>
                    <dd>
                      <Money cents={g.approvedTotalCents} className="font-semibold" />
                    </dd>
                  </div>
                </dl>
                {g.pendingCount > 0 && <p className="mt-3 text-xs font-medium text-amber-700">{g.pendingCount} expense(s) awaiting approval</p>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
