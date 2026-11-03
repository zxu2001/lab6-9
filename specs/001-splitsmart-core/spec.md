# Feature Specification: SplitSmart Core

**Feature Branch**: `001-splitsmart-core`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Create a testable SplitSmart feature specification from the authoritative customer requirements in UserRequirement.md, including actors, scenarios, requirements, acceptance criteria, IDs, and open questions; preserve the full customer inventory and identify the Java Swing MVP subset."

## Clarifications

### Session 2026-10-27

- Q: Should the expense creator be automatically assigned as payer, or must the payer be selected separately from all expense participants? → A: The creator defaults to payer, but the payer may be changed to another participant.
- Q: Who may be included as an expense participant? → A: Only current active group members may be selected; former members remain visible on historical expenses.
- Q: Which rounding rule should be used when equal or percentage splits produce fractional amounts? → A: Round each participant share to cents using half-up rounding, then assign the undistributed remainder to the payer so the expense total remains exact.
- Q: Which expense amounts should the product accept? → A: Expenses MUST be positive amounts with at most two decimal places.
- Q: What percentage total must a percentage split equal? → A: Percentages MUST equal exactly 100 percent before submission.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Maintain an Account and Group (Priority: P1)

A registered person signs in, views only their own expense and balance information, creates a group, and manages its membership.

**Why this priority**: Accounts and groups are the identity and collaboration foundation required by every shared-expense flow.

**Independent Test**: A new user can register, sign in, create a group, add or remove a member, sign out, and sign back in while only authorized information is visible.

**Acceptance Scenarios**:

1. **Given** valid unique registration details, **When** the user submits registration, **Then** the account is created and the user can authenticate.
2. **Given** an authenticated owner, **When** the owner creates and manages a group, **Then** the configured membership is retained and visible to authorized members.
3. **Given** an authenticated user, **When** the user opens personal expense and balance views, **Then** only information permitted for that user is shown.

---

### User Story 2 - Create and Review a Shared Expense (Priority: P1)

A member creates an expense for a group, chooses equal or percentage sharing, identifies involved users, and optionally supplies a receipt image. The configured reviewers approve or reject it before it affects balances.

**Why this priority**: Creating approved expenses is the central value of SplitSmart and drives correct balances.

**Independent Test**: A member can submit an expense and involved users; configured reviewers can approve or reject it; only an approved expense changes balances.

**Acceptance Scenarios**:

1. **Given** a valid expense with an amount, date, description, split method, payer, and involved users, **When** the member submits it, **Then** the creator is the default payer unless another participant was selected and the expense is stored for review.
2. **Given** percentage splits, **When** the submitted percentages produce the valid configured total, **Then** the expense may proceed to review.
3. **Given** a submitted expense, **When** an authorized reviewer approves it, **Then** the expense becomes effective and participant balances change.
4. **Given** a submitted expense, **When** an authorized reviewer rejects it, **Then** it does not affect balances and the submitter is informed.
5. **Given** an expense with an optional receipt, **When** the file is attached and subsequently viewed, **Then** the associated receipt remains linked to that expense.

---

### User Story 3 - Track Balances and Payments (Priority: P1)

A member views who owes whom, records a completed payment, and sees settled or reduced balances without waiting for another expense entry.

**Why this priority**: Balance and payment accuracy allows users to settle expenses and trust the system.

**Independent Test**: After approved expenses, the system calculates pairwise balances; recording a valid payment updates those balances and reports correctly.

**Acceptance Scenarios**:

1. **Given** approved expenses, **When** the user opens balance information, **Then** the amount owed by and to each relevant other user is shown.
2. **Given** a balance owed to another user, **When** a payment is recorded with payer, recipient, date, and amount, **Then** the applicable balance is reduced and cannot exceed what is owed without a review exception.
3. **Given** recorded payments, **When** the user views history or summaries, **Then** approved payments are accurately included.

---

### User Story 4 - Receive Expense Notifications (Priority: P2)

A group member is notified when another authorized member creates a new expense.

**Why this priority**: Notifications keep participants aware of pending financial changes and reviews.

**Independent Test**: Group membership is established, one member creates an expense, and every other intended participant receives the notification without duplicate delivery.

**Acceptance Scenarios**:

1. **Given** an expense submission by a group member, **When** it is created, **Then** applicable group members receive one notification containing the expense identifier, creator, and status.
2. **Given** a notification, **When** the recipient opens it, **Then** the recipient is taken to or shown the relevant expense.

---

### User Story 5 - Produce Expense and Balance Reports (Priority: P2)

A user produces summaries of expenses, balances, and payments and narrows results by supported filters such as date range.

**Why this priority**: Reporting makes historical activity understandable and supports custom review.

**Independent Test**: Users with recorded activity can generate summary and filtered reports that match underlying records.

**Acceptance Scenarios**:

1. **Given** expenses, payments, and balances, **When** the user requests a report, **Then** the report totals agree with the underlying authorized records.
2. **Given** a date range and optional participant or group filters, **When** the report is generated, **Then** only matching records are included and the applied filters are shown.
3. **Given** no records match a report, **When** generation is requested, **Then** an explicit empty result is shown rather than fabricated data.

