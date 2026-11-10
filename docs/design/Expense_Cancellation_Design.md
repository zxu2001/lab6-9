# Expense Cancellation Design

| Decisions | D14, D15, D26, D35, D40, D41 |
| --- | --- |
| Requirements | FR-040, FR-041, FR-044, FR-050 |
| Rules | BR-CAN-01–10, BR-NOT-01 |
| Assumptions | DA-02, DA-17, DA-19, DA-20, DA-21, DA-27, DA-39 |
| UML | [14_Expense_Cancellation_State_Machine](../uml/14_Expense_Cancellation_State_Machine.puml), [21_Activity_Cancel_Expense](../uml/21_Activity_Cancel_Expense.puml), [33_Sequence_Cancel_Approved_Expense](../uml/33_Sequence_Cancel_Approved_Expense.puml) |
| Tests | UT-CAN-01–11, CON-08, FIN-13, FIN-14, AT-D14 |

## 1. Two paths

| Path | Applies when | Approval needed | Effect |
| --- | --- | --- | --- |
| **Direct cancel** | Expense `PENDING_APPROVAL` and `ever_approved = false` (DA-17) | None (creator only) | Expense and current version `CANCELLED`. No ledger effect, because it never had one. |
| **Cancellation request** | Expense `APPROVED` | Unanimous by the frozen cancellation-approver set | While `OPEN`: still effective. On `APPROVED`: expense `CANCELLED`, stops affecting balances. On `REJECTED`: unchanged. |
| Not allowed | `PENDING_APPROVAL` with `ever_approved = true` (an approved expense under re-approval) | n/a | Refused with `CANCEL_BLOCKED_REAPPROVAL_PENDING` (DA-17, Q-04) |
| Not allowed | `REJECTED`, `CANCELLED` | n/a | Refused (final) |

## 2. Interfaces

```
ExpenseCancellationService
  CancellationOutcome      cancelPendingExpense(long actor, long expenseId, int basedOnVersionNumber)
  CancellationRequestView  requestCancellation (long actor, long expenseId, String optionalReason)
  CancellationOutcome      approveCancellation (long actor, long cancellationRequestId)
  CancellationOutcome      rejectCancellation  (long actor, long cancellationRequestId, String reason)
  List<CancellationRequestView> listRequests(long actor, long expenseId)          // TX(RO)
CancellationOutcome(long expenseId, ExpenseStatus expenseStatus, Long requestId,
                    CancellationRequestStatus requestStatus, int remainingApprovals)
```

## 3. Direct cancel of a never-approved pending expense

**TX(RW, lock = group)**

1. `requireActiveMemberOfActiveGroup`; `requireCreator` (BR-CAN-01).
2. `CancellationPolicy.checkDirectCancel`: status `PENDING_APPROVAL`, `!everApproved`, `basedOnVersionNumber == current`.
3. `expense.cancelPending(actor, now)`: version `PENDING → CANCELLED`, expense `CANCELLED` (`cancelled_at = now`). Undecided approvals stay moot.
4. Audit `EXPENSE_CANCELLED` (details: path = DIRECT, version).
5. No notification (D26 lists only approval requests).

## 4. Cancellation request for an approved expense

### 4.1 Open request

**TX(RW, lock = group)**

1. `requireActiveMemberOfActiveGroup`; `requireCreator` (DA-20).
2. `CancellationPolicy.checkOpenRequest`: status `APPROVED`; no `OPEN` request (`ux_cancel_one_open` is the backstop); no `INACTIVE` member among payer ∪ participants of the effective version (BR-CAN-10, DA-21); no pending edit (implied by `APPROVED`).
3. `approvers = ApproverSetResolver.resolve(creator, effective.payer, effective.participants)`, frozen in `cancellation_approvals` (BR-CAN-04).
4. Insert `expense_cancellation_requests` (`OPEN`, `expense_version_id = effective`).
5. If approvers = ∅ (a sole-participant creator expense): auto-approve the request (`auto_approved = true`) and apply the cancellation immediately. Audit `CANCELLATION_AUTO_APPROVED` and `EXPENSE_CANCELLED`.
6. Otherwise create `CANCELLATION_APPROVAL_REQUESTED` notifications (one per approver, D26). Audit `CANCELLATION_REQUESTED`.

The expense **stays `APPROVED` and effective** while the request is `OPEN` (D14, BR-CAN-05).

### 4.2 Decide

**TX(RW, lock = group)**

1. Load the request and its expense. `requireActiveMemberOfActiveGroup`. The actor must be in the frozen set and undecided. The creator is never in the set.
2. The request must be `OPEN`, otherwise `ALREADY_RESOLVED`.
3. **Approve**: record it. If it is the last: request `APPROVED` (`resolved_at`), then `expense.applyCancellation`: the effective version becomes `CANCELLED`, the expense `CANCELLED`, `effective_version_id = NULL`, `cancelled_at = now`. Audit `CANCELLATION_DECISION_RECORDED`, `CANCELLATION_APPROVED`, `EXPENSE_CANCELLED`.
4. **Reject**: the reason is required (DA-27). Request `REJECTED`. The expense is unchanged (`APPROVED`). Audit `CANCELLATION_DECISION_RECORDED`, `CANCELLATION_REJECTED`.

### 4.3 After rejection (DA-19)

The creator may open a **new** request later. It gets a new row, a new frozen snapshot, and new notifications. The earlier request and its decisions stay in history. At most one `OPEN` request exists at a time. This is the documented conservative choice for §6.3: allowing a new request never changes balances without unanimous consent, and it gives a way to fix errors given that payments are final.

## 5. Payments are not touched (D14, D40)

Cancellation never updates or deletes `payments`. Balances are recomputed from the remaining effective expenses and **all** completed payments. If payments had already been made against the cancelled expense, the net balances may now point the other way (e.g., the creditor now owes the debtor). The new settlement plan reflects this (worked example in [Settlement_Algorithm §5.9](Settlement_Algorithm.md#59-example-9-payments-completed-before-cancellation)).

## 6. Interactions with other workflows

| Situation | Behavior |
| --- | --- |
| Edit attempted while a request is `OPEN` | Refused, `CANCELLATION_PENDING` (DA-39) |
| A request attempted while an edit is pending | Impossible: the status is `PENDING_APPROVAL`, so the direct-cancel rules apply (blocked if `ever_approved`) |
| A cancellation approver tries to leave the group | Blocked (unresolved responsibility, BR-GRP-06) |
| Archive attempted with an `OPEN` request | Blocked (BR-ARC-02) |
| No deadline | Requests stay `OPEN` indefinitely (D41, DA-02) |

## 7. State machine (request)

`OPEN --approve [last approver]--> APPROVED` (expense → `CANCELLED`)
`OPEN --approve [others remain]--> OPEN`
`OPEN --reject [reason]--> REJECTED` (expense unchanged)
`[*] --open [approvers = ∅]--> APPROVED (auto)`

## 8. Audit

`CANCELLATION_REQUESTED` (approver IDs, reason), `CANCELLATION_DECISION_RECORDED`, `CANCELLATION_APPROVED`, `CANCELLATION_AUTO_APPROVED`, `CANCELLATION_REJECTED` (reason), `EXPENSE_CANCELLED` (path DIRECT | REQUEST, request ID).
