# Unit Test Specification

JUnit 5 (domain) and JUnit 5 + Mockito (application services). Fixed `Clock` at `2026-11-03T15:00:00Z`; display zone `America/Detroit`. Actors: Alice = 1, Bob = 2, Carol = 3, David = 4, Erin = 5. "Req" lists the requirement, rule, and decision IDs covered. No tests are implemented in this phase.

## UT-MON: Money and input values (`Money`, `ExpenseAmount`, `Percentage`)

| ID | Setup | Input | Expected | Req |
| --- | --- | --- | --- | --- |
| UT-MON-01 | none | `"12.34"`, `"0.01"`, `"1000000.00"`, `"5"` | Accepted. Scale normalized to 2 (`5.00`). | BR-EXP-03, D09 |
| UT-MON-02 | none | `"0"`, `"0.00"`, `"-1.00"` | `ValidationException(amount, NOT_POSITIVE)` | BR-EXP-03 |
| UT-MON-03 | none | `"1.234"`, `"1e2"`, `"abc"`, `"NaN"`, `""` | `ValidationException(amount, INVALID_FORMAT / TOO_MANY_DECIMALS)` | BR-EXP-03, FR-025 |
| UT-MON-04 | none | `"1000000.01"` | `ValidationException(amount, TOO_LARGE)` | DA-26 |
| UT-MON-05 | none | Reflection over the `Money` API | No constructor or factory accepts `double`/`float`; arithmetic keeps scale 2 | NFR-001 |
| UT-MON-06 | today = 2026-11-03 (Detroit) | Expense date 2026-11-04 / 2026-11-03 | Future date rejected (`DATE_IN_FUTURE`); today accepted | DA-33 |

## UT-SPL: Split allocation (`SplitAllocator`)

| ID | Input | Expected | Req |
| --- | --- | --- | --- |
| UT-SPL-01 | $100.00 equal, {1, 2, 3} | 33.34 / 33.33 / 33.33; Σ = 100.00 | D09, BR-SPL-02 |
| UT-SPL-02 | $0.02 equal, {1, 2, 3} | 0.01 / 0.01 / 0.00 | D09, DA-38 |
| UT-SPL-03 | $50.00 equal, {7} | 50.00 | BR-SPL-02 |
| UT-SPL-04 | $100.00 at 50/50 % {1, 2} | 50.00 / 50.00 | BR-SPL-03 |
| UT-SPL-05 | $100.00 at 33.33/33.33/33.34 | 33.33 / 33.33 / 33.34 | BR-SPL-03 |
| UT-SPL-06 | Percentages summing to 99.99 and to 100.01 | `ValidationException(percentages, SUM_NOT_100)` | D09, FR-007 |
| UT-SPL-07 | A percentage of 0 or −5 | `ValidationException(percentage, NOT_POSITIVE)` | DA-25 |
| UT-SPL-08 | A percentage of 33.333 | `ValidationException(percentage, TOO_MANY_DECIMALS)` | DA-25 |
| UT-SPL-09 | $10.00 at 33.33/33.33/33.34 and $0.01 at 99/1 | 3.33/3.33/3.34 (largest remainder → id 3) and 0.01/0.00 | BR-SPL-03 |
| UT-SPL-10 | Seeded random: 1 000 amounts (0.01–1,000,000.00) × 1–20 participants, both methods | Σ shares == amount always; each share ≥ 0; equal-split shares differ by ≤ 0.01 | BR-SPL-04, SC-003 |
| UT-SPL-11 | The same participants supplied in shuffled order | Identical allocation | BR-SPL-06, NFR-012 |