---

### Edge Cases

- Duplicate account identifiers MUST be rejected with an actionable validation message.
- An expense amount MUST be positive, finite, and have at most two decimal places; zero, negative, malformed, or more-than-two-decimal-place amounts MUST be rejected without changing balances.
- Equal splits MUST round each share to cents using half-up rounding and assign the undistributed remainder to the payer, so the expense total does not change.
- Percentage splits MUST total exactly 100 percent; splits totaling less or more than 100 percent MUST be rejected.
- A percentage split with incomplete or invalid participants MUST be rejected before review.
- A participant removed from a group after an expense was created MUST retain their historical activity.
- Approval attempts by submitters, unauthorized users, or inactive members MUST be denied.
- A rejected expense, superseded record, or failed payment MUST not alter balances.
- Overpayments, duplicate payment submissions, and unsupported receipt files MUST be rejected or clearly flagged.
- No notification destination or report record MUST expose another user's unauthorized information.

## Requirements *(mandatory)*

### Customer Requirements Inventory

The following inventory preserves every customer feature in `UserRequirement.md`; IDs are specification
controls and do not imply implementation details.

| Requirement ID | Source Feature | Requirement |
| --- | --- | --- |
| FR-001 | User accounts | The system MUST allow each person to create and maintain a distinct account. |
| FR-002 | User accounts | The system MUST authenticate an account and provide access to that person's own expense and balance information. |
| FR-003 | Group management | The system MUST allow users to create groups and manage their participants. |
| FR-004 | Expense creation | The system MUST allow authorized users to create an expense with a positive, finite amount having at most two decimal places, date, description, split method, payer, involved users, and optional receipt image; the creator MUST default to payer and the payer MAY be changed to another participant. |
| FR-005 | Expense sharing | The system MUST support equal splitting. |
| FR-006 | Expense sharing | The system MUST support percentage splitting. |
| FR-007 | Expense sharing | Percentage shares MUST total exactly 100 percent and identify every involved share before the expense may be submitted. |
| FR-008 | Expense participation | At creation, expenses MUST include only current active members of the expense group as selectable participants; the system MUST apply expense results only to explicitly involved users. Former members MUST remain visible on historical expense participation after removal from the group. |
| FR-009 | Expense receipt | The system MUST associate an optional receipt image with its expense without making the receipt mandatory. |
| FR-010 | Notifications | The system MUST notify applicable group members when another member creates an expense. |
| FR-011 | Approval workflow | The system MUST review submitted expenses before they affect balances. |
| FR-012 | Approval workflow | The system MUST support the configured number and arrangement of review steps, including a single reviewer workflow. |
| FR-013 | Approval workflow | The system MUST allow authorized reviewers to approve or reject an expense with a recorded decision. |
| FR-014 | Balance tracking | The system MUST calculate the amount owed by each user to every other relevant user from effective expenses. |
| FR-015 | Balance tracking | The system MUST reflect effective expense changes and settled payments in pairwise balances. |
| FR-016 | Payment tracking | The system MUST allow users to record payer, recipient, date, amount, and optional reference for a payment intended to settle balances. |
| FR-017 | Payment tracking | Recorded payments MUST update balances accurately and remain traceable in payment history. |
| FR-018 | Reporting | The system MUST provide expense summaries and reports. |
| FR-019 | Reporting | The system MUST provide balance summaries and reports. |
| FR-020 | Reporting | The system MUST provide payment summaries and reports. |
| FR-021 | Reporting | The system MUST permit custom reports using specified date ranges and other supported filters. |
| FR-022 | Platform | The customer-requested primary delivery platform MUST be identified as web-based; desktop delivery MUST be managed as the explicitly labeled MVP implementation decision described below. |

### Additional Testable Functional Requirements

| Requirement ID | Requirement |
| --- | --- |
| FR-023 | A submitted expense, approval decision, and payment MUST retain enough history to explain later balance calculations. |
| FR-024 | A user MUST not view, modify, approve, or report another user's private account data unless the user has an authorized group or business relationship for that record. |
| FR-025 | Invalid account, group, expense, approval, payment, or report input MUST produce a result identifying the field and reason rather than partial or silent success. |
| FR-026 | A notification, expense, approval, payment, or report operation MUST complete without changing balances if its required validation fails. |
| FR-027 | Group membership changes after an expense is recorded MUST not retroactively rewrite historical expense participation. |
| FR-028 | Users MUST be able to review pending, approved, and rejected expenses in applicable views. |

### Non-Functional Requirements

| Requirement ID | Requirement |
| --- | --- |
| NFR-001 | Equal and percentage shares MUST round to cents using half-up rounding; the payer MUST receive the undistributed remainder so the expense total remains exact, and all balance and payment calculations MUST produce the exact configured monetary result. |
| NFR-002 | Sensitive account and financial data MUST be protected from unauthorized access and disclosure. |
| NFR-003 | Audit-relevant account actions, expense decisions, and payment changes MUST be attributable to an authenticated identity and timestamp. |
| NFR-004 | Primary user journeys MUST complete with clear feedback under normal operating conditions; a failure MUST preserve the entered financial data when possible. |
| NFR-005 | Reports with supported filters MUST return complete and internally consistent totals for the selected records. |
| NFR-006 | The desktop MVP MUST keep presentation and business concerns separated so business rules can be tested independently. |
| NFR-007 | Desktop MVP release verification MUST include automated tests of non-trivial business rules and display-critical workflows. |
| NFR-008 | AI-generated artifacts MUST receive human review before acceptance or commit. |

