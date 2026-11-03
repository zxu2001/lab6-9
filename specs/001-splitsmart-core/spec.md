# Feature Specification: SplitSmart Core

**Feature Branch**: `001-splitsmart-core`

**Created**: 2026-10-27 | **Revised**: 2026-11-03 (v2: reconciled with customer decisions D01–D41)

**Status**: Baseline for design (v2). Requires human review per Constitution IX.

**Input**: User description: "Create a testable SplitSmart feature specification from the authoritative customer requirements in UserRequirement.md, including actors, scenarios, requirements, acceptance criteria, IDs, and open questions."

**Authoritative sources (precedence high → low)**: (1) [Customer Decision Register](../../docs/requirements/Customer_Decision_Register.md) D01–D41; (2) [`UserRequirement.md`](../../UserRequirement.md) (historical baseline, preserved unchanged); (3) the 2026-10-27 clarifications below (partly superseded). Conflicts are recorded in [Requirements_Conflict_Resolution](../../docs/requirements/Requirements_Conflict_Resolution.md). Detailed rules are in [Business_Rules](../../docs/requirements/Business_Rules.md).

## Revision Summary (v1 → v2)

- Delivery changes from a Java Swing desktop MVP to a **server-rendered Spring Boot web application** with PostgreSQL on Amazon RDS (D01, D06, D07, D12). The "Java Swing MVP Subset" section is retired.
- Single-reviewer approval is replaced by **unanimous approval** by the frozen set (participants ∪ payer) − creator (D02, D35).
- Rounding changes from "half-up + remainder to payer" to **deterministic leftover-cent allocation by stable participant ID** (D09).
- Pairwise balances across all users are replaced by **per-group net balances and simplified settlement plans** (D21, D34).
- Payments are **full settlements, recorded by the debtor, immediately COMPLETED and final** (D03, D23, D39, D40).
- New capabilities: email verification and password reset, invitations, ownership, categories, expense versioning and cancellation, archiving, and in-app approval-request notifications.

## Clarifications

### Session 2026-10-27 (historical; status updated 2026-11-03)

| # | Clarification (original) | v2 status |
| --- | --- | --- |
| C1 | The creator defaults to payer, and the payer may be changed to another participant. | **Revised by D20/D38**: the creator defaults to payer, the payer may be any active member, and the payer need **not** be a split participant. |
| C2 | Only current active group members may be selected; former members remain visible on historical expenses. | **Retained** and strengthened by D25 (frozen per version). |
| C3 | Round each share half-up to cents; the payer receives the remainder. | **Superseded by D09**: floor to cents, then distribute leftover cents deterministically (BR-SPL-02/03). |
| C4 | Expenses must be positive with at most two decimal places. | **Retained** (+ USD only, D18; upper bound DA-26). |
| C5 | Percentages must total exactly 100 percent. | **Retained** (D09). |

### Session 2026-11-03 (customer decisions)

The 41 customer decisions D01–D41 are recorded in the [Customer Decision Register](../../docs/requirements/Customer_Decision_Register.md) and are authoritative. Design assumptions DA-01–DA-41 are listed there separately and are **not** customer-approved.

## Actors

| Actor | Description |
| --- | --- |
| Anonymous visitor | Not signed in. May register, verify email, request a password reset, and view the sign-in page. |
| Unverified user | Registered, `PENDING_VERIFICATION`. Cannot sign in. May request a new verification email. |
| Verified user | `ACTIVE` account. May create groups and accept invitations addressed to their email. |
| Group member (active / inactive) | Membership in a group. Inactive members keep read access to records they were involved in. |
| Group owner | Exactly one per group. Manages invitations, categories, membership removal, ownership transfer, and archiving. No approval override. |
| Expense creator / payer / split participant / required approver | Roles relative to one expense version. |
| Debtor / creditor | Roles relative to a settlement-plan transfer. |
| System | Clock-driven behavior (invitation expiry) and automatic approval. |
| Amazon SES | External service for verification and reset emails only. |

Use case diagrams: [01_Use_Case_Overview](../../docs/uml/01_Use_Case_Overview.puml), [02](../../docs/uml/02_Use_Case_Expense_Management.puml), [03](../../docs/uml/03_Use_Case_Group_Management.puml), [04](../../docs/uml/04_Use_Case_Settlement.puml).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register, Verify, and Sign In (Priority: P1)

