import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireCurrentUser } from "@/lib/demo-auth";
import { getGroupForMember } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ExpenseForm } from "@/components/expense-form";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage({ params }: { params: Promise<{ groupId: string }> }) {
  const [{ groupId }, me] = await Promise.all([params, requireCurrentUser()]);
  const group = await getGroupForMember(groupId, me.id);
  if (!group) notFound();

  const members = group.members.map((m) => ({ id: m.user.id, name: m.user.name, seq: m.user.seq, avatarColor: m.user.avatarColor }));

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/groups/${groupId}`} className="hover:underline">
            ← {group.emoji} {group.name}
          </Link>
        }
        title="Add an expense"
        subtitle="Record what was spent and who it should be split between."
      />
      <ExpenseForm groupId={groupId} members={members} meId={me.id} />
    </>
  );
}
