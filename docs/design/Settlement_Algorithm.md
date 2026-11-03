# Settlement Algorithm (Split Allocation, Net Balances, Simplified Settlement)

| Decisions | D09, D18, D20, D21, D23, D24, D34 |
| --- | --- |
| Rules | BR-SPL-01–06, BR-BAL-01–05, BR-SET-01–03, BR-PAY-02–05 |
| Assumptions | DA-04, DA-12, DA-15, DA-16, DA-25, DA-35, DA-38 |
| Components | `domain.finance.Money`, `Percentage`, `SplitAllocator`, `BalanceCalculator`, `SettlementPlanner`, `SettlementPlan`, `Transfer`; `application.service.SettlementService`, `PaymentService` |
| UML | [22_Activity_Calculate_Settlement](../uml/22_Activity_Calculate_Settlement.puml), [35_Sequence_Calculate_Balances](../uml/35_Sequence_Calculate_Balances.puml), [36_Sequence_Generate_Settlement_Plan](../uml/36_Sequence_Generate_Settlement_Plan.puml), [38_Sequence_Concurrent_Payment_Submission](../uml/38_Sequence_Concurrent_Payment_Submission.puml) |
| Tests | UT-SPL-*, UT-BAL-*, UT-SET-*, UT-PAY-*, FIN-01–FIN-20, CON-01–CON-03 |

## 1. Arithmetic rules

1. Every monetary value is a `Money`: a `BigDecimal` with scale exactly 2, currency USD (D18). Construction rejects scale > 2 after stripping trailing zeros, non-numeric input, scientific notation, NaN or infinite values, and values outside the allowed range for that context.
2. Algorithms work in **integer cents** (`long`): `cents = money.amount().movePointRight(2).longValueExact()`. Results convert back with `BigDecimal.valueOf(cents, 2)`. There are no `float`/`double` values and no division producing non-terminating decimals.
3. Percentages are `Percentage` values: `BigDecimal` with scale ≤ 2, 0 < p ≤ 100. Internally they are basis points `P = p × 100` (an integer, Σ = 10 000).
4. Every algorithm is deterministic. Ordering ties are broken by ascending `users.id` (DA-35). No hash-map iteration order is relied on (`TreeMap` or explicit sorting).

## 2. Split allocation (`SplitAllocator`)

### 2.1 Interface (design signature)

```
Allocation allocateEqual(Money amount, SortedSet<Long> participantIds)
Allocation allocatePercentage(Money amount, SortedMap<Long, Percentage> percentages)
  -> Allocation: SortedMap<Long participantId, Money share>   (Σ share == amount)
  throws ValidationException(field, code)
```

### 2.2 Equal split (BR-SPL-02)

Input: A cents > 0, participants p₁ < p₂ < … < pₙ (by `users.id`), n ≥ 1.

```
base = A div n ;  r = A mod n
share(p_k) = base + 1   if k <= r
           = base       otherwise
```

### 2.3 Percentage split (BR-SPL-03)

Input: A cents and Pᵢ basis points with ΣPᵢ = 10 000 (otherwise `ValidationException("percentages", "SUM_NOT_100")`).

```
num_i   = A × P_i                (long; max 10^8 × 10^4 = 10^12, safe)
floor_i = num_i div 10 000
frac_i  = num_i mod 10 000
R       = A − Σ floor_i          (0 ≤ R < n)
order participants by (frac_i DESC, participantId ASC); first R participants get floor_i + 1
```

For equal splits all fractional parts are equal, so the same rule reduces to "lowest IDs first". One `CentDistributor` therefore serves both methods.

### 2.4 Allocation examples

