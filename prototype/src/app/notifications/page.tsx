import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/demo-auth";
import { markAllNotificationsRead } from "@/app/actions";
import { timeAgo } from "@/lib/format";
import { Card, CardHeader, EmptyState, cx } from "@/components/ui";
import { SubmitButton } from "@/components/client-ui";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const me = await requireCurrentUser();
  const items = await prisma.notification.findMany({
    where: { userId: me.id },
    include: { expense: { select: { status: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight sm:text-3xl">Notifications</h1>
      <p className="mb-6 text-sm text-slate-600">
        Prototype: approval requests appear here only. No emails or push notifications are sent.
      </p>
      <Card>
        <CardHeader
          title={unread ? `${unread} unread` : "All caught up"}
          action={
            unread > 0 ? (
              <form action={markAllNotificationsRead}>
                <SubmitButton variant="secondary" className="px-3 py-1.5" pendingText="Marking…">
                  Mark all read
                </SubmitButton>
              </form>
            ) : undefined
          }
        />
        {items.length === 0 ? (
          <EmptyState icon="🔔" title="No notifications yet" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.expenseId ? `/expenses/${n.expenseId}` : "/"}
                  className={cx("flex gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5", !n.read && "bg-indigo-50/50")}
                >
                  <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-indigo-600")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cx("text-sm", !n.read && "font-medium")}>{n.message}</p>
                    <p className="text-xs text-slate-500">
                      {timeAgo(n.createdAt)}
                      {n.expense && n.expense.status !== "PENDING" && ` · expense ${n.expense.status.toLowerCase()}`}
                      {!n.read && <span className="sr-only"> · unread</span>}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
