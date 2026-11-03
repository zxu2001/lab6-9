# Financial Ledger Design

| Decisions | D02, D09, D10, D14, D18, D20, D21, D23, D24, D34, D40 |
| --- | --- |
| Assumptions | DA-03, DA-04, DA-12, DA-16 |
| Related | [Settlement_Algorithm](../design/Settlement_Algorithm.md) · [Payment_Processing_Design](../design/Payment_Processing_Design.md) · [Transaction_Concurrency_Design](../design/Transaction_Concurrency_Design.md) · [35_Sequence_Calculate_Balances](../uml/35_Sequence_Calculate_Balances.puml) |

## 1. Authoritative versus derived data

| Category | Records | Stored? | Mutable? |
| --- | --- | --- | --- |
| **Authoritative financial records** | `expense_versions` (amount, payer), `expense_allocations` (shares), `expenses.status` + `effective_version_id` (which version counts), `payments` | Yes | Version content and payments are immutable. Only expense lifecycle pointers change, through audited transitions. |
| **Authoritative workflow records** | `expense_approvals`, `expense_cancellation_requests`, `cancellation_approvals`, `audit_events` | Yes | Decisions are written once |
| **Derived (never stored)** | Ledger postings (`v_ledger_postings`), net balances, settlement plan, current obligation, report totals | No (computed per request) | n/a |

There is no `balances` table, so no stored balance can drift from its sources (DA-12, BR-BAL-05).

## 2. Posting model (double-entry style)

Each contributing source record yields a set of postings whose deltas sum to exactly zero (DA-03).

| Source | Postings (user: delta) | Σ |
| --- | --- | --- |
| Effective version of an `APPROVED` expense, amount A, payer P, shares sᵢ for participants i | P: **+A**; each participant i: **−sᵢ** | A − Σsᵢ = 0 (BR-SPL-04) |
| Completed payment x from debtor D to creditor C | D: **+x**; C: **−x** | 0 |

Sign convention: a **positive** net balance means the group owes the member money (creditor). A **negative** one means the member owes the group (debtor).

The payer excluded from the split (D20): Alice pays $90 for Bob and Carol. Postings: Alice +90.00, Bob −45.00, Carol −45.00. Net: Alice +90, Bob −45, Carol −45. Σ = 0.

## 3. What contributes to the ledger

| Expense state | Contributes? | Reason |
| --- | --- | --- |
| `PENDING_APPROVAL` (v1, never approved) | No | D02 |
| `APPROVED` | Yes, exactly its `effective_version_id` | D02 |
| `PENDING_APPROVAL` after editing an approved expense | **No.** `effective_version_id` was cleared in the edit transaction. | D10 |
| `APPROVED` with an `OPEN` cancellation request | Yes | D14 |
| `CANCELLED` | No | D14 |
| `REJECTED` | No | D02, D28 |
| Superseded versions | Never | D10 |

At most one version contributes per expense. This is guaranteed by the single pointer `effective_version_id`, by `ck_expense_effective`, and by `ux_version_one_live` (§6.2 of the instruction).

Payments contribute always and forever (D40). They are never reversed when an expense is edited or cancelled (D14). Instead, the net balances are recomputed, and the settlement direction may flip (§5, example B).

## 4. Invariants

| ID | Invariant | Enforcement / test |
| --- | --- | --- |
| LI-1 | For every version: Σ shares = amount | `SplitAllocator`, deferred trigger `trg_version_allocation_totals`; UT-SPL-10, IT-DB-12 |
| LI-2 | For every group: Σ net balances = 0.00 | Follows from LI-1 and the payment postings; UT-BAL-03, IT-DB-12 |
| LI-3 | Each expense contributes ≤ 1 version | `ck_expense_effective`, `ux_version_one_live`; IT-DB-07 |
| LI-4 | Payments are immutable and never deleted | Trigger + grants; IT-DB-08 |
| LI-5 | `INACTIVE` members have net 0.00 | BR-GRP-05/06, BR-VER-08, BR-CAN-10; UT-GRP-01–04, CON-12 |
| LI-6 | No cross-group postings: every posting's user is a member of the posting's group | Composite FKs; IT-DB-11 |
| LI-7 | All arithmetic is exact. No `float`/`double`. | UT-ARCH-03 |
| LI-8 | Applying the full settlement plan yields all nets = 0.00 | UT-SET-08 |

## 5. Worked ledger scenarios

**A. Edited approved expense (D10).** Group {Alice(1), Bob(2), Carol(3)}. E1 v1 is approved: Alice paid $60 for all three equally (20.00 each). Nets: Alice +40, Bob −20, Carol −20. Alice edits v1 → v2 ($90). In the same transaction, E1 → `PENDING_APPROVAL` and `effective = NULL`. Nets are now all 0.00 (E1 contributes nothing). When Bob and Carol approve v2: Alice +60, Bob −30, Carol −30.

**B. Cancellation after payment (D14, D40).** Same group. E1 is approved: Alice paid $90 for Bob and Carol (45 each). Bob pays Alice $45 (payment P1). Nets: Alice +45, Bob 0, Carol −45. Alice requests cancellation, and Bob and Carol approve. E1 → `CANCELLED`. P1 remains. Postings left: P1 only (Bob +45, Alice −45). Nets: **Alice −45, Bob +45**, Carol 0. The direction has flipped: Alice now owes Bob $45. The new plan says "Alice → Bob $45". The history (E1, the cancellation decisions, P1) stays fully visible.

**C. Cancellation request rejected.** E1 stays `APPROVED`. Postings are unchanged throughout (BR-CAN-05/07).

## 6. Derivation pipeline

```
LedgerQueryRepository.findPostings(groupId)      ← v_ledger_postings (SQL) or JPA projection
        │  List<LedgerPosting(userId, delta: Money, source)>
        ▼
BalanceCalculator.netBalances(members, postings) → SortedMap<userId, Money>  (pure domain)
        ▼
SettlementPlanner.plan(netBalances)               → SettlementPlan (List<Transfer>) (pure domain)
        ▼
PaymentService.currentObligation(plan, debtor, creditor) → Money (0.00 if no transfer)
```

The SQL aggregate query (schema doc §2.10) and `BalanceCalculator` must agree. Integration test IT-DB-12 asserts that equality on generated data. The domain calculator is authoritative for application decisions. The SQL aggregate is used only for reports and performance checks.

## 7. Consistency under concurrency

All writes that change postings (approval finalization, an edit of an approved expense, cancellation finalization, payment) and all decisions that depend on the full ledger (payment amount, archive eligibility, deactivation eligibility) run in a transaction holding `SELECT … FOR UPDATE` on the group's `expense_groups` row. That makes them serializable **per group**: a payment always computes its obligation from a ledger state that no concurrent writer can change before it commits. Details: [Transaction_Concurrency_Design](../design/Transaction_Concurrency_Design.md).

Read-only balance views do not take the lock. They read a committed snapshot (READ COMMITTED, one statement), which may be stale by the time the user acts. D24 handles that staleness at submission time.