A person registers with email and password, verifies their email through a one-time link, signs in, and can recover a forgotten password.

**Independent Test**: Register → receive a (mock) verification email → verify → sign in → request a reset → reset → sign in with the new password.

**Acceptance Scenarios**:

1. **Given** a unique email, **When** the user registers, **Then** the account is `PENDING_VERIFICATION`, a verification email is sent, and sign-in is refused until verification.
2. **Given** a valid unexpired token, **When** the link is opened, **Then** the account becomes `ACTIVE` and the token cannot be reused.
3. **Given** any email, **When** a reset is requested, **Then** the same generic response is shown whether or not the account exists.
4. **Given** a valid reset link, **When** a new password is set, **Then** old sessions and other reset tokens are invalidated.

### User Story 2 - Create and Manage a Group (Priority: P1)

A verified user creates a group (becoming owner), invites people by email, manages custom categories, transfers ownership, and removes members or leaves when allowed.

**Independent Test**: Create a group → invite → the invitee accepts with a matching verified account → transfer ownership → the former owner leaves (balances zero).

**Acceptance Scenarios**:

1. **Given** a verified user, **When** they create a group, **Then** they are its single owner and an active member.
2. **Given** an owner, **When** they invite an email, **Then** a single-use link valid for 7 days is produced and only a verified account with that email can accept it.
3. **Given** a member with a non-zero balance or an unresolved approval responsibility, **When** they try to leave or are removed, **Then** the action is refused with the reason.
4. **Given** an owner, **When** they try to leave, **Then** they must first transfer ownership to another active member.

### User Story 3 - Create, Approve, Edit, and Cancel an Expense (Priority: P1)

An active member records an expense (amount, date, description, category, payer, equal or percentage split, optional receipts). Every required approver must approve before it affects balances. The creator may edit (creating a new version) or cancel.

**Independent Test**: Alice creates a $90 expense paid by Alice for Bob and Carol → Bob and Carol receive approval-request notifications → both approve → balances update → Alice edits the amount → the expense stops affecting balances until re-approved.

**Acceptance Scenarios**:

1. **Given** a valid expense, **When** submitted, **Then** version 1 is `PENDING`, the required approvers are (participants ∪ payer) − creator, and each receives one in-app notification.
2. **Given** no required approvers (creator is sole payer and participant), **When** submitted, **Then** the expense is approved automatically and the auto-approval is audited.
3. **Given** a pending version, **When** any required approver rejects with a reason, **Then** the expense is `REJECTED` and final.
4. **Given** an approved expense, **When** the creator edits it, **Then** a new version is pending, prior approvals no longer count, and the expense stops affecting balances until the new version is approved.
5. **Given** an approved expense, **When** the creator requests cancellation, **Then** it keeps affecting balances until all cancellation approvers approve. Any rejection leaves it approved.

### User Story 4 - View Balances and Settle Up (Priority: P1)

A member views per-group net balances and a simplified settlement plan. A debtor records a full settlement to a creditor, after a finality warning.

**Independent Test**: After approved expenses, the plan lists transfers. The debtor records one. The amount equals the current obligation even if it changed after the page was displayed.

**Acceptance Scenarios**:

1. **Given** approved expenses and payments, **When** balances are shown, **Then** net balances sum to $0.00 within the group and nothing is offset across groups.
2. **Given** a plan transfer debtor→creditor, **When** the debtor records it, **Then** a `COMPLETED` payment for the full current obligation is created. It can never be edited or reversed.
3. **Given** the obligation changed after display, **When** submitted, **Then** the current amount is used, and the adjustment is shown and audited. If it is zero, no payment is created.
4. **Given** a creditor or another member, **When** they try to record a payment for the debtor, **Then** it is refused.

### User Story 5 - Approval-Request Notifications (Priority: P2)

Required approvers see persistent in-app notifications for approval requests only.

**Acceptance Scenarios**:

1. **Given** a new, edited, or cancellation approval request, **When** created, **Then** each required approver gets exactly one unread notification. Nobody else does.
2. **Given** a payment, report, or invitation, **When** it occurs, **Then** no notification is created.

