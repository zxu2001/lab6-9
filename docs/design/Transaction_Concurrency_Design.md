# Transaction and Concurrency Design

| Decisions | D19, D24, D29, D16, D37 |
| --- | --- |
| Requirements | FR-026, FR-047, NFR-009 |
| Assumptions | DA-05 |
| UML | [38_Sequence_Concurrent_Payment_Submission](../uml/38_Sequence_Concurrent_Payment_Submission.puml), [39_Sequence_Archive_Group](../uml/39_Sequence_Archive_Group.puml), [32_Sequence_Edit_Approved_Expense](../uml/32_Sequence_Edit_Approved_Expense.puml) |
| Tests | CON-01–CON-12, IT-TX-01–IT-TX-05 |

## 1. Transaction boundaries

- **One use case = one transaction**, declared on the public application-service method (`@Transactional(rollbackFor = Exception.class)`). Controllers are not transactional. `spring.jpa.open-in-view=false`.
- Isolation: **READ COMMITTED** (PostgreSQL default), plus explicit locks where correctness needs serialization.
- Read-only queries: `@Transactional(readOnly = true)`. A single snapshot per statement is acceptable for display.
- Side effects outside the DB (email) run **after commit** (`@TransactionalEventListener(AFTER_COMMIT)`) and never inside the transaction.
- Audit events and notifications are written **inside** the same transaction as the change. They commit or roll back together (D19).

## 2. Locking strategy

| Mechanism | Where | Purpose |
| --- | --- | --- |
| **Group ledger lock**: `SELECT id, status, version FROM expense_groups WHERE id = ? FOR UPDATE` via `GroupRepository.lockById` (`@Lock(PESSIMISTIC_WRITE)`) | Every operation that changes or depends on the group ledger, or on group status/membership eligibility (table §3) | Serializes these operations per group. The settlement plan and balances seen inside the transaction cannot change until commit. |
| **Optimistic `@Version`** | `users`, `expense_groups`, `group_memberships`, `group_invitations`, `expense_categories`, `expenses`, `expense_approvals`, `expense_cancellation_requests`, `cancellation_approvals` | Detects lost updates from stale forms (the form carries `expectedVersion` / `basedOnVersionNumber`) and concurrent decisions |
| **Unique constraints as race backstops** | `ux_payment_idempotency`, `ux_version_one_live`, `ux_cancel_one_open`, `ux_invitation_one_pending`, `ux_approval_approver`, `ux_notification_per_*`, `ux_users_email` | Even under a bug, duplicates fail at commit |
| **Lock timeout** | `SET LOCAL lock_timeout = '5s'` (Hikari `connection-init-sql` or `@QueryHints`) | Bounded waits |
| **Lock ordering** | Group row first, then aggregate rows (expense, request, invitation) | Deadlock avoidance |

Why pessimistic locking is used here: the payment amount depends on an aggregate across many rows (all effective versions and payments). Optimistic locking on any single row cannot detect that a *different* row changed the obligation. Locking the group row gives per-group serializability for exactly those operations, with negligible contention at the expected scale (NFR-017).

## 3. Operation catalogue

| Operation | TX | Group lock | `@Version` checks | Unique backstop |
| --- | --- | :-: | --- | --- |
| Register / verify / reset | RW | — | users | `ux_users_email`, token hashes |
| Create group | RW | — (new row) | none | none |
| Transfer ownership | RW | ✓ | group | none |
| Issue / accept invitation | RW | ✓ | invitation | `ux_invitation_one_pending`, `ux_membership_group_user` |
| Revoke invitation | RW | — | invitation | none |
| Leave / remove member | RW | ✓ | membership | none |
| Category create/rename/deactivate | RW | — | category | `ux_category_group_active_name` |
| Create expense | RW | ✓ (archive boundary, auto-approval) | none | none |
| Edit expense | RW | ✓ | expense (+ `basedOnVersionNumber`) | `ux_version_one_live` |
| Approve / reject expense | RW | ✓ | expense, approval | `ux_approval_approver` |
| Cancel pending / request / decide cancellation | RW | ✓ | expense, request, approval | `ux_cancel_one_open` |
| Record settlement | RW | ✓ | none (immutable insert) | `ux_payment_idempotency` |
| Archive group | RW | ✓ | group | none |
| Mark notification read | RW | — | none (idempotent) | none |
| Balances, plan, reports, history | RO | — | none | none |

