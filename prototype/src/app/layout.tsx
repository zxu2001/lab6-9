import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/demo-auth";
import { getPendingApprovalsFor, getUnreadNotificationCount } from "@/lib/queries";
import { NavLink, NoticeBanner } from "@/components/client-ui";
import { UserSwitcher } from "@/components/user-switcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "SplitSmart", template: "%s · SplitSmart" },
  description: "SplitSmart demo prototype — share expenses with groups, approve them, and settle up.",
};

export const viewport: Viewport = { themeColor: "#4f46e5" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getCurrentUser();
  const [users, pending, unread] = me
    ? await Promise.all([
        prisma.user.findMany({ orderBy: { seq: "asc" }, select: { id: true, name: true, avatarColor: true } }),
        getPendingApprovalsFor(me.id),
        getUnreadNotificationCount(me.id),
      ])
    : [[], [], 0];

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-50 font-sans text-slate-900 antialiased`}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
            <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white" aria-hidden>
                ÷
              </span>
              <span className="hidden sm:inline">SplitSmart</span>
            </Link>
            {me && (
              <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
                <NavLink href="/">Dashboard</NavLink>
                <NavLink href="/groups">Groups</NavLink>
                <NavLink href="/approvals" badge={pending.length}>
                  Approvals
                </NavLink>
                <NavLink href="/reports">Reports</NavLink>
              </nav>
            )}
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {me && (
                <>
                  <Link
                    href="/expenses/new"
                    className="hidden rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:inline-flex"
                  >
                    + Add expense
                  </Link>
                  <Link
                    href="/notifications"
                    className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
                    aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 rounded-full bg-rose-500 px-1.5 text-[10px] leading-4 font-bold text-white">
                        {unread}
                      </span>
                    )}
                  </Link>
                  <UserSwitcher users={users} currentId={me.id} />
                </>
              )}
            </div>
          </div>
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-xs text-amber-900">
            <strong>Prototype demo.</strong> Sign-in is simulated (pick a user above), notifications are in-app only, and payments are records —
            no real accounts, emails, or money movement.
          </div>
        </header>

        <main id="main" className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:pb-12">
          {me ? (
            <>
              <Suspense>
                <NoticeBanner />
              </Suspense>
              {children}
            </>
          ) : (
            <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <h1 className="text-xl font-semibold">No demo data yet</h1>
              <p className="mt-2 text-slate-600">The database has no users. From the <code>prototype/</code> folder run:</p>
              <pre className="mt-4 rounded-lg bg-slate-900 p-3 text-left text-sm text-slate-100">npm run db:setup</pre>
              <p className="mt-3 text-sm text-slate-500">Then reload this page.</p>
            </div>
          )}
        </main>

        {me && (
          <nav
            className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
            aria-label="Main mobile"
          >
            <NavLink href="/" mobile="🏠">
              Home
            </NavLink>
            <NavLink href="/groups" mobile="👥">
              Groups
            </NavLink>
            <NavLink href="/expenses/new" mobile="➕">
              Add
            </NavLink>
            <NavLink href="/approvals" mobile="✅" badge={pending.length}>
              Approvals
            </NavLink>
            <NavLink href="/reports" mobile="📊">
              Reports
            </NavLink>
          </nav>
        )}
      </body>
    </html>
  );
}