### User Story 6 - Filtered Reports (Priority: P2)

A member produces expense, balance, and payment reports filtered by date range, member, category, and payment status, plus a cross-group overview.

**Acceptance Scenarios**:

1. **Given** filters, **When** a report is generated, **Then** only matching authorized records are included, the filters are displayed, and `EFFECTIVE` totals reconcile with balances.
2. **Given** no matches, **Then** an explicit empty result is shown.
3. **Given** several groups, **When** the overview is shown, **Then** per-group figures appear side by side and are never netted across groups.

### User Story 7 - Archive a Group (Priority: P3)

The owner archives a settled group. It becomes permanently read-only.

**Acceptance Scenarios**:

1. **Given** all balances zero and no unresolved workflows, **When** the owner archives, **Then** the group is `ARCHIVED`, pending invitations are revoked, and all mutations are refused.
2. **Given** any non-zero balance or open workflow, **Then** archiving is refused with the reasons.

### Edge Cases

All edge cases are specified as testable rules in [Business_Rules](../../docs/requirements/Business_Rules.md) and as cases in [Financial_Edge_Cases](../../docs/testing/Financial_Edge_Cases.md). Key cases:

- $100.00 / 3 and $0.02 / 3 equal splits. Percentages of 99.99% or 100.01% are rejected.
- The payer is excluded from the split (Alice pays $90 for Bob and Carol).
- An edit of an approved expense is followed by rejection (DA-18). Cancellation after payments reverses the settlement direction.
- Stale and concurrent payment submissions. An archive racing an expense creation.
- Invitation accepted after expiry, after revocation, after archive, or by the wrong account.

## Requirements *(mandatory)*

### Functional Requirements

"Status" compares each ID with v1 (2026-10-27). Detailed rules are referenced as BR-IDs.