## UT-APR: Approval (`ApproverSetResolver`, `Expense.recordApproval/recordRejection`, `ExpenseApprovalService`)

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| UT-APR-01 | Creator Alice, payer Bob, participants {Carol, David} | resolve | {Bob(PAYER), Carol, David} | D35 |
| UT-APR-02 | Creator Alice = payer, participants {Alice, Bob} | resolve | {Bob} | D35 |
| UT-APR-03 | Creator Alice, payer Bob, participants {Carol} (payer excluded from split) | resolve | {Bob(PAYER), Carol} | D20, D35 |
| UT-APR-04 | Creator Alice, payer Bob, participants {Bob, Carol} | resolve | {Bob(PAYER_AND_PARTICIPANT), Carol}; no duplicate | D35 |
| UT-APR-05 | Creator Alice = payer, participants {Alice} | submit | Expense `APPROVED`, `autoApproved = true`; audit `EXPENSE_AUTO_APPROVED`; no notification | D15 |
| UT-APR-06 | Pending v1, approvers {Bob, Carol} | Alice (creator) approves | `ForbiddenException` | D02 |
| UT-APR-07 | Same | David (not in set; group owner) approves | `ForbiddenException` (no owner override) | D17 |
| UT-APR-08 | Bob already approved | Bob approves again | `ALREADY_DECIDED` | BR-APR-04 |
| UT-APR-09 | Approvers {Bob, Carol}; Bob approved | Carol rejects ("wrong amount") | Version and expense `REJECTED`; audit with the reason | D02, D28 |
| UT-APR-10 | Approvers {Bob, Carol} | Bob, then Carol approve | After Bob: `PENDING_APPROVAL`. After Carol: `APPROVED`, `effective = v1`, `everApproved` | D02 |
| UT-APR-11 | v1 superseded by v2 | Bob approves v1 | `ConcurrentModificationException(VERSION_NOT_CURRENT)` | BR-APR-07 |
| UT-APR-12 | Pending | Reject with a blank or a 501-char reason | `ValidationException(reason)` | DA-27 |
| UT-APR-13 | Pending v1, approvers undecided | Advance the clock 365 days; scan the application context for `@Scheduled` approval jobs | Still `PENDING_APPROVAL`; no expiry, reminder, or escalation component exists | D41, DA-01 |

## UT-VER: Editing and versions

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| UT-VER-01 | Pending v1 | Creator edits the amount | v1 `SUPERSEDED`, v2 `PENDING`, new approver rows, `EXPENSE_REAPPROVAL_REQUESTED` notifications | D10 |
| UT-VER-02 | Approved v1 ($60 equal over 3) | Creator edits to $75 | `effective = null`, status `PENDING_APPROVAL`; nets all 0 until v2 is approved (FIN-12) | D10 |
| UT-VER-03 | Approved v1 | Bob (not the creator) edits | `ForbiddenException` | D10 |
| UT-VER-04 | `REJECTED` expense | Creator edits | `REJECTED_IS_FINAL` | D28 |
| UT-VER-05 | `CANCELLED` expense | Creator edits | `CANCELLED_IS_FINAL` | D14 |
| UT-VER-06 | Pending v1 | Edit with identical content | `NO_CHANGES` | DA-32 |
| UT-VER-07 | Pending v1 with receipt R1 | Edit that removes R1 / adds R2 | New version; R1 kept in v1's links; approvals restart | D27 |
| UT-VER-08 | Current is v2 | Edit with `basedOnVersionNumber = 1` | `STALE_VERSION` | BR-VER-10 |
| UT-VER-09 | Approved, cancellation `OPEN` | Edit | `CANCELLATION_PENDING` | DA-39 |
| UT-VER-10 | Approved; participant Carol `INACTIVE` | Edit | `INVOLVES_INACTIVE_MEMBER` | DA-21 |
| UT-VER-11 | Approved v1 edited to v2 | Bob rejects v2 | Expense `REJECTED`; v1 remains `SUPERSEDED` with `approved_at`; never effective again | DA-18 |

