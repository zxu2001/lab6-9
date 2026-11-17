import Link from "next/link";
import type { ReactNode } from "react";
import { formatCents, formatSignedCents } from "@/lib/money";
import { initials } from "@/lib/format";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>{children}</As>;
}

export function CardHeader({ title, action, subtitle }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-slate-500">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, color, size = "md" }: { name: string; color: string; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-6 w-6 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-white", dims)}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
  APPROVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  REJECTED: "bg-rose-50 text-rose-800 ring-rose-200",
  PAYMENT: "bg-sky-50 text-sky-800 ring-sky-200",
};
const STATUS_LABEL: Record<string, string> = { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected", PAYMENT: "Payment" };

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_STYLES[status])}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "indigo" | "amber" }) {
  const tones = { slate: "bg-slate-100 text-slate-700", indigo: "bg-indigo-50 text-indigo-700", amber: "bg-amber-100 text-amber-800" };
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

/** Balance with colour: positive = owed to you (green), negative = you owe (rose). */
export function Balance({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cx(
        "font-semibold tabular-nums",
        cents > 0 && "text-emerald-700",
        cents < 0 && "text-rose-700",
        cents === 0 && "text-slate-500",
        className,
      )}
    >
      {formatSignedCents(cents)}
    </span>
  );
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={cx("tabular-nums", className)}>{formatCents(cents)}</span>;
}

export function balanceLabel(cents: number) {
  if (cents > 0) return "is owed";
  if (cents < 0) return "owes";
  return "settled up";
}

export function EmptyState({ icon = "✨", title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl" aria-hidden>
        {icon}
      </div>
      <p className="font-medium text-slate-900">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-60";
export const BUTTON_STYLES = {
  primary: `${BUTTON_BASE} bg-indigo-600 text-white shadow-sm hover:bg-indigo-500`,
  secondary: `${BUTTON_BASE} bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50`,
  success: `${BUTTON_BASE} bg-emerald-600 text-white shadow-sm hover:bg-emerald-500`,
  danger: `${BUTTON_BASE} bg-white text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50`,
  dangerSolid: `${BUTTON_BASE} bg-rose-600 text-white shadow-sm hover:bg-rose-500`,
  ghost: `${BUTTON_BASE} text-slate-700 hover:bg-slate-100`,
} as const;

export function LinkButton({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: keyof typeof BUTTON_STYLES; className?: string }) {
  return (
    <Link href={href} className={cx(BUTTON_STYLES[variant], className)}>
      {children}
    </Link>
  );
}

export const INPUT_STYLES =
  "block w-full rounded-xl border-0 bg-white px-3 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 aria-[invalid=true]:ring-rose-400";

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-rose-700" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "error" | "success" | "warning"; title?: ReactNode; children?: ReactNode }) {
  const styles = {
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    error: "bg-rose-50 text-rose-900 ring-rose-200",
    success: "bg-emerald-50 text-emerald-900 ring-emerald-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-xl px-4 py-3 text-sm ring-1 ring-inset", styles)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : undefined}>{children}</div>}
    </div>
  );
}
