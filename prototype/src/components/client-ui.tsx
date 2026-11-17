"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { BUTTON_STYLES, cx } from "./ui";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant = "primary",
  className,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: keyof typeof BUTTON_STYLES;
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending, data } = useFormStatus();
  // When several submit buttons share a form, only the clicked one shows the spinner.
  const isMine = pending && (!name || data?.get(name) === value);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={isMine}
      className={cx(BUTTON_STYLES[variant], className)}
    >
      {isMine && <Spinner />}
      {isMine ? pendingText : children}
    </button>
  );
}

export function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />;
}

export function NavLink({ href, children, badge, mobile }: { href: string; children: ReactNode; badge?: number; mobile?: ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  if (mobile) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
          active ? "text-indigo-600" : "text-slate-500",
        )}
      >
        <span className="text-lg leading-none" aria-hidden>
          {mobile}
        </span>
        {children}
        {!!badge && (
          <span className="absolute top-1 left-1/2 ml-2 rounded-full bg-rose-500 px-1.5 text-[10px] leading-4 font-bold text-white">{badge}</span>
        )}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
        active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      {children}
      {!!badge && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] leading-5 font-bold text-white">{badge}</span>}
    </Link>
  );
}

const NOTICES: Record<string, { tone: "success" | "info" | "warning"; text: (p: URLSearchParams) => string }> = {
  "expense-created": { tone: "success", text: () => "Expense submitted. It will affect balances once every required approver approves." },
  "expense-auto-approved": { tone: "success", text: () => "Expense added and approved automatically — only you are involved." },
  approved: { tone: "success", text: () => "You approved the expense." },
  rejected: { tone: "info", text: () => "You rejected the expense. It will not affect balances." },
  "payment-recorded": {
    tone: "success",
    text: (p) => {
      const amt = Number(p.get("amount") ?? 0);
      const s = `Payment of ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amt / 100)} recorded. Balances updated below.`;
      return p.get("adjusted") ? `${s} The amount was adjusted to your current balance because it changed since the page loaded.` : s;
    },
  },
};

/** One-shot banner driven by ?notice=… after a redirect (POST-Redirect-GET). */
export function NoticeBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = params.get("notice");
  const notice = key ? NOTICES[key] : undefined;
  if (!notice) return null;

  const dismiss = () => {
    const next = new URLSearchParams(params);
    ["notice", "amount", "adjusted"].forEach((k) => next.delete(k));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const tones = {
    success: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
  };
  return (
    <div role="status" className={cx("mb-6 flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset", tones[notice.tone])}>
      <p>{notice.text(params)}</p>
      <button type="button" onClick={dismiss} className="-m-1 rounded p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