## UT-CAN: Cancellation

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| UT-CAN-01 | Pending, never approved | Creator `cancelPendingExpense` | Expense and version `CANCELLED`; audit DIRECT | D14 |
| UT-CAN-02 | Same | Bob cancels | `ForbiddenException` | D14 |
| UT-CAN-03 | Approved | Creator requests | Request `OPEN` with frozen approvers; expense still `APPROVED`; notifications | D14, D26 |
| UT-CAN-04 | `OPEN`, approvers {Bob, Carol} | Both approve | Request `APPROVED`; expense `CANCELLED`; `effective = null` | D14 |
| UT-CAN-05 | `OPEN` | Carol rejects (reason) | Request `REJECTED`; expense `APPROVED` and unchanged | D14 |
| UT-CAN-06 | `OPEN` exists | Creator requests again | `CANCELLATION_ALREADY_OPEN` | DA-19 |
| UT-CAN-07 | Previous request `REJECTED` | Creator requests again | New `OPEN` request with a new snapshot | DA-19 |
| UT-CAN-08 | Approved sole-participant expense (creator = payer = only participant) | Request | Auto-approved; expense `CANCELLED`; audited | D14, D15 |
| UT-CAN-09 | `PENDING_APPROVAL`, `everApproved = true` | Creator direct-cancels | `CANCEL_BLOCKED_REAPPROVAL_PENDING` | DA-17 |
| UT-CAN-10 | `OPEN` | Creator approves own request | `ForbiddenException` (creator excluded) | D14 |
| UT-CAN-11 | `OPEN` request | Advance the clock 365 days | Request still `OPEN`; the expense still effective | D41, DA-02 |

## UT-BAL: Balances (`BalanceCalculator`)

| ID | Input postings | Expected nets | Req |
| --- | --- | --- | --- |
| UT-BAL-01 | Alice paid $100 equal over {A, B, C} | A +66.66, B −33.33, C −33.33 | BR-BAL-01 |
| UT-BAL-02 | Alice paid $90 for {B, C} | A +90, B −45, C −45 | D20 |
| UT-BAL-03 | Seeded random ledgers (1 000) | Σ nets == 0.00 | BR-BAL-03, SC-003 |
| UT-BAL-04 | Pending, rejected, cancelled, and superseded versions present (via the repository fake) | Excluded (only effective versions are counted) | FR-011 |
| UT-BAL-05 | Approved $90 for {B, C} + payment B→A 45 | A +45, B 0, C −45 | FR-015 |
| UT-BAL-06 | Corrupt postings with Σ ≠ 0 | `LedgerInconsistencyException` | LI-2 |

## UT-SET: Settlement plan (`SettlementPlanner`)

| ID | Nets | Expected transfers | Req |
| --- | --- | --- | --- |
| UT-SET-01 | A +10, B −10 | B→A 10 | D34 |
| UT-SET-02 | A +66.66, B −33.33, C −33.33 | B→A 33.33, C→A 33.33 (order: B before C by id) | D34, DA-15 |
| UT-SET-03 | All 0 after a cycle | Empty | D34 |
| UT-SET-04 | A +50, B +30, C −45, D −25, E −10 | C→A 45, D→A 5, D→B 20, E→B 10 | D34 |
| UT-SET-05 | All 0 | Empty; `obligation(any) = 0.00` | D24 |
| UT-SET-06 | A +10, B +10, C −10, D −10 (ties) | C→A 10, D→B 10 | DA-15 |
| UT-SET-07 | A +6, B +3, C −5, D −3, E −1 | 4 transfers (≤ k−1 = 4); documents non-minimality | SP-2, SP-8 |
| UT-SET-08 | Seeded random nets (1 000) | Applying all transfers zeroes every net; no self-transfers; pairs unique | SP-1, SP-3, SP-4 |
| UT-SET-09 | The same nets in shuffled map-insertion order | Identical plan | NFR-012 |
| UT-SET-10 | Example 12 nets after Carol's payment | David→Bob 25, Erin→Bob 5, Erin→Alice 5 | FIN-17 |