| ID | Requirement | Decisions | Rules | Status |
| --- | --- | --- | --- | --- |
| FR-001 | The system MUST let a person register with a unique email, display name, and password. The account starts `PENDING_VERIFICATION`. | D11, D30 | BR-AUTH-01–03 | Revised |
| FR-002 | The system MUST authenticate verified accounts by email and password (Spring Security, server-side session) and show each user only data they are authorized to see. | D11 | BR-AUTH-10 | Revised |
| FR-003 | Any verified user MUST be able to create a group and become its owner. Membership is managed through invitations, leaving, and removal. | D08, D17 | BR-GRP-01 | Revised |
| FR-004 | Any active member of an active group MUST be able to create an expense with amount (USD, 0.01–1,000,000.00, ≤ 2 dp), expense date, description, category, payer (any active member; defaults to creator), split method, split participants, and 0–10 optional receipts. | UR*, D18, D20, D22, D38 | BR-EXP-01–07 | Revised |
| FR-005 | The system MUST support equal splits with deterministic leftover-cent allocation. | D09 | BR-SPL-02 | Revised |
| FR-006 | The system MUST support percentage splits. | D09 | BR-SPL-03 | Retained |
| FR-007 | Percentages MUST total exactly 100.00, and allocated shares MUST total the expense amount. | D09 | BR-SPL-03/04 | Retained |
| FR-008 | Payer and split participants MUST be active members at submission. The participant list is frozen per version. New members are never added automatically. | D25, D38 | BR-EXP-04/05 | Revised |
| FR-009 | Expenses MUST support multiple optional JPEG/PNG/PDF receipts stored in PostgreSQL with metadata, validation, and authorization. | D13, D27 | BR-RCP-* | Revised |
| FR-010 | The system MUST create persistent in-app notifications with read/unread status **only** for approval requests (new, re-approval, cancellation). | D04, D26 | BR-NOT-* | Revised |
| FR-011 | Only the effective approved version of an `APPROVED` expense MUST affect balances. Pending, rejected, and cancelled expenses MUST NOT. | D02, D10, D14 | BR-BAL-02 | Revised |
| FR-012 | Required approvers MUST be (split participants ∪ payer) − creator, deduplicated and frozen per version. | D35 | BR-APR-01 | Revised (replaces "configurable review steps") |
| FR-013 | Approval MUST be unanimous. Any rejection (with reason) makes the expense `REJECTED` immediately. The creator cannot approve. Decisions are recorded once. | D02, D28 | BR-APR-03–07 | Revised |
| FR-014 | The system MUST calculate each member's net balance within each group. | D21, D34 | BR-BAL-01 | Revised (replaces pairwise) |
| FR-015 | Balances MUST be derived from effective expense versions and completed payments and never stored as authoritative. | D34, DA-12 | BR-BAL-02–05 | Revised |
| FR-016 | Only the debtor MUST be able to record a settlement, which covers the full current obligation to one creditor in the group. No partial payments or overpayments. | D23, D39 | BR-PAY-01/02/05 | Revised |
| FR-017 | Recorded payments MUST be immediately `COMPLETED` and final: no edit, delete, cancel, or reversal. They remain traceable in history. | D03, D40 | BR-PAY-06 | Revised |
| FR-018 | The system MUST provide expense reports. | D05 | BR-RPT-01 | Retained |
| FR-019 | The system MUST provide balance reports. | D05 | BR-RPT-01 | Retained |
| FR-020 | The system MUST provide payment reports. | D05 | BR-RPT-01 | Retained |
| FR-021 | Reports MUST support filters for date range, group member, expense category, and payment status, on screen. No CSV export. | D05 | BR-RPT-02/03 | Revised (now MVP) |
| FR-022 | The system MUST be delivered as a web application with a cloud-hosted database. | D01, D06 | none | **Revised** (desktop MVP retired) |
| FR-023 | The system MUST keep full expense version history, decisions, cancellation requests, and payments. | D10, D19 | BR-VER-02, BR-AUD-* | Revised |
| FR-024 | The server MUST enforce group-level, object-level authorization and prevent cross-group access. | D11, D21 | DA-31, DA-40 | Revised |
| FR-025 | Invalid input MUST produce a result identifying the field and reason. | none | none | Retained |
| FR-026 | Each operation MUST be atomic. On failure nothing is changed (no partial success). | D19 | NFR-009 | Retained |
| FR-027 | Membership changes MUST NOT rewrite historical expense participation or approver identities. | D16, D25 | BR-GRP-07 | Retained |
| FR-028 | Users MUST be able to view pending, approved, rejected, and cancelled expenses and each expense's version history. | D10, D28 | none | Revised |
| FR-029 | Accounts MUST be activated only through single-use, expiring email-verification tokens. | D30 | BR-AUTH-04/05 | New |
| FR-030 | Users MUST be able to reset forgotten passwords through single-use, expiring links, without disclosing whether an email exists. | D30 | BR-AUTH-06/07 | New |
| FR-031 | Verification and reset emails MUST be sent through an `EmailService` abstraction (Amazon SES in production, mock in dev/test). No other emails. | D31 | BR-AUTH-09 | New |
| FR-032 | Joining a group MUST be by invitation only. Invitations are `PENDING`, `ACCEPTED`, `EXPIRED`, or `REVOKED`. | D08, D37 | BR-INV-* | New |
| FR-033 | Invitations MUST be single-use, email-bound, valid 7 days, accepted only by a matching verified account, revocable while pending, stored as token hashes, and unusable for archived groups. | D37 | BR-INV-02–08 | New |
| FR-034 | Each group MUST have exactly one owner, transferable to another active member. No administrator role. The owner must transfer before leaving. Ownership gives no approval override. | D17 | BR-GRP-02–04 | New |
| FR-035 | Leaving or removal MUST be refused while the member has a non-zero balance or unresolved responsibilities. Departure sets `INACTIVE`. | D16 | BR-GRP-05–09 | New |
| FR-036 | Only the owner MUST be able to archive a group, only when balances are zero and no approvals or cancellations are unresolved. Archiving is irreversible and makes the group read-only. | D29, D36 | BR-ARC-* | New |
| FR-037 | The system MUST provide predefined categories and owner-managed group custom categories (create, rename, deactivate), keeping historical references valid. | D22 | BR-CAT-* | New |
| FR-038 | The payer MUST be credited the full amount. Only split participants owe shares. The payer may be excluded from the split. | D20 | BR-EXP-06 | New |
| FR-039 | Only the creator MUST be able to edit a pending or approved expense. Each edit (including receipt changes) creates an immutable version and restarts approval. An edited approved expense stops affecting balances until re-approved. | D10, D25, D27 | BR-VER-* | New |
| FR-040 | The creator MUST be able to cancel directly a pending expense that was never approved. | D14 | BR-CAN-01/02 | New |
| FR-041 | Cancelling an approved expense MUST require unanimous approval by the frozen cancellation-approver set. It keeps affecting balances while pending. Rejection leaves it approved. Payments are never reversed. | D14 | BR-CAN-03–10 | New |
| FR-042 | Rejected expenses MUST be final (no edit, reopen, or resubmit) and retained. | D28 | BR-APR-05, BR-VER-06 | New |
| FR-043 | An expense with no required approvers MUST be approved automatically and audited. | D15 | BR-APR-02 | New |
| FR-044 | Approvals and cancellation approvals MUST NOT expire automatically. | D41 | BR-APR-08 | New |
| FR-045 | The system MUST produce a deterministic simplified settlement plan per group. | D34 | BR-SET-* | New |
| FR-046 | Balances and settlements MUST be isolated per group. | D21 | BR-BAL-04 | New |
| FR-047 | A stale displayed settlement amount MUST be replaced automatically by the current obligation. Zero obligation → no payment. The adjustment is displayed and audited. Safe under concurrency. | D24 | BR-PAY-02–04, BR-PAY-08 | New |
| FR-048 | The payment form MUST show a finality warning before recording. | D40 | BR-PAY-07 | New |
| FR-049 | A cross-group overview MAY show per-group figures but MUST NOT merge obligations. | D21 | BR-RPT-04 | New |
| FR-050 | The system MUST audit the actions listed in BR-AUD-02 with actor and UTC timestamp. | D14, D15, D19, D24 | BR-AUD-* | New |
| FR-051 | All money MUST be USD. No currency conversion. | D18 | BR-EXP-03 | New |

