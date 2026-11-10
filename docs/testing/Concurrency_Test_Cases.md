# Concurrency Test Cases (CON-01–CON-12)

`@SpringBootTest` + Testcontainers PostgreSQL. Each case starts two transactions on two threads using `TransactionTemplate`. Synchronization uses `CountDownLatch` (e.g., T1 signals after acquiring the group lock; T2 starts and must block). There is no `Thread.sleep`-based timing. A test asserts that T2 is blocked by polling `pg_locks` / `pg_stat_activity.wait_event_type = 'Lock'` with a bounded timeout. Design: [Transaction_Concurrency_Design](../design/Transaction_Concurrency_Design.md). Not implemented in this phase.

| ID | Setup | T1 | T2 | Expected outcome | Req |
| --- | --- | --- | --- | --- | --- |
| CON-01 | Plan B→A 48.33 | `recordSettlement(B→A, token K1)`. Holds the lock until T2 is waiting, then commits. | `recordSettlement(B→A, token K2)` | Exactly 1 payment (48.33). T2 → `ZERO_OBLIGATION`. Audit has 1 `PAYMENT_RECORDED` + 1 `PAYMENT_NOT_CREATED_ZERO_OBLIGATION`. | D23, D24 |
| CON-02 | Same | Settle with K1 | Settle with **K1** (double click) | 1 payment; T2 → `ALREADY_RECORDED` | BR-PAY-08 |
| CON-03 | FIN-01 state (plan B→A 33.33). Pending expense X: creator and payer C, $30 for {B, C}, so the only approver is B. | B approves X in tab 1 (last approval; commits first) | B settles A in tab 2 (displayed 33.33) | Payment = 48.33 (adjusted). Reversed order (payment first): payment 33.33, and after X the new plan has B→A 15.00. Both orders give consistent nets with Σ = 0. | D24, NFR-009 |
| CON-04 | Group eligible for archive | `archiveGroup` holds the lock | `createExpense` | Archive commits; the expense fails with `GroupArchivedException`. Reversed order: the expense commits and the archive is refused (`UNRESOLVED_EXPENSE_APPROVALS`). | D29 |
| CON-05 | Last obligation B→A 10 | B settles (commits first) | Owner archives | The archive succeeds after the payment (nets now 0). Reversed order: the archive is refused (non-zero), then the payment succeeds. Never a payment in an archived group. | D29 |
| CON-06 | Approvers {B, C}; both undecided | B approves | C approves | Expense `APPROVED` once; 2 decisions; 1 `EXPENSE_APPROVED` audit; `effective` set once | D02 |
| CON-07 | Pending v1, approver B | B approves v1 | A edits (v1 → v2) | If T1 commits first: v1 decision recorded, then v2 created (decision moot). If T2 first: T1 → `VERSION_NOT_CURRENT`. Never an approval counted on v2 from a v1 decision. | D10 |
| CON-08 | Approved, cancellation request `OPEN` (approvers {B, C}) | C approves the cancellation (last) | A attempts an edit | If T1 first: the expense is `CANCELLED`, so the edit is refused (`CANCELLED_IS_FINAL`). If T2 first: the edit is refused (`CANCELLATION_PENDING`). | D14, DA-39 |
| CON-09 | Pending v1 | A edits from a form based on v1 | A edits from a second tab based on v1 | One v2 created; the other → 409 `STALE_VERSION` | D19 |
| CON-10 | Owner A, member B | A transfers ownership to B | A leaves | Serialized. The leave succeeds only if the transfer committed first (and A's balance is 0). Otherwise `OWNER_MUST_TRANSFER`. | D17 |
| CON-11 | `PENDING` invitation for Bob | Bob accepts (tab 1) | Bob accepts (tab 2) | One membership; the second → `ALREADY_USED` | D37 |
| CON-12 | Carol `ACTIVE`, net 0 | Carol leaves | A creates an expense with participant Carol | If T1 first: the expense fails (participant not `ACTIVE`). If T2 first: the leave is refused (`INVOLVED_IN_PENDING_EXPENSE`). Never an `INACTIVE` member with a pending responsibility. | D16, LI-5 |

Optimistic-locking-specific checks (no group lock involved):

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| CON-OL-1 | Category version 3 | Two renames with `expectedVersion = 3` | One succeeds; the other → 409 | D19 |
| CON-OL-2 | Invitation version 0 | Revoke (owner) and accept (Bob) concurrently | Exactly one terminal state (`REVOKED` or `ACCEPTED`); the loser gets a conflict or "no longer valid" | D19, D37 |
