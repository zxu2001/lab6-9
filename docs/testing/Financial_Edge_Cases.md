# Financial Edge Cases (FIN-01–FIN-20)

Every case has exact expected values computed independently (by hand, in [Settlement_Algorithm §5](../design/Settlement_Algorithm.md#5-worked-examples)). Each case is executed as a unit test (domain) **and** as an integration test through the services against PostgreSQL (SC-005). Actors: Alice (A) = 1, Bob (B) = 2, Carol (C) = 3, David (D) = 4, Erin (E) = 5. Creator = A unless stated.

| ID | Scenario | Steps | Expected | Req |
| --- | --- | --- | --- | --- |
| FIN-01 | $100.00 / 3 equal | A pays $100 for {A, B, C}; B and C approve | Shares A 33.34, B 33.33, C 33.33. Nets A +66.66, B −33.33, C −33.33. | D09 |
| FIN-02 | $0.02 / 3 equal | B pays $0.02 for {A, B, C}; creator B; A and C approve | Shares 0.01 / 0.01 / 0.00. Nets A −0.01, B +0.01, C 0.00. Plan A→B 0.01. C was a required approver. | D09, DA-38 |
| FIN-03 | Percentage exactness | A pays $10.00 at 33.33/33.33/33.34 | 3.33 / 3.33 / 3.34 | D09 |
| FIN-04 | Percentage invalid sums | Totals 99.99 and 100.01 | Rejected; no expense rows; balances unchanged | D09, SC-007 |
| FIN-05 | Smallest amount, many participants | $0.01 equal over {1..5} | id 1 gets 0.01; the others 0.00; Σ = 0.01 | D09 |
| FIN-06 | Payer excluded | A pays $90 for {B, C} | B −45, C −45, A +90. Approvers {B, C}. | D20 |
| FIN-07 | Payer ≠ creator, excluded | Creator B, payer A, participants {C, D} | Approvers {A, C, D}. After approval: A +90 (for $90), C −45, D −45. | D35, D38 |
| FIN-08 | Cyclic debts | A pays $30 for B; B pays $30 for C; C pays $30 for A (all approved) | All nets 0; empty plan; 3 expenses still listed | D34 |
| FIN-09 | Multiple creditors/debtors | Nets A +50, B +30, C −45, D −25, E −10 | Plan C→A 45, D→A 5, D→B 20, E→B 10 | D34 |
| FIN-10 | Sole participant | A pays $20 for {A} | Auto-approved, audited; nets all 0; no notification | D15 |
| FIN-11 | Zero balances | All settled; B submits a stale settle form | No payment; `ZERO_OBLIGATION`; audit | D24 |
| FIN-12 | Edited approved expense | A $60 equal over {A, B, C} approved; A edits to $75 | Immediately all nets 0; after v2 approval A +50, B −25, C −25 | D10 |
| FIN-13 | Cancelled approved expense | FIN-06 then unanimous cancellation | While `OPEN`: unchanged. After: all 0. | D14 |
| FIN-14 | Payment before cancellation | FIN-06; B pays A 45; cancellation approved | Nets A −45, B +45, C 0; plan A→B 45; payment P1 unchanged | D14, D40 |
| FIN-15 | Stale payment (higher) | FIN-01; B loads the form (33.33); C's $30 expense for {B, C} is approved; B submits | Payment 48.33, displayed 33.33, adjusted | D24 |
| FIN-16 | Simultaneous payments | Plan B→A 48.33; two concurrent submissions | Exactly one payment of 48.33 (see CON-01/02) | D24 |
| FIN-17 | Plan changes after another payment | FIN-09; C pays A 45; D submits a stale "D→A 5" and a stale "D→B 20" | D→A: no payment (zero). D→B: 25.00 adjusted. | D23, D24 |
| FIN-18 | Rejected edit of an approved expense | FIN-12, but B rejects v2 | Expense `REJECTED`; nets all 0 (v1 never effective again) | DA-18 |
| FIN-19 | Stale payment (lower) | FIN-01 plan B→A 33.33; an expense where B paid $20 for {A, B} is approved before B submits | New nets A +56.66, B −23.33, C −33.33. Plan C→A 33.33, B→A 23.33. B's payment = 23.33 (adjusted, lower). | D24 |
| FIN-20 | Cross-group isolation | A owes B $10 in G1; B owes A $10 in G2 | G1 plan A→B 10; G2 plan B→A 10; overview shows both; no netting; a payment in G1 does not change G2 | D21 |

FIN-19 check: after FIN-01 (A +66.66, B −33.33, C −33.33), B pays $20 split {A: 10.00, B: 10.00}, so A −10.00 and B +20 − 10 = +10.00. New nets: A +56.66, B −23.33, C −33.33 (Σ 0). Sorted debtors: C 33.33, B 23.33, giving C→A 33.33 and B→A 23.33.