| # | Input | Computation | Result | Σ |
| --- | --- | --- | --- | --- |
| A1 | $100.00 equal over ids {1, 2, 3} | A = 10000, base = 3333, r = 1 | 1: 33.34, 2: 33.33, 3: 33.33 | 100.00 |
| A2 | $0.02 equal over {1, 2, 3} | A = 2, base = 0, r = 2 | 1: 0.01, 2: 0.01, 3: 0.00 | 0.02 |
| A3 | $100.00 at 33.33/33.33/33.34 % over {1, 2, 3} | num = 33 330 000, 33 330 000, 33 340 000; floors 3333, 3333, 3334; R = 0 | 33.33, 33.33, 33.34 | 100.00 |
| A4 | $10.00 at 33.33/33.33/33.34 % | num = 3 333 000, 3 333 000, 3 334 000 → floors 333, 333, 333; fracs 3000, 3000, 4000; R = 1 → id 3 (largest frac) | 3.33, 3.33, 3.34 | 10.00 |
| A5 | $0.01 at 99/1 % over {1: 99, 2: 1} | num = 9900, 100 → floors 0, 0; fracs 9900, 100; R = 1 → id 1 | 1: 0.01, 2: 0.00 | 0.01 |
| A6 | $50.00 equal over {7} | base = 5000, r = 0 | 7: 50.00 | 50.00 |
| A7 | Percentages 50 + 49.99 | Σ = 9999 ≠ 10 000 | `ValidationException` | none |

## 3. Net balances (`BalanceCalculator`)

```
SortedMap<Long, Money> netBalances(SortedSet<Long> memberIds, List<LedgerPosting> postings)
  precondition: every posting.groupId == the single group being computed (D21)
  net(m) = Σ { p.delta | p.userId == m }       (0.00 for members with no postings)
  postcondition: Σ_m net(m) == 0.00  else throw LedgerInconsistencyException (fatal; logged and alerted)
```

`LedgerPosting` comes from `v_ledger_postings` ([Financial_Ledger_Design](../database/Financial_Ledger_Design.md)): payer +amount and participants −share for each effective version; debtor +x and creditor −x for each completed payment.

Complexity: O(|postings| + |members|).

## 4. Simplified settlement plan (`SettlementPlanner`)

### 4.1 Inputs and outputs

| | Definition |
| --- | --- |
| Input | `SortedMap<Long memberId, Money net>` for **one** group, with Σ = 0.00 |
| Output | `SettlementPlan(groupId, List<Transfer(debtorId, creditorId, Money amount)>, ledgerFingerprint)`. Each transfer has amount > 0.00, and each (debtor, creditor) pair appears at most once. |
| `ledgerFingerprint` | Information only: a SHA-256 over the sorted (memberId, net) pairs. Shown in the payment form as a hidden field so the server can detect and *report* that the plan changed. It does **not** block the payment (D24). |

### 4.2 Algorithm (deterministic greedy two-pointer matching)

```
PLAN(net):
  1. assert Σ net == 0 (cents)
  2. C := [(id, c)  for (id, c) in net if c > 0]        -- creditors
     D := [(id, −c) for (id, c) in net if c < 0]        -- debtors (amounts owed, positive)
  3. sort C by (amount DESC, id ASC); sort D by (amount DESC, id ASC)
  4. i := 0; j := 0; T := []
     while i < |D| and j < |C|:
        x := min(D[i].rem, C[j].rem)
        T.append(Transfer(debtor = D[i].id, creditor = C[j].id, amount = x))
        D[i].rem −= x ; C[j].rem −= x
        if D[i].rem == 0: i := i + 1
        if C[j].rem == 0: j := j + 1
  5. assert i == |D| and j == |C|            -- follows from Σ = 0
  6. return T  (in emission order)
```

### 4.3 Properties and invariants

| ID | Property | Argument |
| --- | --- | --- |
| SP-1 | **Conservation**: after applying every transfer (debtor +x, creditor −x), every net is 0.00 | Each step reduces one debtor's and one creditor's remaining amount by the same x. The loop ends only when all are 0 (step 5). |
| SP-2 | **Bounded size**: \|T\| ≤ \|C\| + \|D\| − 1 ≤ k − 1, where k is the number of members with non-zero net | Each iteration exhausts at least one party, and the final iteration exhausts two. |
| SP-3 | **Pair uniqueness**: each (debtor, creditor) pair appears at most once | Pointers only move forward. A pair (i, j) is visited once. |
| SP-4 | **No self-transfers; positive amounts** | C and D are disjoint, and x > 0 because both remainders are > 0 inside the loop |
| SP-5 | **Determinism** | Total order on the sort keys. The output depends only on the multiset of (id, net), not on input order (UT-SET-09). |
| SP-6 | **Group isolation** | Input is one group's nets only (D21). The planner has no API taking several groups. |
| SP-7 | **History preserved** | The plan is derived and never persisted. Expenses and payments are untouched (D34). |
| SP-8 | **Not a global minimum** | Minimizing the number of transfers is NP-hard (it generalizes partitioning into the maximum number of zero-sum subsets). The greedy algorithm guarantees only SP-2. Counterexample in §5.13. |