## UT-PAY: Payment (`Payment.settle`, `PaymentService` with mocks)

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| UT-PAY-01 | Plan B→A 33.33 | B records (displayed 33.33) | Payment 33.33, not adjusted, `COMPLETED`; audit | D03, D23 |
| UT-PAY-02 | Plan B→A 33.33 | A (creditor) records as debtor A to creditor B | `ZERO_OBLIGATION` (A owes nothing). There is no API for recording on B's behalf. | D39 |
| UT-PAY-03 | All nets 0 | B submits displayed 33.33 | `ZERO_OBLIGATION`; no `PaymentRepository.insert`; audit `PAYMENT_NOT_CREATED_ZERO_OBLIGATION` | D24 |
| UT-PAY-04 | Plan B→A 48.33 | B submits displayed 33.33 | Payment 48.33, `adjusted = true`, `displayed = 33.33`; outcome `RECORDED_ADJUSTED` | D24 |
| UT-PAY-05 | n/a | Creditor = actor | `ValidationException(SELF_PAYMENT)` | BR-PAY-10 |
| UT-PAY-06 | Reflection | `Payment` and `PaymentRepository` API | No setters or mutators; the repository has no update or delete | D40 |
| UT-PAY-07 | `findByIdempotencyKey` returns an existing payment | Submit | `ALREADY_RECORDED`; no insert | BR-PAY-08 |
| UT-PAY-08 | Group `ARCHIVED` (mock) | Submit | `GroupArchivedException` | BR-ARC-04 |

## UT-GRP: Groups, membership, archive policies

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| UT-GRP-01 | Bob net −10 | Bob leaves | Refused `NET_BALANCE_NOT_ZERO` | D16 |
| UT-GRP-02 | Bob is an undecided approver on a pending version | Leave | `PENDING_APPROVAL_RESPONSIBILITY` | D16, DA-22 |
| UT-GRP-03 | Bob is an undecided cancellation approver | Leave | `PENDING_CANCELLATION_RESPONSIBILITY` | D16 |
| UT-GRP-04 | Bob is the creator of a pending expense where no approval is needed from him | Leave | `INVOLVED_IN_PENDING_EXPENSE` | DA-22 |
| UT-GRP-05 | Alice is the owner, net 0 | Alice leaves | `OWNER_MUST_TRANSFER` | D17 |
| UT-GRP-06 | Carol `INACTIVE` | Transfer ownership to Carol | Refused | D17 |
| UT-GRP-07 | Bob is not the owner | Bob transfers ownership | `ForbiddenException` | D17 |
| UT-GRP-08 | Nets non-zero | Archive | `BALANCES_NOT_SETTLED` | D29 |
| UT-GRP-09 | A pending expense exists | Archive | `UNRESOLVED_EXPENSE_APPROVALS` | D29 |
| UT-GRP-10 | An `OPEN` cancellation exists | Archive | `UNRESOLVED_CANCELLATION_APPROVALS` | D29 |
| UT-GRP-11 | Bob is not the owner | Archive | `ForbiddenException` | D29 |
| UT-GRP-12 | `ARCHIVED` group | Create expense, invite, add category, transfer, archive again | `GroupArchivedException` each; no un-archive API exists | D29, D36 |
| UT-GRP-13 | Alice verified (`ACTIVE`); Zed `PENDING_VERIFICATION` | Alice creates a group; Zed creates a group | Alice is the single owner and an `ACTIVE` member, audit `GROUP_CREATED`; Zed cannot (not signed in / refused) | D08, D17 |