### Java Swing MVP Subset

The desktop MVP is an implementation subset, not a replacement for the customer inventory. The MVP
SHOULD deliver the following customer capabilities first:

- account registration and sign-in (FR-001, FR-002);
- group creation and membership management (FR-003);
- expense entry with amount, date, description, equal or percentage split, participants, and optional receipt (FR-004 through FR-009);
- single-review approval before balances change (FR-011, FR-013);
- pairwise balance and payment tracking (FR-014 through FR-017);
- expense, balance, and payment summary views (FR-018 through FR-020); and
- desktop presentation implemented with Java Swing.

Notifications (FR-010), configurable multi-level approval (FR-012), custom filtered reports (FR-021),
and the primary web delivery target (FR-022) remain in the full customer inventory. They are not
assumed to be complete in the desktop MVP unless the MVP scope is explicitly expanded.

### Acceptance Criteria by Requirement Group

- **AC-FR-001/002**: Repeated registration with one identifier and successful and failed sign-in attempts produce the specified account, uniqueness, access, or error results.
- **AC-FR-003**: A group owner can create a group, add/remove eligible members, and see the resulting membership retained.
- **AC-FR-004/009**: Each required expense field, both split methods, involved participants, and the optional receipt are represented and validated independently.
- **AC-FR-010**: Creation by a member produces one notification for each applicable member, with no disclosure to unauthorized recipients.
- **AC-FR-011/013**: Pending expense balances are unchanged; approval changes balances once; rejection leaves balances unchanged; duplicate decisions are rejected.
- **AC-FR-014/017**: Recalculated pairwise balances equal the accepted expense allocations minus accepted payments for the same participants.
- **AC-FR-018/021**: Each summary or filtered report matches its source records, selected range, and displayed filters.
- **AC-NFR-001**: Repeated monetary calculations with the same inputs produce the same exact result within the stated rounding policy.

### Key Entities *(include if feature involves data)*

- **User Account**: Identity, authentication information, and account state of a person using SplitSmart.
- **Group**: Named collection of accounts, membership roles, and configured approval policy.
- **Expense**: Creator, amount, date, description, split method, approval status, involved participants, and optional receipt reference.
- **Expense Share**: Participant, allocated amount or percentage, and relationship to its expense.
- **Approval Decision**: Reviewer, decision, timestamp, review step, and outcome.
- **Balance**: Derived net amount owed between two applicable users, based on effective expenses and payments.
- **Payment**: Payer, recipient, amount, date, optional reference, and confirmation state.
- **Notification**: Recipient, triggering expense, message state, and read status.
- **Report**: User-selected record scope, filters, generated totals, and presentation state.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95 percent of test participants complete account creation and sign-in without assistance on the first attempt.
- **SC-002**: 95 percent of test participants can create a complete valid expense and reach review status in under two minutes.
- **SC-003**: Approved expense allocations and recorded payments reconcile to zero total group imbalance within the configured rounding policy in every test case.
- **SC-004**: 100 percent of unauthorized protected-record access attempts are denied in acceptance testing.
- **SC-005**: In 20 representative expense and payment scenarios, reports and pairwise balances agree with independently calculated expected totals.
- **SC-006**: 90 percent of test participants correctly identify a pending, approved, or rejected expense and the users affected by it.
- **SC-007**: 100 percent of tested invalid expense inputs are rejected without changing existing balances.

## Assumptions

- A valid sign-in uses an account identifier and credential managed by the product; exact authentication technology is outside this requirements document.
- An authenticated account identifier uniquely distinguishes each person.
- A percentage split MUST total exactly 100 percent and MUST be validated before review.
- Equal and percentage shares round to cents using half-up rounding, with any remainder assigned to the payer.
- Single-review approval and configurable multiple-review approval use the same recorded decision states and audit model.
- The desktop MVP is a current implementation delivery choice, while `UserRequirement.md` remains authoritative for the full customer scope.
- Internet or hosted service behavior is not part of the desktop MVP unless the implemented delivery model requires it.
- Primary web-based delivery is a customer platform requirement; desktop MVP status does not remove or replace that requirement.
- Receipt files supported by the MVP are limited to image formats, subject to a later documented format limit.

## Open Questions

1. **Approval policy for each group:** Which roles may approve expenses, and is one review sufficient or does the customer require configurable multiple-level approval?
2. **Payment confirmation:** Are recorded payments considered final immediately or subject to recipient verification before balances change?
3. **Desktop MVP versus customer web target:** For this course delivery, which subset must be demonstrated in the desktop MVP, while preserving the web-based full requirement for later delivery?