### 4.4 Complexity

Sorting is O(k log k), the loop is O(k), and memory is O(k). Building the balances costs O(P) for P postings. For a 50-member group this is negligible.

### 4.5 Current obligation (DA-16)

```
Money currentObligation(SettlementPlan plan, long debtorId, long creditorId)
  = transfer.amount  if plan contains Transfer(debtorId, creditorId, _)
  = 0.00             otherwise
```

A settlement payment always records exactly `currentObligation`, computed **inside the payment transaction while holding the group ledger lock** (BR-PAY-02). This is how "full settlement of the pair" (D23) is validated after any intervening balance change. See [Payment_Processing_Design](Payment_Processing_Design.md).

### 4.6 Concurrency considerations

- Planning is pure and runs on a consistent snapshot. For payments, that snapshot is taken after `SELECT … FOR UPDATE` on the group row, so no ledger writer can interleave.
- Plans displayed to users may be stale. Staleness is resolved at submission (D24): recompute, then use the current amount, or create no payment if it is zero.
- Because every ledger write is serialized per group, the sequence of committed payments is equivalent to a serial execution. Each payment equals the obligation in the plan derived from all previously committed records.

### 4.7 Edge cases

| Case | Behavior |
| --- | --- |
| All nets 0 | Empty plan. Every obligation is 0. A payment attempt creates nothing (BR-PAY-04). |
| One creditor, many debtors | Each debtor gets one transfer to the creditor |
| Equal amounts | Tie-break by ascending id (both lists) |
| Σ ≠ 0 (corrupt data) | `LedgerInconsistencyException`. The operation fails, an alert is logged, and no payment is created. |
| Member `INACTIVE` with net 0 | Not in C or D, so never in the plan (LI-5) |
| 1-cent residues | Handled exactly in cents |
| Very large group | O(k log k). No practical limit. |

## 5. Worked examples

Members: Alice = id 1, Bob = 2, Carol = 3, David = 4, Erin = 5. "+" means the member is owed money.

### 5.1 Example 1: Three participants share $100.00

Alice pays $100.00, split equally among Alice, Bob, and Carol. Shares (A1): Alice 33.34, Bob 33.33, Carol 33.33.

| Member | Postings | Net |
| --- | --- | --- |
| Alice | +100.00 − 33.34 | **+66.66** |
| Bob | −33.33 | **−33.33** |
| Carol | −33.33 | **−33.33** |
| Σ | | 0.00 |

Plan: C = [Alice 6666]; D = [Bob 3333, Carol 3333] (tie → id asc). Transfers: **Bob → Alice 33.33**, **Carol → Alice 33.33**. Approvers (creator Alice): {Bob, Carol}.

### 5.2 Example 2: Three participants share $0.02

Bob pays $0.02, split equally among Alice, Bob, and Carol (A2): Alice 0.01, Bob 0.01, Carol 0.00.

| Member | Net |
| --- | --- |
| Alice | −0.01 |
| Bob | +0.02 − 0.01 = **+0.01** |
| Carol | **0.00** (participant with a zero share; still a required approver, DA-38) |

Plan: **Alice → Bob 0.01**. If Bob is the creator, the approvers are {Alice, Carol}.

### 5.3 Example 3: Payer excluded from participants (D20)

Alice pays $90.00 for Bob and Carol (equal). Shares: Bob 45.00, Carol 45.00. Alice has no share.

| Member | Net |
| --- | --- |
| Alice | +90.00 |
| Bob | −45.00 |
| Carol | −45.00 |

