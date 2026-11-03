# Business Rules

This is the canonical, testable rule catalogue. Every rule has a stable ID (`BR-<area>-<nn>`) and traces to a customer decision (Dxx) or a design assumption (DA-xx) in the [Customer Decision Register](Customer_Decision_Register.md). Domain classes and application services enforce these rules. The UI may repeat a check for usability, but never replaces it.

Status vocabulary (used verbatim in every document, the schema, and the UML):

| Concept | Values |
| --- | --- |
| `UserStatus` | `PENDING_VERIFICATION`, `ACTIVE`, `DISABLED` |
| `GroupStatus` | `ACTIVE`, `ARCHIVED` |
| `MembershipStatus` | `ACTIVE`, `INACTIVE` (with `DeactivationReason` `LEFT` or `REMOVED`) |
| `InvitationStatus` | `PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED` |
| `ExpenseStatus` (aggregate) | `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `ExpenseVersionStatus` | `PENDING`, `APPROVED`, `REJECTED`, `SUPERSEDED`, `CANCELLED` |
| `ApprovalDecision` | `APPROVED`, `REJECTED` (null = awaiting decision) |
| `CancellationRequestStatus` | `OPEN`, `APPROVED`, `REJECTED` |
| `SplitMethod` | `EQUAL`, `PERCENTAGE` |
| `PaymentStatus` | `COMPLETED` |
| `NotificationType` | `EXPENSE_APPROVAL_REQUESTED`, `EXPENSE_REAPPROVAL_REQUESTED`, `CANCELLATION_APPROVAL_REQUESTED` |

## 1. Accounts and authentication (BR-AUTH)

| ID | Rule | Source |
| --- | --- | --- |
| BR-AUTH-01 | Registration requires email, display name (1–100 chars), and password. Emails are trimmed and lower-cased (normalized) and must be unique case-insensitively. | D11 |
| BR-AUTH-02 | New accounts start as `PENDING_VERIFICATION` and cannot sign in until verified. | D30 |
| BR-AUTH-03 | Passwords are 12–128 characters, must not equal the email, and are stored only as BCrypt hashes (cost ≥ 12). | D11, NFR-002 |
| BR-AUTH-04 | Verification tokens are 256-bit random, single-use, and valid for 24 h. Only their SHA-256 hash is stored. Issuing a new token invalidates earlier unused tokens for the same user. | D30, DA-07, DA-08, DA-29 |
| BR-AUTH-05 | A valid, unexpired, unused verification token sets `email_verified_at`, changes the status to `ACTIVE`, and marks the token used, all in one transaction. | D30 |
| BR-AUTH-06 | A password-reset request always returns the same generic response and timing class, whether or not the email exists. An email is sent only for `ACTIVE` or `PENDING_VERIFICATION` accounts. | D30 |
| BR-AUTH-07 | Reset tokens are single-use and valid for 30 minutes. A successful reset invalidates all other reset tokens for the user, invalidates the user's existing sessions, and clears any lockout. | D30, DA-29 |
| BR-AUTH-08 | Five consecutive failed sign-ins lock the account for 15 minutes. Verification and reset emails are limited to 3 per address per hour and 20 per IP per hour. | DA-29 |
| BR-AUTH-09 | Authentication emails (verification, reset) are sent only through `EmailService`. No financial or notification content is ever sent by email. | D31, D04 |
| BR-AUTH-10 | Sessions are server-side. The session ID is rotated on login (session-fixation protection). Idle timeout is 30 minutes. | D11 |

## 2. Groups, ownership, and membership (BR-GRP)

| ID | Rule | Source |
| --- | --- | --- |
| BR-GRP-01 | Any `ACTIVE` (verified) user may create a group. The creator becomes its single owner and its first `ACTIVE` member. | D08, D17 |
| BR-GRP-02 | Each group has exactly one owner, who is always an `ACTIVE` member. There is no administrator role. | D17 |
| BR-GRP-03 | Only the owner may transfer ownership, and only to another `ACTIVE` member of the same `ACTIVE` group. The previous owner remains an `ACTIVE` member. | D17 |
| BR-GRP-04 | Ownership confers no approval rights and no exemption from approval. | D17 |
| BR-GRP-05 | A member may leave, or the owner may remove a member, only if the member (a) is not the owner, (b) has a net balance of exactly 0.00 in the group, and (c) has no unresolved responsibilities (BR-GRP-06). | D16, D17 |
| BR-GRP-06 | Unresolved responsibilities: the member is a required approver with no decision on a `PENDING` expense version or `OPEN` cancellation request, **or** is the creator, payer, or a participant of a `PENDING` expense version, **or** is involved in the effective version of an expense that has an `OPEN` cancellation request. | D16, DA-22 |
| BR-GRP-07 | Leaving or removal sets the membership to `INACTIVE` (with reason, actor, and timestamp). Membership rows are never deleted. | D16, DA-14 |
| BR-GRP-08 | `INACTIVE` members cannot create, edit, approve, cancel, or pay. They keep read access to records they were involved in. | D16, D38, DA-31 |
| BR-GRP-09 | An `INACTIVE` member always has a net balance of 0.00 in the group (system invariant, protected by BR-GRP-05, BR-GRP-06, and BR-VER-08). | D16, DA-21 |
| BR-GRP-10 | Re-accepting an invitation as a former member reactivates the same membership row. | DA-36 |

## 3. Invitations (BR-INV)

| ID | Rule | Source |
| --- | --- | --- |
| BR-INV-01 | Only the owner of an `ACTIVE` group may issue or revoke invitations. | D08, D37 |
| BR-INV-02 | An invitation is bound to one normalized email address. It is valid for exactly 7 days from issue and is single-use. Only the SHA-256 hash of its token is stored. | D37 |
| BR-INV-03 | At most one `PENDING` invitation exists per (group, email). An invitation cannot be issued to an email belonging to a current `ACTIVE` member. | D37 |
| BR-INV-04 | Acceptance requires all of: an authenticated `ACTIVE` (verified) account whose normalized email equals the invited email; invitation status `PENDING`; `now < expires_at`; group status `ACTIVE`. | D37 |
| BR-INV-05 | Accepting sets the invitation to `ACCEPTED` (single use) and creates or reactivates an `ACTIVE` membership in the same transaction. | D08, D37 |
| BR-INV-06 | A `PENDING` invitation past `expires_at` is treated as `EXPIRED`. It is transitioned lazily on access, or by a periodic sweep. | D37 |
| BR-INV-07 | The owner may revoke a `PENDING` invitation (→ `REVOKED`). Archiving a group revokes all of its `PENDING` invitations (reason `GROUP_ARCHIVED`). | D37, D29 |
| BR-INV-08 | An acceptance attempt by a wrong account does not consume the invitation. It is rejected with a generic message and audited. | D37 |
| BR-INV-09 | Invitations are not delivered by email. The owner shares the link, and verified invitees see matching `PENDING` invitations in-app. | DA-23 |

## 4. Categories (BR-CAT)

| ID | Rule | Source |
| --- | --- | --- |
| BR-CAT-01 | Predefined categories (global and read-only): Food & Dining, Groceries, Housing & Rent, Utilities, Transportation, Travel, Entertainment, Shopping, Health, Other. | D22 |
| BR-CAT-02 | Only the owner of an `ACTIVE` group may create, rename, or deactivate that group's custom categories. Names are 1–50 characters and unique (case-insensitive) among active categories visible to the group, including the predefined ones. | D22 |
| BR-CAT-03 | Deactivated categories cannot be chosen for new versions. Existing versions keep their `category_id`. Categories are never deleted. | D22, DA-34 |
| BR-CAT-04 | Every expense version references exactly one category that was active and visible to the group at submission. | D22 |

## 5. Expenses and splits (BR-EXP, BR-SPL)

| ID | Rule | Source |
| --- | --- | --- |
| BR-EXP-01 | Any `ACTIVE` member of an `ACTIVE` group may create an expense. | D38 |
| BR-EXP-02 | An expense version contains: amount, expense date, description (1–200 chars), category, payer, split method, split participants (≥ 1) with shares, and 0–10 receipts. | UserRequirement.md, D20, D22, D27 |
| BR-EXP-03 | Amount: USD only, > 0.00 and ≤ 1,000,000.00, with at most two decimal places. Malformed, non-finite, or scientific-notation input is rejected. | D09, D18, DA-26 |
| BR-EXP-04 | The payer is exactly one `ACTIVE` member of the group. It may be anyone, including someone other than the creator. | D20, D38 |
| BR-EXP-05 | Split participants are distinct `ACTIVE` members of the group at submission. The payer may be excluded. | D20, D25 |
| BR-EXP-06 | The payer is credited the full amount. Each participant is debited exactly their allocated share. | D20 |
| BR-EXP-07 | The expense date is not later than today in the display zone. | DA-33 |
| BR-EXP-08 | Expenses are never physically deleted. They end only as `REJECTED` or `CANCELLED`. | D10, D14 |
| BR-SPL-01 | Allocation uses integer cents: `A = amount × 100`. All arithmetic is exact (BigDecimal or long). No floating point. | D09, DA-04 |
| BR-SPL-02 | **Equal split**: base = ⌊A / n⌋, r = A mod n. The r participants with the lowest `users.id` receive base + 1 cent. The others receive base. | D09, DA-35 |
| BR-SPL-03 | **Percentage split**: each pᵢ has ≤ 2 decimals with 0 < pᵢ ≤ 100, and Σpᵢ = 100.00 exactly. Express pᵢ in basis points Pᵢ (pᵢ × 100, so ΣPᵢ = 10 000). Raw share = A × Pᵢ / 10 000. floorᵢ = ⌊raw⌋, fracᵢ = (A × Pᵢ) mod 10 000. R = A − Σfloorᵢ. The R participants with the largest fracᵢ get +1 cent, ties broken by ascending `users.id`. | D09, DA-25 |
| BR-SPL-04 | Σ shares = A exactly, for every version (invariant). | D09 |
| BR-SPL-05 | Shares may be 0.00 (e.g., $0.02 / 3). Such participants remain participants and approvers. | DA-38 |
| BR-SPL-06 | The allocation is independent of input order: the same inputs give the same output. | DA-15 |

Worked examples (see [Settlement_Algorithm](../design/Settlement_Algorithm.md) for more):

- $100.00 / 3 equal, ids 7 < 9 < 12 → 33.34 (7), 33.33 (9), 33.33 (12). Sum 100.00.
- $0.02 / 3 equal, ids 7 < 9 < 12 → 0.01 (7), 0.01 (9), 0.00 (12). Sum 0.02.

## 6. Approval (BR-APR)

| ID | Rule | Source |
| --- | --- | --- |
| BR-APR-01 | Required approvers of a version = (participants ∪ {payer}) − {creator}, deduplicated and ordered by `users.id`. The set is frozen when the version is submitted. | D35 |
| BR-APR-02 | If the required-approver set is empty, the version is approved automatically on submission. `auto_approved = true` is recorded, along with the audit event `EXPENSE_AUTO_APPROVED`. | D15 |
| BR-APR-03 | Only a member in the frozen approver set may decide on that version. The creator can never decide. The owner has no override. | D02, D17 |
| BR-APR-04 | Each approver decides at most once per version. Decisions are immutable. | D02, D19 |
| BR-APR-05 | A rejection requires a reason (1–500 chars) and immediately sets the version to `REJECTED` and the expense to `REJECTED`. Undecided approvers no longer need to act. | D02, D28, DA-27 |
| BR-APR-06 | When the last required approver approves, the version becomes `APPROVED` and the expense becomes `APPROVED`, with `effective_version_id` set to this version. | D02 |
| BR-APR-07 | Decisions are accepted only on the expense's current `PENDING` version. Decisions on superseded or cancelled versions are rejected with a conflict. | D10 |
| BR-APR-08 | Approvals do not expire, and there are no reminders or escalation. | D41, DA-01 |
| BR-APR-09 | An approver must be an `ACTIVE` member of the `ACTIVE` group when deciding (BR-GRP-06 guarantees they cannot have left). | D02, D16 |

## 7. Versioning and editing (BR-VER)

| ID | Rule | Source |
| --- | --- | --- |
| BR-VER-01 | Only the creator, while an `ACTIVE` member of an `ACTIVE` group, may edit an expense whose status is `PENDING_APPROVAL` or `APPROVED`. | D10, D38 |
| BR-VER-02 | An edit creates version n+1 with a full immutable snapshot: amount, date, description, category, payer, split method, allocations, receipt set, and frozen approver set. Version content is never updated. | D10, D25, D27 |
| BR-VER-03 | The prior current version becomes `SUPERSEDED`. Its decisions are kept as history but no longer count. | D10 |
| BR-VER-04 | Editing an `APPROVED` expense sets `effective_version_id = NULL` and the status to `PENDING_APPROVAL` in the same transaction. The expense stops affecting balances immediately. | D10 |
| BR-VER-05 | At most one version per expense is in status `PENDING` or `APPROVED` (DB partial unique index). Only `effective_version_id` contributes to the ledger. | D10, §6.2 |
| BR-VER-06 | Rejected and cancelled expenses cannot be edited. | D28, D14 |
| BR-VER-07 | An edit must change something (fields, participants, percentages, payer, or receipts). | DA-32 |
| BR-VER-08 | An `APPROVED` expense cannot be edited if a payer or participant of its effective version is `INACTIVE`. | DA-21 |
| BR-VER-09 | No edit while a cancellation request is `OPEN`. | DA-39 |
| BR-VER-10 | The edit must state the version number it was based on. A mismatch is an optimistic-lock conflict, and nothing changes. | D19 |
| BR-VER-11 | Rejection of an edited version rejects the whole expense (see DA-18). | D02, D28 |

## 8. Cancellation (BR-CAN)

| ID | Rule | Source |
| --- | --- | --- |
| BR-CAN-01 | The creator may directly cancel an expense in `PENDING_APPROVAL` that **has never had an approved version**. The version and the expense become `CANCELLED`. | D14, DA-17 |
| BR-CAN-02 | An expense in `PENDING_APPROVAL` with a previously approved (now `SUPERSEDED`) version cannot be cancelled until its pending edit is approved or rejected. | DA-17 |
| BR-CAN-03 | For an `APPROVED` expense, only the creator may open a cancellation request (an optional reason of ≤ 500 chars). At most one `OPEN` request per expense. | D14, DA-19, DA-20 |
| BR-CAN-04 | Required cancellation approvers = (participants ∪ {payer}) of the **effective version** − {creator}, frozen when the request opens. An empty set auto-approves (audited). | D14, D15, D35 |
| BR-CAN-05 | While a request is `OPEN`, the expense stays `APPROVED` and keeps affecting balances. | D14 |
| BR-CAN-06 | Unanimous approval → request `APPROVED`. Expense and effective version become `CANCELLED`, `effective_version_id = NULL`, and the expense stops affecting balances. | D14 |
| BR-CAN-07 | Any rejection (reason required) → request `REJECTED`. The expense remains `APPROVED` and unchanged. | D14, DA-27 |
| BR-CAN-08 | After a rejection, a new request may be opened (new frozen snapshot). | DA-19 |
| BR-CAN-09 | Cancellation never edits, deletes, or reverses payments. Balances are recomputed from the remaining effective expenses and all completed payments, which may reverse a settlement direction. | D14, D40 |
| BR-CAN-10 | A cancellation request cannot be opened if a payer or participant of the effective version is `INACTIVE`. | DA-21 |

## 9. Balances and settlement (BR-BAL, BR-SET)

| ID | Rule | Source |
| --- | --- | --- |
| BR-BAL-01 | Net balance of member m in group g = Σ(amount of effective versions with payer m) − Σ(shares of m in effective versions) + Σ(completed payments with debtor m) − Σ(completed payments with creditor m). Positive means others owe m. | D20, D34 |
| BR-BAL-02 | "Effective versions" are exactly the versions referenced by `expenses.effective_version_id` where the expense status is `APPROVED`. | D02, D10, D14 |
| BR-BAL-03 | Σ net balances over all members of a group = 0.00 exactly (invariant). | D34, DA-03 |
| BR-BAL-04 | Balances are computed per group only. No offsetting across groups. | D21 |
| BR-BAL-05 | Balances are derived on demand and never persisted as authoritative values. | DA-12 |
| BR-SET-01 | The settlement plan is computed by the deterministic greedy algorithm in [Settlement_Algorithm](../design/Settlement_Algorithm.md). It has ≤ (k − 1) transfers for k members with non-zero balance. It is not guaranteed globally minimal. | D34 |
| BR-SET-02 | The plan is a derived recommendation. It is recomputed from the ledger on every request and never stored. | D34, DA-12 |
| BR-SET-03 | Applying every transfer in a plan makes every net balance 0.00. | D34 |

## 10. Payments (BR-PAY)

| ID | Rule | Source |
| --- | --- | --- |
| BR-PAY-01 | Only the debtor, an `ACTIVE` member of an `ACTIVE` group, may record a settlement. The recorder is always the debtor. | D39 |
| BR-PAY-02 | The amount of a settlement is the **current obligation** (DA-16), recomputed inside the payment transaction under the group ledger lock. The user never types an amount. | D23, D24 |
| BR-PAY-03 | If the recomputed obligation differs from the displayed amount, the current amount is used without extra confirmation. `displayed_amount`, `amount`, and `amount_adjusted = true` are stored, and the adjustment is displayed and audited. | D24 |
| BR-PAY-04 | If the recomputed obligation is 0.00, no payment is created. The user sees the updated plan. The event `PAYMENT_NOT_CREATED_ZERO_OBLIGATION` is audited. | D24 |
| BR-PAY-05 | No partial payments and no overpayments. `amount` always equals the full current obligation. | D23 |
| BR-PAY-06 | A recorded payment is immediately `COMPLETED` and final. No edit, delete, cancel, or reverse by anyone, including the owner. | D03, D40 |
| BR-PAY-07 | The payment form shows a finality warning before submission. | D40 |
| BR-PAY-08 | Each payment form carries a one-time submission token (UUID). It is unique in `payments.idempotency_key`, which prevents duplicate recording. | D24, §6.5 |
| BR-PAY-09 | Payments generate no notifications and no emails. | D26, D31 |
| BR-PAY-10 | Debtor ≠ creditor. Both are members of the same group. Amount > 0.00. | D21, D23 |

## 11. Notifications (BR-NOT)

| ID | Rule | Source |
| --- | --- | --- |
| BR-NOT-01 | Notifications are created only for: (a) a new expense version 1 with ≥ 1 required approver (`EXPENSE_APPROVAL_REQUESTED`); (b) an edited version n > 1 with ≥ 1 required approver (`EXPENSE_REAPPROVAL_REQUESTED`); (c) a cancellation request with ≥ 1 required approver (`CANCELLATION_APPROVAL_REQUESTED`). | D26 |
| BR-NOT-02 | Exactly one notification per required approver per version or request (DB unique). It is created in the same transaction as the triggering record. | D26, D19 |
| BR-NOT-03 | Notifications are persisted with read/unread status. Only the recipient may read or mark them. There is no push and no email. | D04 |
| BR-NOT-04 | A notification whose request is no longer actionable (decided, superseded, or cancelled) stays in the inbox, and its live status is shown. | D26 |

## 12. Receipts (BR-RCP)

| ID | Rule | Source |
| --- | --- | --- |
| BR-RCP-01 | Allowed types: `image/jpeg`, `image/png`, `application/pdf`, validated by magic bytes (not the extension or the client header). Images must decode, and PDFs must start with `%PDF-`. | D13, D27 |
| BR-RCP-02 | ≤ 10 MiB per file and ≤ 10 receipts per version. Empty files are rejected. | DA-24 |
| BR-RCP-03 | Content is stored as `BYTEA` with metadata (type, size, SHA-256, sanitized original filename, uploader, time). | D13 |
| BR-RCP-04 | Receipts are linked to expense versions. Unchanged receipts are linked again by reference in the new version. Adding, removing, or replacing one is an edit (BR-VER-02). | D27 |
| BR-RCP-05 | Downloads require read access to the version's expense (DA-31). They are served with `Content-Disposition: attachment`, the stored content type, and `X-Content-Type-Options: nosniff`. | D13, DA-10 |
| BR-RCP-06 | Receipt rows are never deleted. | D27 |

## 13. Archiving (BR-ARC)

| ID | Rule | Source |
| --- | --- | --- |
| BR-ARC-01 | Only the owner may archive. | D29 |
| BR-ARC-02 | Preconditions, checked atomically under the group ledger lock: every member's net balance is 0.00; no `PENDING_APPROVAL` expense exists; no `OPEN` cancellation request exists. | D29 |
| BR-ARC-03 | Archiving is irreversible (`ACTIVE → ARCHIVED`). | D36 |
| BR-ARC-04 | An archived group is read-only. No expenses, edits, approvals, cancellations, payments, invitations, category changes, ownership transfers, or membership changes. Reads and reports remain available. | D29, D37 |
| BR-ARC-05 | Groups are never deleted. | D29 |

## 14. Reporting (BR-RPT)

| ID | Rule | Source |
| --- | --- | --- |
| BR-RPT-01 | Report types: Expense, Balance, Payment, and a Cross-group overview. Reports are on screen only, with no CSV. | D05 |
| BR-RPT-02 | Filters: date range (inclusive; the expense date of the reported version, or the payment date), group member, expense category, and payment status (DA-28). | D05 |
| BR-RPT-03 | Mode `EFFECTIVE` (default) includes only effective versions and completed payments, and its totals reconcile with balances. Mode `HISTORY` includes all expenses in every status (the current version, or optionally all versions), labeled by status. It never contributes to balance totals. | §6.9 |
| BR-RPT-04 | The cross-group overview lists per-group figures side by side and never sums obligations across groups. | D21 |
| BR-RPT-05 | Reports show the applied filters, and an explicit empty state when nothing matches. | Spec US-5 |

## 15. Audit (BR-AUD)

| ID | Rule | Source |
| --- | --- | --- |
| BR-AUD-01 | Audit events are insert-only. They record the UTC time, actor (null = system), group, event type, entity, and JSON details. | D19, NFR-003 |
| BR-AUD-02 | The following are audited in the same transaction as the change: account verification and reset; invitation issue, revoke, accept, and wrong-account attempts; membership and ownership changes; category changes; expense create and edit, every approval decision, auto-approval, rejection, and cancellation request, decision, and outcome; payments (including adjustment details); zero-obligation attempts; archiving. | D14, D15, D19, D24 |
| BR-AUD-03 | Audit details never contain passwords, raw tokens, or receipt content. | NFR-002 |
