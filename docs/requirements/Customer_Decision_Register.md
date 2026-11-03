# Customer Decision Register

| Item | Value |
| --- | --- |
| Project | SplitSmart: Group Expense Sharing and Settlement System |
| Register version | 1.0 (2026-11-03) |
| Authority | Customer decisions D01–D41 are **authoritative** and supersede conflicting statements in `UserRequirement.md`, the 2026-10-27 clarifications, and the earlier desktop design artifacts. |
| Related | [Business Rules](Business_Rules.md) · [Requirements Traceability Matrix](Requirements_Traceability_Matrix.md) · [Conflict Resolution](Requirements_Conflict_Resolution.md) · [Nonfunctional Requirements](Nonfunctional_Requirements.md) |

This register has three parts:

- **Part A** keeps the 41 customer decisions as received. They are paraphrased only for layout and must not be reopened.
- **Part B** lists the **design assumptions**. These are engineering defaults. They are **not** customer-approved requirements.
- **Part C** lists items that need customer confirmation.

When a design assumption conflicts with a customer decision, the decision wins.

---

## Part A: Customer Decisions (authoritative)

| ID | Topic | Decision (authoritative) | Supersedes | Primary requirement IDs |
| --- | --- | --- | --- | --- |
| D01 | Delivery platform | Web-based application with a cloud-hosted database. This supersedes the earlier desktop selection. Remove Swing-specific assumptions. | Spec "Java Swing MVP Subset"; plan "desktop MVP"; ADR-001 (proposed) | FR-022 |
| D02 | Expense approval | Every required approver must approve before an expense becomes effective. The creator cannot approve their own expense. Any rejection immediately changes the expense to `REJECTED`. Pending and rejected expenses do not affect balances. | FR-011/FR-013 "single reviewer" | FR-011, FR-013 |
| D03 | Payment completion | Recording a valid payment immediately marks it `COMPLETED`. No creditor confirmation. | Spec Open Question 2 | FR-017 |
| D04 | Notifications | Persist in-app notifications with read/unread status. No push notifications and no general-purpose notification emails. | FR-010 (delivery undefined) | FR-010 |
| D05 | Reporting | Filtered reports by date range, group member, expense category, and payment status. No CSV export for the MVP. | FR-021 deferred | FR-018–FR-021 |
| D06 | Cloud application | Web application with a cloud database. This explicitly overrides the original desktop decision. | Same as D01 | FR-022, NFR-011 |
| D07 | Technology selection | Spring Boot, Spring MVC, Thymeleaf, PostgreSQL, Spring Data JPA/Hibernate, Maven, JUnit 5. | Constitution III (Swing) | NFR-016 |
| D08 | Invitation-only groups | Any registered user may create a group. Only invited users may join an existing group. Invitations have pending, accepted, and expired states. | FR-003 "add members" | FR-003, FR-032 |
| D09 | Financial precision | `BigDecimal` and PostgreSQL `NUMERIC(19,2)`. USD with two decimals. Leftover cents are allocated deterministically by stable participant identifiers. Percentages total exactly 100%. Allocated shares total the expense amount. | 2026-10-27 clarification "half-up + remainder to payer" | FR-005–FR-007, NFR-001 |
| D10 | Expense editing | Only the creator edits. Pending and approved expenses are editable. Every edit creates a new immutable version, invalidates prior approvals, and restarts unanimous approval. An edited approved expense stops affecting balances until the new version is approved. All versions are kept. Use cancellation, not deletion. | None (new) | FR-039, FR-023 |
| D11 | Authentication | Spring Security with email and password. Secure adaptive password hashes. Server-side sessions. Group-level authorization enforced on the server. | Spec Assumption "authentication technology outside scope" | FR-001, FR-002, FR-024 |
| D12 | AWS deployment | AWS EC2 running Spring Boot, Amazon RDS PostgreSQL, HTTPS, secure configuration and secrets. Do not provision. | Desktop-local storage | NFR-011 |
| D13 | Receipt storage | Receipt content in PostgreSQL `BYTEA` with metadata. Enforce authorization, size limits, and type validation. No S3. | "Local file receipt storage" | FR-009, NFR-014 |
| D14 | Expense cancellation | The creator may directly cancel a pending expense. Cancelling an approved expense requires unanimous approval from the required cancellation approvers (excluding the creator). While cancellation approval is pending, the expense keeps affecting balances. Unanimous approval → `CANCELLED`, and it stops affecting balances. Any rejection → it stays approved. Completed payments are never reversed or deleted automatically. Audit history is kept. | None (new) | FR-040, FR-041 |
| D15 | Sole-participant expense | If the creator is the only financially involved participant and no other approvals are required, approve automatically and record it in the audit trail. | None (new) | FR-043 |
| D16 | Membership restrictions | A member cannot leave or be removed while they have outstanding balances or unresolved approval/cancellation responsibilities. Use an inactive status, not deletion. Keep history. | FR-003 "remove member" | FR-035, FR-027 |
| D17 | Group ownership | Exactly one owner. Ownership can be transferred to another active member. No administrator role. The owner must transfer before leaving. Ownership does not override approval requirements. | Spec "membership roles" | FR-034 |
| D18 | Currency | USD only. No conversion. | None | FR-051 |
| D19 | Audit and concurrency | Full expense version history. Audit approvals, cancellations, and payments. Atomic transactions with rollback. Optimistic locking with JPA `@Version` where appropriate. | FR-023 (general) | FR-023, FR-026, FR-050, NFR-009 |
| D20 | Payer and split participants | One payer. The payer may be excluded from the split. The payer is credited the full amount. Only split participants owe shares. Example: Alice pays $90 for Bob and Carol, so Bob owes $45, Carol owes $45, and Alice owes $0. | 2026-10-27 clarification "payer is a participant" | FR-038 |
| D21 | Group financial isolation | Balances and settlements are computed per group. No cross-group offsetting. A cross-group overview must not merge obligations. | FR-014 "every other user" | FR-046, FR-049 |
| D22 | Expense categories | Predefined categories plus group-specific custom categories. The owner creates, renames, and deactivates custom categories. Historical references remain valid. | None (new) | FR-037 |
| D23 | Full settlements only | No partial payments and no overpayments. Each settlement covers the complete current obligation for the selected debtor/creditor pair within a group. | Spec "overpayment review exception" | FR-016 |
| D24 | Stale payment adjustment | If the obligation changed between page display and submission, recalculate automatically and use the current amount (higher or lower) without extra confirmation. If the obligation is zero, do not create a payment. Display and audit the settled amount and any adjustment. Atomic and safe under concurrency. | None (new) | FR-047 |
| D25 | Frozen expense participants | The participant list is frozen per version at submission. New members are not added automatically. Changing participants creates a new version and restarts approvals. Snapshots are kept. | FR-008 | FR-008, FR-039 |
| D26 | Notification scope | In-app notifications **only** for approval requests: new expense, edited/resubmitted expense, and approved-expense cancellation. None for payments, reports, or other events. Invitations have their own workflow. | FR-010 "notify on create" | FR-010 |
| D27 | Multiple optional receipts | Receipts are optional, with multiple allowed per expense. Validated images and PDFs. Adding, removing, or replacing a receipt is an edit (new version, restart approvals). Historical receipt versions are kept. | FR-009 "an optional receipt image" | FR-009, FR-039 |
| D28 | Rejected expenses are final | A rejected expense cannot be edited, reopened, or resubmitted. A retry requires a new expense with a new ID. Keep the rejected expense, decisions, reason, and history. | None (new) | FR-042 |
| D29 | Group archiving | Only the owner archives, and only when all balances are zero and no expense or cancellation approvals are unresolved. Archived groups are read-only, and all history is kept. No deletion. | None (new) | FR-036 |
| D30 | Email verification and password reset | Email verification before activation, using secure, expiring, single-use tokens. Password recovery by secure, expiring, single-use reset links. Reset responses never disclose whether an email exists. | None (new) | FR-029, FR-030 |
| D31 | Amazon SES | SES for verification and reset emails only. An `EmailService` abstraction with an SES adapter, and a mock for dev/test. Secured IAM. No financial notifications by email. | None (new) | FR-031 |
| D32 | Flyway | Versioned Flyway SQL migrations. `ddl-auto=validate`. Hibernate never updates production tables. During this task, document only (no executable migrations). | None (new) | NFR-010 |
| D33 | Testing | Unit tests: JUnit 5 + Mockito. Integration tests: Spring Boot Test + Testcontainers PostgreSQL. Cover rules, precision, approval/cancellation, mappings/constraints, Flyway, transactions/rollback, authorization/isolation, concurrency/optimistic locking, and MVC controllers. No browser E2E. | NFR-007 (Swing tests) | NFR-007 |
| D34 | Simplified net-balance settlement | Per-member net balance within a group. Deterministic simplified settlement recommendations that reduce unnecessary payments while keeping history. Stable-ID tie-breaking. No cross-group simplification. Document the algorithm, invariants, and complexity. Do not claim a global minimum unless guaranteed. | FR-014 "pairwise" | FR-014, FR-045 |
| D35 | Payer approval | Required approvers = (split participants ∪ payer) − creator, deduplicated, frozen per version. Example: Alice creates, Bob pays, Carol and David share, so the approvers are Bob, Carol, and David. | FR-012 "configurable review steps" | FR-012 |
| D36 | Permanent archiving | `ACTIVE → ARCHIVED` is irreversible. No reopening. A new group is needed for future activity. | None (new) | FR-036 |
| D37 | Secure group invitations | Single-use, bound to an email, valid 7 days, accepted only by a verified account with a matching email, revocable by the owner while pending. Store token hashes. Archived groups cannot issue or accept invitations. | None (new) | FR-033 |
| D38 | Expense creation permissions | Every active member of an active group may create expenses and may name another member as payer. All approvals still apply. Inactive members and archived groups cannot create expenses. | FR-004 "authorized users" | FR-004 |
| D39 | Payment recording permissions | Only the debtor may record a settlement. Not the creditor or any other member. Enforced in the service layer. | FR-016 "users record payments" | FR-016 |
| D40 | Payments are final | Completed payments cannot be edited, deleted, cancelled, or reversed by anyone, including the owner. Errors are resolved outside SplitSmart. Show a clear warning before recording. | None (new) | FR-017, FR-048 |
| D41 | No approval deadline | Approvals never expire. Pending lasts until all approve, any rejects, or the creator cancels. No automatic rejection. | None (new) | FR-044 |

