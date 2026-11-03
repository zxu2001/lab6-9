# Payment Processing Design (settlement recording)

| Decisions | D03, D18, D21, D23, D24, D26, D34, D39, D40 |
| --- | --- |
| Requirements | FR-016, FR-017, FR-045–FR-048 |
| Rules | BR-PAY-01–10, BR-SET-* |
| Assumptions | DA-16, DA-37 |
| UML | [04_Use_Case_Settlement](../uml/04_Use_Case_Settlement.puml), [23_Activity_Record_Payment](../uml/23_Activity_Record_Payment.puml), [37_Sequence_Record_Payment](../uml/37_Sequence_Record_Payment.puml), [38_Sequence_Concurrent_Payment_Submission](../uml/38_Sequence_Concurrent_Payment_Submission.puml) |
| Tests | UT-PAY-01–08, IT-MVC-05/06, IT-DB-08, IT-DB-14, CON-01–CON-03, CON-05, SEC-18, SEC-19, FIN-15–FIN-17, AT-D03, AT-D23, AT-D24, AT-D39, AT-D40 |

## 1. Concepts

- **Settlement transfer**: an entry `debtor → creditor : amount` in the group's current deterministic settlement plan ([Settlement_Algorithm §4](Settlement_Algorithm.md#4-simplified-settlement-plan-settlementplanner)).
- **Current obligation (DA-16)**: the amount of the transfer for (debtor, creditor) in the plan computed **now**, or 0.00.
- **Settlement payment**: always exactly the full current obligation (D23). It is never partial and never an overpayment. Once recorded it is `COMPLETED` (D03), immutable, and final (D40).

## 2. Interfaces

```
SettlementService                                                       // TX(RO)
  SettlementPlanView getSettlementPlan(long actor, long groupId)
SettlementPlanView(long groupId, List<MemberBalanceView> nets, List<TransferView> transfers,
                   String ledgerFingerprint, Instant computedAt)

PaymentService
  PaymentPreparation preparePayment(long actor, long groupId, long creditorUserId)     // TX(RO)
  PaymentOutcome recordSettlement(long actor, RecordSettlementCommand cmd)             // TX(RW, lock=group)
  List<PaymentView> listPayments(long actor, long groupId, PaymentFilter filter)       // TX(RO)

PaymentPreparation(long groupId, UserRef creditor, Money displayedAmount, UUID submissionToken,
                   String ledgerFingerprint, String finalityWarning)
RecordSettlementCommand(long groupId, long creditorUserId, Money displayedAmount,
                        UUID submissionToken, String ledgerFingerprint, String optionalNote)
PaymentOutcome(OutcomeType type, Long paymentId, Money settledAmount, Money displayedAmount,
               boolean adjusted, SettlementPlanView planAfter)
OutcomeType = RECORDED | RECORDED_ADJUSTED | ZERO_OBLIGATION | ALREADY_RECORDED
```

## 3. Prepare (GET confirmation page)

1. `requireActiveMemberOfActiveGroup(actor, groupId)`.
2. Compute the plan. `obligation = plan.obligation(actor, creditor)`. If it is 0.00, redirect to balances with "Nothing to settle with this member."
3. Generate `submissionToken = UUID.randomUUID()` (idempotency key, BR-PAY-08).
4. Render the confirmation with the amount, the creditor, and the **finality warning** (D40, BR-PAY-07):

> "Recording this payment is **final**. Completed payments cannot be edited, deleted, cancelled, or reversed by anyone, including the group owner. If you make a mistake, resolve it directly with the other member outside SplitSmart. The amount recorded will be your full current balance with this member at the moment you submit, which may differ from the amount shown if balances change."

The amount is **displayed only**. There is no editable amount field (D23).

## 4. Record (POST)

**TX(RW, lock = group), isolation READ COMMITTED.**

