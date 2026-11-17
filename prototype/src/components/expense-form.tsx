"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createExpense } from "@/app/actions";
import { CATEGORIES, initialActionState, todayISO } from "@/lib/constants";
import { formatCents, parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/money";
import { allocateEqual, allocatePercentage } from "@/lib/split";
import { firstName } from "@/lib/format";
import { SubmitButton } from "./client-ui";
import { Alert, Avatar, BUTTON_STYLES, Card, Field, INPUT_STYLES, cx } from "./ui";

type Member = { id: string; name: string; seq: number; avatarColor: string };

export function ExpenseForm({ groupId, members, meId }: { groupId: string; members: Member[]; meId: string }) {
  const [state, action] = useActionState(createExpense, initialActionState);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO);
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [payerId, setPayerId] = useState(meId);
  const [method, setMethod] = useState<"EQUAL" | "PERCENTAGE">("EQUAL");
  const [selected, setSelected] = useState<string[]>(members.map((m) => m.id));
  const [percents, setPercents] = useState<Record<string, string>>({});
  const errors = state.fieldErrors ?? {};

  const amountCents = parseDollarsToCents(amount);
  const participants = members.filter((m) => selected.includes(m.id));
  const totalBp = participants.reduce((s, m) => s + (parsePercentToBasisPoints(percents[m.id] ?? "") ?? 0), 0);

  // Live preview using the same allocation code as the server.
  const preview = useMemo(() => {
    if (!amountCents || participants.length === 0) return null;
    const ps = participants.map((m) => ({ userId: m.id, seq: m.seq }));
    if (method === "EQUAL") return allocateEqual(amountCents, ps);
    const withBp = ps.map((p) => ({ ...p, basisPts: parsePercentToBasisPoints(percents[p.userId] ?? "") ?? 0 }));
    if (withBp.some((p) => p.basisPts <= 0) || totalBp !== 10_000) return null;
    return allocatePercentage(amountCents, withBp);
  }, [amountCents, participants, method, percents, totalBp]);

  const approvers = members.filter((m) => (selected.includes(m.id) || m.id === payerId) && m.id !== meId);

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const splitEvenly = () => {
    const n = participants.length;
    if (!n) return;
    const base = Math.floor(10_000 / n);
    let extra = 10_000 - base * n;
    const next: Record<string, string> = {};
    for (const m of participants) {
      const bp = base + (extra-- > 0 ? 1 : 0);
      next[m.id] = (bp / 100).toFixed(2);
    }
    setPercents(next);
  };

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-5" noValidate>
      <input type="hidden" name="groupId" value={groupId} />
      <div className="space-y-6 lg:col-span-3">
        {state.status === "error" && state.message && <Alert tone="error" title={state.message} />}

        <Card className="space-y-5 p-5">
          <Field label="Description" htmlFor="description" error={errors.description}>
            <input
              id="description"
              name="description"
              className={INPUT_STYLES}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Groceries at Trader Joe's"
              maxLength={120}
              required
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? "description-error" : undefined}
              autoFocus
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Amount (USD)" htmlFor="amount" error={errors.amount}>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">$</span>
                <input
                  id="amount"
                  name="amount"
                  inputMode="decimal"
                  className={cx(INPUT_STYLES, "pl-7 tabular-nums")}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  aria-invalid={!!errors.amount || (amount !== "" && amountCents === null)}
                  aria-describedby={errors.amount ? "amount-error" : undefined}
                />
              </div>
              {!errors.amount && amount !== "" && amountCents === null && (
                <p className="mt-1.5 text-sm text-rose-700">Use a number with at most 2 decimals.</p>
              )}
            </Field>
            <Field label="Date" htmlFor="date" error={errors.date}>
              <input id="date" name="date" type="date" className={INPUT_STYLES} value={date} onChange={(e) => setDate(e.target.value)} required aria-invalid={!!errors.date} />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Paid by" htmlFor="payerId" error={errors.payerId}>
              <select id="payerId" name="payerId" className={INPUT_STYLES} value={payerId} onChange={(e) => setPayerId(e.target.value)}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === meId ? `${m.name} (you)` : m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category" htmlFor="category" error={errors.category}>
              <select id="category" name="category" className={INPUT_STYLES} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-800">How should it be split?</legend>
            <input type="hidden" name="splitMethod" value={method} />
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1" role="radiogroup">
              {(["EQUAL", "PERCENTAGE"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => setMethod(m)}
                  className={cx(
                    "rounded-lg px-3 py-2 text-sm font-semibold transition",
                    method === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {m === "EQUAL" ? "Equally" : "By percentage"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <div className="mb-2 flex items-center justify-between">
              <legend className="text-sm font-medium text-slate-800">Split between</legend>
              <div className="flex gap-3 text-sm">
                <button type="button" className="font-medium text-indigo-600 hover:underline" onClick={() => setSelected(members.map((m) => m.id))}>
                  Everyone
                </button>
                {method === "PERCENTAGE" && (
                  <button type="button" className="font-medium text-indigo-600 hover:underline" onClick={splitEvenly}>
                    Even %
                  </button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
              {members.map((m) => {
                const checked = selected.includes(m.id);
                const share = preview?.find((p) => p.userId === m.id)?.shareCents;
                return (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      id={`p-${m.id}`}
                      type="checkbox"
                      name="participants"
                      value={m.id}
                      checked={checked}
                      onChange={() => toggle(m.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <label htmlFor={`p-${m.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <Avatar name={m.name} color={m.avatarColor} size="sm" />
                      <span className="truncate text-sm font-medium">{m.id === meId ? `${m.name} (you)` : m.name}</span>
                    </label>
                    {method === "PERCENTAGE" && checked && (
                      <div className="relative w-24">
                        <input
                          aria-label={`Percentage for ${m.name}`}
                          name={`percent_${m.id}`}
                          inputMode="decimal"
                          value={percents[m.id] ?? ""}
                          onChange={(e) => setPercents((p) => ({ ...p, [m.id]: e.target.value }))}
                          placeholder="0"
                          className={cx(INPUT_STYLES, "py-1.5 pr-7 text-right tabular-nums")}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-slate-500">%</span>
                      </div>
                    )}
                    <span className="w-20 text-right text-sm text-slate-600 tabular-nums">{checked && share !== undefined ? formatCents(share) : checked ? "—" : ""}</span>
                  </li>
                );
              })}
            </ul>
            {errors.participants && <p className="mt-1.5 text-sm text-rose-700">{errors.participants}</p>}
            {method === "PERCENTAGE" && (
              <p className={cx("mt-2 text-sm", totalBp === 10_000 ? "text-emerald-700" : "text-slate-600")}>
                Total: <strong className="tabular-nums">{(totalBp / 100).toFixed(2)}%</strong>
                {totalBp !== 10_000 && ` · ${((10_000 - totalBp) / 100).toFixed(2)}% ${totalBp < 10_000 ? "left to assign" : "over"}`}
              </p>
            )}
            {errors.percentages && <p className="mt-1.5 text-sm text-rose-700">{errors.percentages}</p>}
            <p className="mt-2 text-xs text-slate-500">The payer doesn&apos;t have to be part of the split. Leftover cents go to members in a fixed order, so shares always add up exactly.</p>
          </fieldset>
        </Card>
      </div>

      <aside className="lg:col-span-2">
        <Card className="space-y-4 p-5 lg:sticky lg:top-28">
          <h2 className="font-semibold">Summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-semibold tabular-nums">{amountCents ? formatCents(amountCents) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Paid by</dt>
              <dd>{firstName(members.find((m) => m.id === payerId)?.name ?? "")}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">Split</dt>
              <dd>
                {participants.length} {participants.length === 1 ? "person" : "people"}, {method === "EQUAL" ? "equally" : "by %"}
              </dd>
            </div>
          </dl>
          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            {approvers.length === 0 ? (
              <>Only you are involved, so this will be <strong>approved automatically</strong>.</>
            ) : (
              <>
                Needs approval from <strong>{approvers.map((a) => firstName(a.name)).join(", ")}</strong> before it affects balances. They&apos;ll get an
                in-app notification (prototype — no email).
              </>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <SubmitButton pendingText="Submitting…" className="flex-1">
              {approvers.length === 0 ? "Add expense" : "Submit for approval"}
            </SubmitButton>
            <Link href={`/groups/${groupId}`} className={cx(BUTTON_STYLES.ghost, "flex-1")}>
              Cancel
            </Link>
          </div>
        </Card>
      </aside>
    </form>
  );
}
