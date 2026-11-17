"use client";

import { useActionState, useState } from "react";
import { decideExpense } from "@/app/actions";
import { initialActionState } from "@/lib/constants";
import { SubmitButton } from "./client-ui";
import { BUTTON_STYLES, INPUT_STYLES } from "./ui";

/** Approve / reject controls for a pending approver. Rejection requires a reason. */
export function DecisionForm({ expenseId, returnTo, compact }: { expenseId: string; returnTo: string; compact?: boolean }) {
  const [state, action] = useActionState(decideExpense, initialActionState);
  // null = user hasn't toggled yet; fall back to opening it when the server flagged the reason.
  const [rejecting, setRejecting] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const reasonId = `reason-${expenseId}`;
  // Keep the reason box open if the server rejected a missing/invalid reason.
  const showReject = rejecting ?? !!state.fieldErrors?.reason;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="expenseId" value={expenseId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {state.status === "error" && state.message && !state.fieldErrors && (
        <p role="alert" className="text-sm text-rose-700">
          {state.message}
        </p>
      )}

      {showReject ? (
        <div className="space-y-2">
          <label htmlFor={reasonId} className="block text-sm font-medium text-slate-800">
            Why are you rejecting this expense?
          </label>
          <textarea
            id={reasonId}
            name="reason"
            rows={compact ? 2 : 3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            required
            aria-invalid={!!state.fieldErrors?.reason}
            className={INPUT_STYLES}
            placeholder="e.g. I wasn't part of this purchase"
            autoFocus
          />
          {state.fieldErrors?.reason && <p className="text-sm text-rose-700">{state.fieldErrors.reason}</p>}
          <p className="text-xs text-slate-500">Rejection is final — the expense will never affect balances.</p>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="decision" value="REJECTED" variant="dangerSolid" pendingText="Rejecting…">
              Confirm rejection
            </SubmitButton>
            <button type="button" className={BUTTON_STYLES.ghost} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <SubmitButton name="decision" value="APPROVED" variant="success" pendingText="Approving…">
            ✓ Approve
          </SubmitButton>
          <button type="button" className={BUTTON_STYLES.danger} onClick={() => setRejecting(true)}>
            Reject…
          </button>
        </div>
      )}
    </form>
  );
}