## UT-INV: Invitations (`GroupInvitation`, `InvitationAcceptancePolicy`, `InvitationService`)

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| UT-INV-01 | Pending, `bob@x.com`, Bob verified | Bob accepts | `ACCEPTED`; membership `ACTIVE` | D08, D37 |
| UT-INV-02 | Clock + 7 days + 1 s | Accept | `EXPIRED` transition; refused | D37 |
| UT-INV-03 | `REVOKED` | Accept | Refused | D37 |
| UT-INV-04 | Invited `bob@x.com`; Carol signed in | Carol accepts | Refused `WRONG_ACCOUNT`; status stays `PENDING`; audit | D37, BR-INV-08 |
| UT-INV-05 | Matching account `PENDING_VERIFICATION` | Accept | Refused `ACCOUNT_NOT_VERIFIED` | D37 |
| UT-INV-06 | Group `ARCHIVED` | Issue / accept | Refused | D37 |
| UT-INV-07 | `ACCEPTED` | Accept again | `ALREADY_USED` | D37 |
| UT-INV-08 | Bob already `ACTIVE` | Issue to Bob's email | `ALREADY_MEMBER` | BR-INV-03 |
| UT-INV-09 | A `PENDING` invitation exists for the email | Issue again | `PENDING_INVITATION_EXISTS` | BR-INV-03 |
| UT-INV-10 | Bob `INACTIVE` | Bob accepts a new invitation | The same membership row is reactivated | DA-36 |

## UT-CAT: Categories

| ID | Action | Expected | Req |
| --- | --- | --- | --- |
| UT-CAT-01 | Owner creates "Ski Passes" | Active custom category | D22 |
| UT-CAT-02 | Non-owner creates | `ForbiddenException` | D22 |
| UT-CAT-03 | Create "groceries" (collides with predefined) or a duplicate custom name in a different case | `ValidationException(name, DUPLICATE)` | BR-CAT-02 |
| UT-CAT-04 | Deactivated category used in a new expense | `ValidationException(category, NOT_SELECTABLE)` | BR-CAT-03 |
| UT-CAT-05 | Rename or deactivate a category used by v1 | v1 keeps `category_id`; history displays the current name; audit has the old name | D22, DA-34 |
| UT-CAT-06 | Rename a predefined category | Refused | BR-CAT-01 |

## UT-RCP: Receipts (`ReceiptService.validate`, inspector)

| ID | Input | Expected | Req |
| --- | --- | --- | --- |
| UT-RCP-01 | Valid JPEG, PNG, and PDF samples | Accepted, with the detected type | D13, D27 |
| UT-RCP-02 | PNG bytes named `.pdf`; an HTML file named `.jpg`; an SVG | Type decided by magic bytes; HTML and SVG rejected (`RECEIPT_TYPE_NOT_ALLOWED`) | BR-RCP-01 |
| UT-RCP-03 | 10 MiB + 1 byte; 0 bytes | `RECEIPT_TOO_LARGE`; `RECEIPT_EMPTY` | DA-24 |
| UT-RCP-04 | 11 receipts in the resulting version | `RECEIPT_LIMIT` | DA-24 |
| UT-RCP-05 | Filename `../../etc/passwd\u0000.png` | Sanitized to `etcpasswd.png` (or similar); no path separators | NFR-002 |

## UT-AUTH: Authentication services

| ID | Action | Expected | Req |
| --- | --- | --- | --- |
| UT-AUTH-01 | Register a new email | `PENDING_VERIFICATION`; BCrypt hash; token hash stored; event published | D11, D30 |
| UT-AUTH-02 | Register `Alice@X.com` when `alice@x.com` exists | Duplicate error | BR-AUTH-01 |
| UT-AUTH-03 | Password of 11 chars, or equal to the email | `ValidationException(password)` | BR-AUTH-03 |
| UT-AUTH-04 | Inspect the saved token | Only the SHA-256 hex is stored; the raw token is not persisted | DA-08 |
| UT-AUTH-05 | Verify with a valid token | `ACTIVE`; token used | D30 |
| UT-AUTH-06 | Verify with an expired token (clock + 25 h) | `INVALID_OR_EXPIRED` | D30 |
| UT-AUTH-07 | Verify with a used token | `INVALID_OR_EXPIRED` | D30 |
| UT-AUTH-08 | Reset request for an unknown email | Same result type as for a known email; `EmailService` never invoked | D30 |
| UT-AUTH-09 | Reset completed | Other reset tokens invalidated; sessions expired; lockout cleared | BR-AUTH-07 |
| UT-AUTH-10 | Resend verification | Previous open tokens invalidated | BR-AUTH-04 |
| UT-AUTH-11 | 5 failed logins | `locked_until = now + 15 min`; audit `ACCOUNT_LOCKED` | BR-AUTH-08 |
| UT-AUTH-12 | Reset on a `PENDING_VERIFICATION` account | Account becomes `ACTIVE` | DA-41 |