Plan: **Bob → Alice 45.00**, **Carol → Alice 45.00**. Approvers: if Alice created it, {Bob, Carol}. If Bob created it with payer Alice, {Alice, Carol} (D35: payer included, creator excluded).

### 5.4 Example 4: Cyclic debts

E1: Alice pays $30 for Bob. E2: Bob pays $30 for Carol. E3: Carol pays $30 for Alice.

| Member | Postings | Net |
| --- | --- | --- |
| Alice | +30 (E1) − 30 (E3) | 0.00 |
| Bob | −30 (E1) + 30 (E2) | 0.00 |
| Carol | −30 (E2) + 30 (E3) | 0.00 |

Plan: **empty**. Three pairwise debts collapse to zero transfers, and the history of E1–E3 is preserved.

### 5.5 Example 5: Multiple creditors and debtors

Nets after several approved expenses: Alice +50.00, Bob +30.00, Carol −45.00, David −25.00, Erin −10.00 (Σ = 0).

C = [Alice 5000, Bob 3000]; D = [Carol 4500, David 2500, Erin 1000].

| Step | Transfer | Remaining after |
| --- | --- | --- |
| 1 | Carol → Alice 45.00 | Alice 5.00, Carol done |
| 2 | David → Alice 5.00 | Alice done, David 20.00 |
| 3 | David → Bob 20.00 | David done, Bob 10.00 |
| 4 | Erin → Bob 10.00 | all done |

4 transfers = k − 1 (k = 5).

### 5.6 Example 6: Zero balances

All nets are 0.00 (e.g., after Example 1 is fully settled). The plan is empty. If Bob submits a stale form for "Bob → Alice 33.33", the obligation is 0.00, **no payment is created**, and the event `PAYMENT_NOT_CREATED_ZERO_OBLIGATION` is audited with displayed = 33.33 (BR-PAY-04).

### 5.7 Example 7: Edited approved expense (D10)

E1 v1 (approved): Alice paid $60.00 equally among Alice, Bob, and Carol (20.00 each). Nets: Alice +40, Bob −20, Carol −20. Plan: Bob → Alice 20, Carol → Alice 20.

Alice edits E1 to $75.00, creating v2. In the edit transaction, E1 becomes `PENDING_APPROVAL` and `effective_version_id = NULL`.