| Step | Action | Failure → result |
| --- | --- | --- |
| 1 | `group = groupRepository.lockById(groupId)`: `SELECT … FOR UPDATE` with `lock_timeout = 5 s` | Timeout → `ConcurrentModificationException` → "Please retry" |
| 2 | `group.requireActive()` | `GroupArchivedException` (409) |
| 3 | `authz.requireActiveMemberOfActiveGroup(actor, groupId)`; creditor is an `ACTIVE` member and ≠ actor | 404 / 403 |
| 4 | Idempotency: `paymentRepository.findByIdempotencyKey(token)`. If found, return `ALREADY_RECORDED` with that payment (a replay; no new row). | n/a |
| 5 | `postings = ledgerQuery.findPostings(groupId)` → `nets = BalanceCalculator…` → `plan = SettlementPlanner.plan(nets)`. This reads current committed data, and no other ledger writer can commit concurrently. | `LedgerInconsistencyException` → 500 + alert |
| 6 | `obligation = plan.obligation(actor, creditor)` | n/a |
| 7 | If `obligation == 0.00`: audit `PAYMENT_NOT_CREATED_ZERO_OBLIGATION` (displayed, debtor, creditor) and return `ZERO_OBLIGATION` with `planAfter = plan`. **No payment row** (D24). | n/a |
| 8 | **Authorization on the actual amount**: the actor is the debtor of that transfer (by construction of `plan.obligation(actor, …)`; asserted again by `Payment.settle`). Only the debtor can reach step 9 (D39). | `ForbiddenException` |
| 9 | `payment = Payment.settle(groupId, transfer, actor, displayedAmount, token, note, today, now)`: amount = obligation, `amount_adjusted = (displayed ≠ obligation)`, status `COMPLETED`, recorded_by = debtor | n/a |
| 10 | Insert. The unique `idempotency_key` is the backstop for any race that bypassed step 4 (impossible under the lock, but defended) → `DataIntegrityViolation` → treated as `ALREADY_RECORDED` after rollback and re-read | n/a |
| 11 | Audit `PAYMENT_RECORDED` (payment ID, debtor, creditor, amount, displayed, adjusted, ledgerFingerprint before and after) | n/a |
| 12 | Commit. Return `RECORDED` or `RECORDED_ADJUSTED` with `planAfter` recomputed. | n/a |

**Post**: exactly one `COMPLETED` payment, equal to the debtor's full obligation to that creditor at commit time. The debtor's transfer to that creditor in the new plan is 0.00. There is no notification and no email (BR-PAY-09).

**Presentation**: PRG redirect to `/groups/{g}/balances`. A flash message by outcome:

| Outcome | Message |
| --- | --- |
| `RECORDED` | "Payment of $X to Y recorded." |
| `RECORDED_ADJUSTED` | "Payment of **$X** to Y recorded. The amount shown earlier ($D) changed because balances were updated before you submitted." (D24: display the adjustment) |
| `ZERO_OBLIGATION` | "No payment was recorded: you no longer owe Y anything in this group. Balances changed since the page was loaded." |
| `ALREADY_RECORDED` | "This payment was already recorded." |

## 5. Why this is safe under concurrency (§6.5)

| Hazard | Control |
| --- | --- |
| Stale displayed amount | The amount is recomputed under the lock (step 5). The displayed value is informational only. |
| Two submissions (two tabs, different tokens) | Serialized by the group lock. The second recomputes and finds an obligation of 0, so no payment (CON-01). |
| Double click / browser retry (same token) | Step 4 replay plus the unique key (CON-02) |
| Concurrent expense approval changing balances | Approval finalization also takes the group lock, so the operations are serialized (CON-03) |
| Concurrent archive | The same lock, plus the step 2 re-check (CON-05) |
| Creditor or other member recording | Step 8 plus `ck_payment_recorder` (DB) (SEC-18) |
| Editing or reversing later | No API; `trg_payments_immutable`; no `UPDATE`/`DELETE` grant (IT-DB-08, IT-DB-14) |
| Lock waits | `lock_timeout 5 s`. One automatic retry of the whole transaction on a lock timeout or deadlock (`SQLSTATE 55P03` / `40P01`), then a "please retry" message |

## 6. Edge cases

| Case | Behavior |
| --- | --- |
| Debtor owes several creditors | One settlement per creditor transfer (each full) |
| Plan reshuffles after another member's payment | The current pair obligation is used, possibly 0 or a different amount ([Settlement_Algorithm §5.12](Settlement_Algorithm.md#512-example-12-settlement-plan-changes-after-another-payment)) |
| Cancellation after payments | Payments remain. The direction may reverse, and the former creditor now settles ([§5.9](Settlement_Algorithm.md#59-example-9-payments-completed-before-cancellation)). |
| Payment note | Optional, ≤ 200 chars, plain text, escaped on output |
| Payment date | The UTC recording date (DA-37). Back-dating is not supported. |