## UT-NOT: Notifications

| ID | Action | Expected | Req |
| --- | --- | --- | --- |
| UT-NOT-01 | Create an expense with approvers {Bob, Carol} | Exactly 2 `EXPENSE_APPROVAL_REQUESTED` | D26 |
| UT-NOT-02 | Same | No notification for the creator Alice | D26 |
| UT-NOT-03 | Auto-approved expense | None | D15, D26 |
| UT-NOT-04 | Edit → v2 with approvers {Bob} | 1 `EXPENSE_REAPPROVAL_REQUESTED` for v2 | D26 |
| UT-NOT-05 | Cancellation request with approvers {Bob, Carol} | 2 `CANCELLATION_APPROVAL_REQUESTED` | D26 |
| UT-NOT-06 | Payment recorded; report generated; invitation issued; rejection | `NotificationService` never invoked | D26 |
| UT-NOT-07 | Bob marks Carol's notification read | `NotFoundException` | BR-NOT-03 |

## UT-RPT: Reports (`ReportService` with repository fakes)

| ID | Action | Expected | Req |
| --- | --- | --- | --- |
| UT-RPT-01 | Date range 2026-10-01..2026-10-31 | Only expenses or payments dated in range | D05 |
| UT-RPT-02 | Member = Carol | Only records with Carol as payer/participant or debtor/creditor | D05 |
| UT-RPT-03 | Category = Groceries | Only Groceries versions | D05 |
| UT-RPT-04 | Payment status `COMPLETED`; settlement status `OUTSTANDING` | Correct subsets | D05, DA-28 |
| UT-RPT-05 | Mode `HISTORY` | Includes rejected and cancelled, labelled; `EFFECTIVE` excludes them | §6.9 |
| UT-RPT-06 | No matches | `empty = true`; applied filters echoed | BR-RPT-05 |
| UT-RPT-07 | `EFFECTIVE` balance report vs. `BalanceService` | Equal figures | NFR-005 |
| UT-RPT-08 | Overview with 2 groups (A owes in G1, is owed in G2) | Two separate rows; no netted total | D21 |

## UT-AUD, UT-TIME, UT-ARCH

| ID | Action | Expected | Req |
| --- | --- | --- | --- |
| UT-AUD-01 | Each audited service action (BR-AUD-02 list) | `AuditService.record` invoked once with the correct type, actor, and entity; details exclude passwords and tokens | D19, BR-AUD-03 |
| UT-TIME-01 | Service timestamps | Taken from the injected `Clock` (UTC); displayed in Detroit time | NFR-013 |
| UT-ARCH-01 | Architecture rules for `domain` | No dependency on Spring, Hibernate, PostgreSQL, AWS, Servlet, Thymeleaf, or other layers | NFR-006 |
| UT-ARCH-02 | Architecture rules for `web` / `application` | `web` ↛ `infrastructure`, `domain.repository`; `application` ↛ `web`, `infrastructure`; no cycles | NFR-006 |
| UT-ARCH-03 | Money types | No `float`/`double` in `domain.finance`, `domain.model`, `application.result` | NFR-001 |