* UR = the original customer expense fields in `UserRequirement.md`.

### Nonfunctional Requirements

See [Nonfunctional_Requirements](../../docs/requirements/Nonfunctional_Requirements.md) (NFR-001–NFR-020).

### Key Entities

UserAccount, EmailVerificationToken, PasswordResetToken, Group, GroupMembership, GroupInvitation, ExpenseCategory, Expense, ExpenseVersion, ExpenseAllocation, ExpenseApproval, ExpenseCancellationRequest, CancellationApproval, Receipt (+ ReceiptContent), Payment, Notification, AuditEvent. Derived (not stored): NetBalance, SettlementPlan, Report. See [data-model.md](./data-model.md) and the [Domain_Model](../../docs/design/Domain_Model.md).

## Success Criteria *(mandatory)*

| ID | Criterion | Note |
| --- | --- | --- |
| SC-001 | At least 95% of test participants complete registration, verification, and sign-in unaided on the first attempt. | Proposed course metric |
| SC-002 | 95% of test participants create a valid expense and reach approval-pending status in under two minutes. | Proposed course metric |
| SC-003 | In every automated test, group net balances sum to exactly $0.00, and Σ shares equals the amount for every version. | Verified by UT-BAL-03, UT-SPL-10 |
| SC-004 | 100% of unauthorized and cross-group access attempts in the security suite are denied. | SEC-* |
| SC-005 | In 20 representative scenarios (FIN-01–FIN-20), balances, plans, and reports equal independently calculated expected values. | FIN-* |
| SC-006 | 90% of participants correctly identify an expense's status, version, and affected members. | Proposed course metric |
| SC-007 | 100% of invalid financial inputs are rejected with no change to balances. | UT/IT validation suites |

## Assumptions

Design assumptions DA-01–DA-41 are listed in the [Customer Decision Register, Part B](../../docs/requirements/Customer_Decision_Register.md#part-b-design-assumptions-not-customer-approved). They are engineering defaults, not customer requirements.

## Open Questions

v1 Open Questions 1–3 are **resolved**: approval policy by D02/D35, payment confirmation by D03, platform by D01/D06. Remaining items Q-01–Q-05 are in [Part C of the Decision Register](../../docs/requirements/Customer_Decision_Register.md#part-c-items-requiring-customer-confirmation).
