import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireCurrentUser } from "@/lib/demo-auth";
import { prisma } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Add expense" };

/** Global "Add expense" entry point: pick a group first. */
export default async function ChooseGroupPage() {
  const me = await requireCurrentUser();
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId: me.id } } },
    include: { _count: { select: { members: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (groups.length === 1) redirect(`/groups/${groups[0].id}/expenses/new`);

  return (
    <>
      <PageHeader title="Add an expense" subtitle="Which group is this expense for?" />
      <Card className="mx-auto max-w-xl">
        {groups.length === 0 ? (
          <EmptyState icon="👥" title="You're not in any groups" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}/expenses/new`} className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-xl" aria-hidden>
                    {g.emoji}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{g.name}</p>
                    <p className="text-sm text-slate-500">{g._count.members} members</p>
                  </div>
                  <span className="text-slate-400" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