## 4. Failure handling and retry

| Failure | Detection | Handling |
| --- | --- | --- |
| Validation / business rule | Domain exception | Rollback; show errors; no retry |
| `OptimisticLockException` (stale form) | JPA at flush/commit | Rollback → `ConcurrentModificationException` → 409 "Reload and try again". **No automatic retry**: the user's intent was based on stale data. |
| Lock timeout (`55P03`) or deadlock (`40P01`) | `PessimisticLockingFailureException` / `CannotAcquireLockException` | Rollback; **one** automatic retry of the whole service method (a `RetryOnLockFailure` aspect in the application layer, max 1 retry, 100–300 ms jitter); then 503 "System busy, please retry" |
| Unique violation on an idempotency key | `DataIntegrityViolationException` | Rollback; re-read the payment by key; return `ALREADY_RECORDED` |
| Other unique violations (e.g., one-live-version) | `DataIntegrityViolationException` | Rollback → 409. Logged as a potential bug, since the service checks should have prevented it. |
| `LedgerInconsistencyException` | Domain | Rollback; 500; error log + alarm |
| SES failure | After commit | Logged; user can resend; no rollback |

Retries never wrap side effects that escaped the transaction (none exist inside it by design).

## 5. Concurrency scenarios (summary; tests in [Concurrency_Test_Cases](../testing/Concurrency_Test_Cases.md))

| ID | Scenario | Expected |
| --- | --- | --- |
| CON-01 | Two payments, same debtor/creditor, different tokens | One payment; the second gets `ZERO_OBLIGATION` |
| CON-02 | Same token submitted twice | One payment; the second gets `ALREADY_RECORDED` |
| CON-03 | Payment vs. approval finalization of an expense affecting the debtor | Serialized; the payment amount reflects whichever committed first |
| CON-04 | Archive vs. expense creation | Exactly one succeeds as specified in [Group_Archiving_Design §5](Group_Archiving_Design.md#5-concurrency-cases) |
| CON-05 | Archive vs. payment | Serialized; no payment in an archived group |
| CON-06 | The last two approvers approve simultaneously | Expense `APPROVED` exactly once; both decisions recorded; one `EXPENSE_APPROVED` audit |
| CON-07 | Approve vs. creator edit | Either the approval lands on the old version and is then superseded, or the approval fails with `VERSION_NOT_CURRENT` |
| CON-08 | Cancellation approval vs. edit attempt | The edit is refused while the request is `OPEN`. If the edit commits first, the request cannot be opened. |
| CON-09 | Two edits from stale forms | The first wins; the second gets 409 (`STALE_VERSION`) |
| CON-10 | Ownership transfer vs. owner leave | Serialized; the leave is refused while the actor is the owner; the transfer then allows a later leave |
| CON-11 | The same invitation accepted twice concurrently | One membership; the second gets `ALREADY_USED` |
| CON-12 | Member deactivation vs. new expense including that member | Serialized: if the expense commits first, deactivation is refused (`INVOLVED_IN_PENDING_EXPENSE`); if the deactivation commits first, the expense fails validation (participant not `ACTIVE`) |

## 6. Atomicity examples

| Use case | All-or-nothing set |
| --- | --- |
| Create expense | `expenses` + `expense_versions` + allocations + approvals + receipts (+ contents, links) + notifications + audit |
| Edit approved expense | Old version → `SUPERSEDED` + new version (+ children) + expense pointers/status + notifications + audit |
| Final approval | Decision + version/expense status + effective pointer + audit |
| Approve cancellation | Decision + request status + expense/version `CANCELLED` + effective pointer cleared + audit |
| Settlement | Payment + audit |
| Archive | Invitation revocations + group status + audit |
| Accept invitation | Invitation `ACCEPTED` + membership insert/reactivate + audit |