---

## Part B: Design Assumptions (not customer-approved)

DA-01 to DA-15 are the defaults supplied with the decisions. DA-16 onward are conservative resolutions chosen during detailed design for ambiguities that the decisions do not settle. Each has an owner document.

| ID | Design assumption | Rationale | Owner document |
| --- | --- | --- | --- |
| DA-01 | No automatic approval reminders or escalation in the MVP. | Consistent with D41. | [Expense_Approval_Design](../design/Expense_Approval_Design.md) |
| DA-02 | Cancellation approval requests have no automatic deadline. | Consistent with D41. | [Expense_Cancellation_Design](../design/Expense_Cancellation_Design.md) |
| DA-03 | Financial operations preserve double-entry-style consistency: every posting set sums to zero. | Supports the D34 invariants. | [Financial_Ledger_Design](../database/Financial_Ledger_Design.md) |
| DA-04 | Totals use exact decimal (`BigDecimal`) or integer-cent arithmetic only. | D09. | [Settlement_Algorithm](../design/Settlement_Algorithm.md) |
| DA-05 | Expense and payment operations are atomic. | D19. | [Transaction_Concurrency_Design](../design/Transaction_Concurrency_Design.md) |
| DA-06 | Authorization is enforced at the application/service boundary. Controllers may pre-check but never replace it. | D11, D39. | [Security_Architecture](../architecture/Security_Architecture.md) |
| DA-07 | Invitations, verification, and reset use secure, opaque, single-use tokens (256-bit `SecureRandom`, base64url). | D30, D37. | [Authentication_Design](../design/Authentication_Design.md) |
| DA-08 | Only SHA-256 token hashes are stored, never raw tokens. | D37. | [Authentication_Design](../design/Authentication_Design.md) |
| DA-09 | CSRF protection on all state-changing requests. Secure, HttpOnly, SameSite=Lax session cookies. | D11. | [Security_Architecture](../architecture/Security_Architecture.md) |
| DA-10 | Receipt downloads require authenticated group authorization. | D13. | [Receipt_Storage_Design](../design/Receipt_Storage_Design.md) |
| DA-11 | Historical records remain accessible according to the membership and authorization rules (see DA-31). | D16, D29. | [Security_Architecture](../architecture/Security_Architecture.md) |
| DA-12 | Balances and settlement recommendations are derived from the authoritative ledger and never stored as a source of truth. | D34. | [Financial_Ledger_Design](../database/Financial_Ledger_Design.md) |
| DA-13 | All timestamps are persisted in UTC (`TIMESTAMPTZ`) and converted for display (default zone `America/Detroit`). | Consistency. | [PostgreSQL_Schema_Design](../database/PostgreSQL_Schema_Design.md) |
| DA-14 | Prefer soft state transitions to deleting financial records. Financial tables have no physical `DELETE`. | D10, D16, D29. | [Data_Integrity_Constraints](../database/Data_Integrity_Constraints.md) |
| DA-15 | All algorithms with several valid outcomes use deterministic ordering (ascending `users.id`). | D09, D34. | [Settlement_Algorithm](../design/Settlement_Algorithm.md) |
| DA-16 | The **current obligation** for a debtor/creditor pair is the amount of the transfer from that debtor to that creditor in the group's *current* deterministic settlement plan. It is zero if no such transfer exists. | D23 + D34 need one definition of "obligation". | [Payment_Processing_Design](../design/Payment_Processing_Design.md) |
| DA-17 | "Pending expense" in D14 (direct cancellation) means an expense that has **never had an approved version**. An expense that was approved and is now awaiting re-approval of an edit cannot be cancelled until that edit is approved (then use the approval workflow) or rejected. | Prevents bypassing D14's unanimous cancellation approval by editing first and then cancelling. | [Expense_Cancellation_Design](../design/Expense_Cancellation_Design.md) |
| DA-18 | Rejecting an edited version of a previously approved expense makes the **whole expense** `REJECTED` (literal D02 + D28). The earlier approved version stays in history but never becomes effective again. | Literal application of D02/D28. Flagged for confirmation (Part C, Q-01). | [Expense_Versioning_Design](../design/Expense_Versioning_Design.md) |
| DA-19 | After a cancellation request is rejected, the creator may open a new request. At most one `OPEN` request per expense. Each request has its own frozen approver snapshot and history. | Errors would otherwise be unfixable, because payments are final. Bounded by the one-open rule. | [Expense_Cancellation_Design](../design/Expense_Cancellation_Design.md) |
| DA-20 | Only the expense creator may initiate cancellation of an approved expense. | Mirrors D10 (creator-only edits). | [Expense_Cancellation_Design](../design/Expense_Cancellation_Design.md) |
| DA-21 | An approved expense cannot be edited or cancelled if any financially involved member (payer or participant) of its effective version is `INACTIVE`. | Keeps the invariant "inactive members always have net balance 0" (D16). | [Group_Membership_Design](../design/Group_Membership_Design.md) |
| DA-22 | "Unresolved responsibilities" (D16) means being a required approver with no decision on a `PENDING` version or `OPEN` cancellation request, **or** being creator, payer, or participant of a `PENDING` version or the subject of an `OPEN` cancellation request. | Approval would otherwise create a balance for an inactive member. | [Group_Membership_Design](../design/Group_Membership_Design.md) |
| DA-23 | No invitation emails are sent (D31 limits SES to verification and reset). The owner copies the one-time invitation link. A verified invitee also sees pending invitations for their email on their dashboard (part of the invitation workflow, not a notification). | D26 + D31. Flagged (Q-02). | [Group_Invitation_Design](../design/Group_Invitation_Design.md) |
| DA-24 | Receipt limits: JPEG, PNG, or PDF only; ≤ 10 MiB per file; ≤ 10 receipts per expense version. | D13 needs concrete limits. | [Receipt_Storage_Design](../design/Receipt_Storage_Design.md) |
| DA-25 | Percentages have at most two decimal places. Each is > 0 and ≤ 100. The sum is exactly 100.00. | D09. | [Settlement_Algorithm](../design/Settlement_Algorithm.md) |
| DA-26 | Expense amount range: 0.01 to 1,000,000.00 USD. | Sanity bound within `NUMERIC(19,2)`. | [Business_Rules](Business_Rules.md) |
| DA-27 | A rejection reason (1–500 chars) is required for expense and cancellation rejections. Approval comments are optional. | D28 "retain … reason". | [Expense_Approval_Design](../design/Expense_Approval_Design.md) |
| DA-28 | The "payment status" report filter applies to payment records (`COMPLETED` is the only MVP status) and to member settlement status in balance reports (`SETTLED` = net 0, `OUTSTANDING` ≠ 0). | D05 names the filter, but D03/D40 leave a single payment status. Flagged (Q-03). | [Reporting_Design](../design/Reporting_Design.md) |
| DA-29 | Token lifetimes: email verification 24 h, password reset 30 min, invitation 7 days (D37). Rate limits: 5 failed logins → 15-minute lockout; 3 reset or verification emails per address per hour; 20 auth-email requests per IP per hour. | §6.12 of the instruction. | [Authentication_Design](../design/Authentication_Design.md) |
| DA-30 | The MVP runs one EC2 application instance with in-memory server-side sessions. Horizontal scaling would require Spring Session JDBC (a future decision). | D11, D12. | [AWS_Deployment_Design](../architecture/AWS_Deployment_Design.md) |
| DA-31 | Read access: `ACTIVE` members (of `ACTIVE` or `ARCHIVED` groups) read all group records. `INACTIVE` members read only records they were involved in (creator, payer, participant, approver, debtor, creditor). Non-members get no access, and the response is HTTP 404. | DA-11 refinement. | [Security_Architecture](../architecture/Security_Architecture.md) |
| DA-32 | An edit must change at least one field, the participant set, a percentage, or the receipt set. No-op edits are rejected. | Avoids accidental approval resets. | [Expense_Versioning_Design](../design/Expense_Versioning_Design.md) |
| DA-33 | The expense date cannot be later than today in the display zone. | Data quality. | [Business_Rules](Business_Rules.md) |
| DA-34 | Renaming a category changes its display name everywhere. Historical versions keep the same `category_id`, and the old name is recorded in the audit trail. | D22. | [Domain_Model](../design/Domain_Model.md) |
| DA-35 | The stable participant identifier is `users.id` (`BIGINT` identity, never reused). | D09, D34. | [Settlement_Algorithm](../design/Settlement_Algorithm.md) |
| DA-36 | Re-inviting a former (`INACTIVE`) member reactivates the same membership row. Their history is preserved. | D16. | [Group_Membership_Design](../design/Group_Membership_Design.md) |
| DA-37 | The payment date is the UTC recording date. An optional note of ≤ 200 characters may be added. | D24, D40. | [Payment_Processing_Design](../design/Payment_Processing_Design.md) |
| DA-38 | A participant whose rounded share is $0.00 (e.g., $0.02 / 3) stays a participant and a required approver. | D09, D35. | [Settlement_Algorithm](../design/Settlement_Algorithm.md) |
| DA-39 | An edit is blocked while a cancellation request is `OPEN`, and a cancellation request is blocked while an edit is pending. Only one workflow per expense at a time. | Prevents conflicting workflows. | [Expense_Versioning_Design](../design/Expense_Versioning_Design.md) |
| DA-40 | Inside a group, objects outside the caller's access return 404. Role failures inside a group the caller can see (e.g., a non-owner trying to archive) return 403. | Prevents enumeration. | [Security_Architecture](../architecture/Security_Architecture.md) |
| DA-41 | A completed password reset for a `PENDING_VERIFICATION` account also verifies it, because the emailed link proves control of the address. | Avoids a dead end for users who lost the verification email. | [Authentication_Design](../design/Authentication_Design.md) |

---

## Part C: Items requiring customer confirmation

These do not block the design. The conservative assumption above applies until the customer answers.

| ID | Question | Current assumption |
| --- | --- | --- |
| Q-01 | When an edit of an approved expense is rejected, should the whole expense become `REJECTED` (literal D02/D28), or should the prior approved version be restored? The literal rule lets any approver of the edit remove a previously approved charge. | DA-18 (whole expense `REJECTED`) |
| Q-02 | May SES send group-invitation emails, or must the owner share links manually? | DA-23 (no invitation email) |
| Q-03 | What does the "payment status" report filter mean when every payment is `COMPLETED`? | DA-28 |
| Q-04 | Can a previously approved expense that is awaiting re-approval be withdrawn by the creator? | DA-17 (no) |
| Q-05 | Constitution v1.0.0 still mandates Swing (Principle III). It needs a MAJOR amendment ratified by a human. | See [Constitution_Amendment_Proposal](Constitution_Amendment_Proposal.md) |