| Moment | Alice | Bob | Carol | Plan |
| --- | --- | --- | --- | --- |
| Before edit | +40.00 | −20.00 | −20.00 | Bob→Alice 20, Carol→Alice 20 |
| v2 pending | 0.00 | 0.00 | 0.00 | empty (Bob's stale payment → no payment) |
| v2 approved (Bob and Carol) | +50.00 | −25.00 | −25.00 | Bob→Alice 25, Carol→Alice 25 |

v1 stays in the history as `SUPERSEDED` (with its `approved_at`). Only one version ever contributes.

### 5.8 Example 8: Cancelled approved expense (D14)

Starting from Example 3 (Alice +90, Bob −45, Carol −45). Alice opens a cancellation request. Approvers: {Bob, Carol}.

| Moment | Alice | Bob | Carol |
| --- | --- | --- | --- |
| Request `OPEN` | +90.00 | −45.00 | −45.00 (still effective) |
| Bob approves | +90.00 | −45.00 | −45.00 (still `OPEN`) |
| Carol approves → `CANCELLED` | 0.00 | 0.00 | 0.00 |

If Carol had rejected instead, the request would be `REJECTED`, the expense would stay `APPROVED`, and the nets would be unchanged.

### 5.9 Example 9: Payments completed before cancellation

Starting from Example 3. Bob settles: payment P1 Bob → Alice 45.00 (`COMPLETED`). Nets: Alice +45, Bob 0, Carol −45. Then E1's cancellation is approved unanimously.

| Postings remaining | Alice | Bob | Carol |
| --- | --- | --- | --- |
| P1 only (Bob +45, Alice −45) | **−45.00** | **+45.00** | 0.00 |

P1 is **not** reversed or deleted (D14, D40). The settlement direction flips. The new plan is **Alice → Bob 45.00**, which Alice may record as a new settlement.

### 5.10 Example 10: Stale payment submission (D24)

Starting from Example 1 (plan Bob → Alice 33.33). Bob opens the payment form, which displays 33.33. Before he submits, E2 is approved: Carol paid $30.00 for Bob and Carol equally (15.00 each).

New nets: Alice +66.66; Bob −33.33 − 15.00 = −48.33; Carol −33.33 + 30.00 − 15.00 = −18.33 (Σ = 0).
New plan: C = [Alice 6666], D = [Bob 4833, Carol 1833]. Transfers: Bob → Alice 48.33, Carol → Alice 18.33.

Bob submits (displayed 33.33). Under the group lock, the obligation is recomputed as **48.33**. A payment is created with amount = 48.33, displayed_amount = 33.33, amount_adjusted = true. The confirmation shows "You settled $48.33 with Alice. The amount shown earlier ($33.33) changed because balances were updated." The event `PAYMENT_RECORDED` is audited with both amounts. The mirror case (a lower current amount) behaves the same way.

### 5.11 Example 11: Two simultaneous payment submissions

State: plan Bob → Alice 48.33. Bob submits twice: T1 and T2 (two tabs with different idempotency keys, or a double click with the same key).

| Time | T1 | T2 |
| --- | --- | --- |
| t1 | `BEGIN`; lock the group row (acquired) | `BEGIN`; lock the group row (**waits**) |
| t2 | Obligation 48.33 → INSERT payment (key K1) → COMMIT | |
| t3 | | Lock acquired. If key = K1: the existing payment is found, so return `ALREADY_RECORDED` (idempotent replay). Otherwise recompute: Bob's net is 0.00 and the obligation is 0.00, so **no payment**; return `ZERO_OBLIGATION`. COMMIT. |

Exactly one payment exists. See [38_Sequence_Concurrent_Payment_Submission](../uml/38_Sequence_Concurrent_Payment_Submission.puml) and CON-01/CON-02.

### 5.12 Example 12: Settlement plan changes after another payment

Starting from Example 5. The plan is Carol→Alice 45, David→Alice 5, David→Bob 20, Erin→Bob 10. David loads the page showing "David → Alice 5.00" and "David → Bob 20.00". Meanwhile Carol records Carol → Alice 45.00.

New nets: Alice +5, Bob +30, Carol 0, David −25, Erin −10.
New plan: C = [Bob 3000, Alice 500]; D = [David 2500, Erin 1000] → **David → Bob 25.00**, Erin → Bob 5.00, Erin → Alice 5.00.

| David submits | Server outcome |
| --- | --- |
| "David → Alice" (displayed 5.00) | Current obligation David→Alice = 0.00, so no payment. The new plan is shown, and the zero obligation is audited. |
| "David → Bob" (displayed 20.00) | Current obligation = 25.00. Payment 25.00 is recorded, adjusted (displayed 20.00). |

Every recorded payment equals a transfer of the plan derived from all records committed before it. The remaining plan therefore still settles the group exactly (SP-1). There are never inconsistent partial obligations.

### 5.13 Non-minimality counterexample (SP-8)

Nets: A +6.00, B +3.00, C −5.00, D −3.00, E −1.00.
Greedy: C→A 5, D→A 1, D→B 2, E→B 1, which is **4** transfers.
Optimal: D→B 3, C→A 5, E→A 1, which is **3** transfers (zero-sum subsets {B, D} and {A, C, E}).
The documentation therefore claims only ≤ k − 1 transfers.

## 6. Verification mapping

| Example | Tests |
| --- | --- |
| A1–A7 | UT-SPL-01–09, FIN-01–FIN-05 |
| 5.1–5.5 | UT-SET-01–04, FIN-06–FIN-10 |
| 5.6 | UT-SET-05, UT-PAY-03, FIN-11 |
| 5.7 | UT-VER-02, FIN-12 |
| 5.8, 5.9 | UT-CAN-04, FIN-13, FIN-14 |
| 5.10 | UT-PAY-04, FIN-15, CON-03 |
| 5.11 | CON-01, CON-02, FIN-16 |
| 5.12 | UT-SET-10, FIN-17 |
| 5.13 | UT-SET-07 (asserts ≤ k−1, not minimality) |
