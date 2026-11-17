"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { recordPayment } from "@/app/actions";
import { initialActionState, todayISO } from "@/lib/constants";
import { formatCents } from "@/lib/money";
import { SubmitButton } from "./client-ui";
import { Alert, Avatar, BUTTON_STYLES, Card, Field, INPUT_STYLES, cx } from "./ui";

type Debt = { toUserId: string; name: string; avatarColor: string; amountCents: number };

export function PaymentForm({ groupId, debts, defaultTo }: { groupId: string; debts: Debt[]; defaultTo?: string }) {
  const [state, action] = useActionState(recordPayment, initialActionState);
  const [toUserId, setToUserId] = useState(debts.some((d) => d.toUserId === defaultTo) ? defaultTo! : debts[0]?.toUserId);
  const [paidAt, setPaidAt] = useState(todayISO);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const errors = state.fieldErrors ?? {};
  const selected = debts.find((d) => d.toUserId === toUserId);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="groupId" value={groupId} />
      {state.status === "error" && state.message && <Alert tone="error" title={state.message} />}
      <input type="hidden" name="displayedCents" value={selected?.amountCents ?? 0} />

      <Card className="space-y-5 p-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-800">Who did you pay?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {debts.map((d) => (
              <label
                key={d.toUserId}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-xl p-3 ring-1 transition",
                  toUserId === d.toUserId ? "bg-indigo-50 ring-2 ring-indigo-600" : "ring-slate-200 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name="toUserId"
                  value={d.toUserId}
                  checked={toUserId === d.toUserId}
                  onChange={() => setToUserId(d.toUserId)}
                  className="sr-only"
                />
                <Avatar name={d.name} color={d.avatarColor} />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{d.name}</span>
                  <span className="block text-xs text-slate-500">you owe {formatCents(d.amountCents)}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.toUserId && <p className="mt-1.5 text-sm text-rose-700">{errors.toUserId}</p>}
        </fieldset>

        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm text-slate-500">Payment amount</p>
          <p className="text-3xl font-bold tabular-nums">{selected ? formatCents(selected.amountCents) : "—"}</p>
          <p className="mt-1 text-xs text-slate-500">
            Settlements cover the full amount you currently owe this person. If balances change before you submit, the current amount is used.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Date paid" htmlFor="paidAt" error={errors.paidAt}>
            <input id="paidAt" name="paidAt" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={INPUT_STYLES} required />
          </Field>
          <Field label="Note (optional)" htmlFor="note">
            <input
              id="note"
              name="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="e.g. Venmo, cash"
              className={INPUT_STYLES}
            />
          </Field>
        </div>
      </Card>

      <Alert tone="warning" title="Recorded payments are final">
        <label className="mt-2 flex items-start gap-2">
          <input
            type="checkbox"
            name="confirmFinal"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-amber-400 text-indigo-600"
          />
          <span>
            I understand this can&apos;t be edited or undone. <em>Prototype:</em> this only records the payment — no money is transferred.
          </span>
        </label>
        {errors.confirmFinal && <p className="mt-1 text-rose-700">{errors.confirmFinal}</p>}
      </Alert>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SubmitButton pendingText="Recording…" disabled={!selected || !confirmed}>
          Record {selected ? formatCents(selected.amountCents) : ""} payment
        </SubmitButton>
        <Link href={`/groups/${groupId}?tab=balances`} className={BUTTON_STYLES.ghost}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
