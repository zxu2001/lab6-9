# Domain Model

| Layer | `com.splitsmart.domain` (no Spring, web, or infrastructure dependencies; `jakarta.persistence` annotations allowed per AD-08) |
| --- | --- |
| UML | [09_Domain_Class_Diagram](../uml/09_Domain_Class_Diagram.puml), state machines [13](../uml/13_Expense_State_Machine.puml)–[17](../uml/17_Account_Verification_State_Machine.puml) |
| Schema mapping | [PostgreSQL_Schema_Design](../database/PostgreSQL_Schema_Design.md) |
| Rules | [Business_Rules](../requirements/Business_Rules.md) |

Method signatures are **design specifications**, not Java code. `Instant now` and `LocalDate today` are always passed in (from the application's injected `Clock`). The domain never reads the clock itself.

## 1. Value objects (`domain.finance`, `domain.model`)

| Value object | State | Invariants | Key operations |
| --- | --- | --- | --- |
| `Money` | `BigDecimal amount` (scale 2), currency fixed USD | Scale exactly 2; finite; constructed only via `Money.of(String/BigDecimal)` or `Money.ofCents(long)` | `plus(Money)`, `minus(Money)`, `negate()`, `isZero()`, `isPositive()`, `compareTo`, `toCents(): long`, `static ZERO` |
| `ExpenseAmount` (factory over `Money`) | n/a | 0.01 ≤ amount ≤ 1,000,000.00; input scale ≤ 2 (BR-EXP-03) | `static Money parse(String raw) throws ValidationException("amount", code)` |
| `Percentage` | `BigDecimal value` (scale ≤ 2) | 0 < value ≤ 100 | `toBasisPoints(): int` |
| `EmailAddress` | `String normalized` | Trimmed, lower-cased, RFC-5322-lite syntax, ≤ 320 chars | `static of(String raw)` |
| `DateRange` | `LocalDate from, to` (inclusive, either may be open) | `from ≤ to` | `contains(LocalDate)` |
| `LedgerPosting` | `long groupId, long userId, Money delta, PostingType type, Long expenseId, Long expenseVersionId, Long paymentId, LocalDate businessDate` | n/a | n/a |
| `Allocation` | `SortedMap<Long, Money> shares`, `SortedMap<Long, Percentage> percentages` (optional) | Σ shares = amount | `shareOf(long userId)` |
| `NetBalances` | `long groupId, SortedMap<Long, Money> nets` | Σ = 0.00 | `of(long userId)`, `allZero()` |
| `Transfer` | `long debtorId, long creditorId, Money amount` | amount > 0; debtor ≠ creditor | n/a |
| `SettlementPlan` | `long groupId, List<Transfer> transfers, String ledgerFingerprint` | SP-1–SP-5 | `obligation(long debtorId, long creditorId): Money` |
| `ApproverSet` | `SortedMap<Long userId, ApprovalBasis basis>` | Excludes the creator | `isEmpty()`, `contains(long)` |

## 2. Entities and aggregates (`domain.model`)

### 2.1 `UserAccount`

| Field | Type |
| --- | --- |
| id | Long |
| email | EmailAddress |
| displayName | String |
| passwordHash | String |
| status | `UserStatus` |
| emailVerifiedAt, lockedUntil | Instant |
| failedLoginCount | int |
| version | long |

| Operation | Pre | Post |
| --- | --- | --- |
| `static register(EmailAddress, String displayName, String passwordHash, Instant now)` | Hash supplied by the application | status = `PENDING_VERIFICATION` |
| `verifyEmail(Instant now)` | status = `PENDING_VERIFICATION` | status = `ACTIVE`, `emailVerifiedAt = now` |
| `changePassword(String newHash, Instant now)` | status ≠ `DISABLED` | Hash replaced; lockout cleared |
| `recordFailedLogin(Instant now, int threshold, Duration lock)` | n/a | Counter +1; lock when threshold reached |
| `recordSuccessfulLogin()` | n/a | Counter reset |

### 2.2 `EmailVerificationToken` / `PasswordResetToken`

Fields: `id, userId, tokenHash, createdAt, expiresAt, usedAt, invalidatedAt`. Operations: `isUsable(Instant now)`, `markUsed(Instant now)`, `invalidate(Instant now)`. State machine: [17](../uml/17_Account_Verification_State_Machine.puml).

### 2.3 `Group` (aggregate root; its DB row is also the ledger lock)

| Field | Type |
| --- | --- |
| id, name, description | n/a |
| ownerUserId | long |
| status | `GroupStatus` |
| createdAt, archivedAt, archivedByUserId | n/a |
| version | long |

| Operation | Pre | Post | Rule |
| --- | --- | --- | --- |
| `static create(String name, String description, long creatorId, Instant now)` → (Group, GroupMembership) | Creator `ACTIVE` | Owner = creator; owner membership `ACTIVE` | BR-GRP-01 |
| `requireActive()` | n/a | Throws `GroupArchivedException` if `ARCHIVED` | BR-ARC-04 |
| `transferOwnership(long actorId, GroupMembership target)` | actor = owner; target `ACTIVE`, ≠ owner; group `ACTIVE` | owner = target | BR-GRP-03 |
| `archive(long actorId, ArchiveEligibility eligibility, Instant now)` | actor = owner; `eligibility.isEligible()`; `ACTIVE` | `ARCHIVED` | BR-ARC-* |

State machine: [15_Group_State_Machine](../uml/15_Group_State_Machine.puml).

### 2.4 `GroupMembership`

Fields: `id, groupId, userId, status, joinedAt, joinedViaInvitationId, deactivatedAt, deactivatedByUserId, deactivationReason, version`.

| Operation | Pre | Post |
| --- | --- | --- |
| `deactivate(long actorId, DeactivationReason reason, DeactivationEligibility e, Instant now)` | status `ACTIVE`; `e.isEligible()` | `INACTIVE` |
| `reactivate(long invitationId, Instant now)` | status `INACTIVE` | `ACTIVE`; deactivation fields cleared (history in audit) |

### 2.5 `GroupInvitation`

Fields: `id, groupId, invitedEmail, tokenHash, status, invitedByUserId, createdAt, expiresAt, acceptedByUserId, acceptedAt, revokedByUserId, revokedAt, revocationReason, expiredAt, version`.

| Operation | Pre | Post |
| --- | --- | --- |
| `static issue(long groupId, EmailAddress email, String tokenHash, long ownerId, Instant now)` | n/a | `PENDING`; `expiresAt = now + 7 days` |
| `accept(UserAccount acceptor, Group group, Instant now)` | BR-INV-04 (else `InvitationNotAcceptableException(reason)`) | `ACCEPTED` |
| `revoke(long actorId, RevocationReason reason, Instant now)` | `PENDING` | `REVOKED` |
| `expireIfDue(Instant now)` → boolean | `PENDING`, `now ≥ expiresAt` | `EXPIRED` |

State machine: [16_Invitation_State_Machine](../uml/16_Invitation_State_Machine.puml).

### 2.6 `ExpenseCategory`

Fields: `id, groupId (nullable), name, active, version`. Operations: `rename(String, long actorId)`, `deactivate(long actorId)`, `isSelectableFor(long groupId)` (active, and predefined or `groupId` matches).

### 2.7 `Expense` (aggregate root) and `ExpenseVersion`

`Expense`:

| Field | Type |
| --- | --- |
| id | Long |
| groupId | long |
| creatorUserId | long |
| status | `ExpenseStatus` |
| currentVersion | ExpenseVersion |
| effectiveVersion | ExpenseVersion (nullable) |
| everApproved | boolean |
| createdAt, updatedAt, rejectedAt, cancelledAt | Instant |
| version | long |

`ExpenseVersion`:

| Field | Notes |
| --- | --- |
| id, expenseId, groupId, versionNumber | n/a |
| amount (Money), expenseDate, description, categoryId, payerUserId, splitMethod | n/a |
| status | `ExpenseVersionStatus` |
| autoApproved | boolean |
| createdByUserId, createdAt, approvedAt, rejectedAt, supersededAt, cancelledAt, changeSummary | n/a |
| allocations | `List<ExpenseAllocation>` |
| approvals | `List<ExpenseApproval>` |
| receiptLinks | `List<ExpenseVersionReceipt>` |

`ExpenseAllocation(participantUserId, Percentage percentage?, Money share)`. `ExpenseApproval(approverUserId, ApprovalBasis basis, ApprovalDecision decision?, Instant decidedAt?, String reason?, version)`.

| Operation (on `Expense`) | Pre | Post | Rule |
| --- | --- | --- | --- |
| `static submit(long groupId, long creatorId, ExpenseDraft draft, Allocation alloc, ApproverSet approvers, Instant now)` | Draft valid; group active (checked by the caller) | v1 `PENDING` with frozen allocations and approvers. If `approvers.isEmpty()`, `autoApprove(now)` | BR-APR-01/02 |
| `recordApproval(long approverId, String comment, Instant now)` → `ApprovalOutcome` | status `PENDING_APPROVAL`; approver ∈ current version's set, undecided; approver ≠ creator | Decision stored. If all approved, version and expense become `APPROVED`, `effectiveVersion = current`, `everApproved = true` | BR-APR-03/04/06 |
| `recordRejection(long approverId, String reason, Instant now)` | Same as above; reason 1–500 chars | Version `REJECTED`; expense `REJECTED` | BR-APR-05 |
| `edit(long actorId, ExpenseDraft draft, Allocation alloc, ApproverSet approvers, int expectedVersionNumber, EditContext ctx, Instant now)` → ExpenseVersion | `ExpenseEditPolicy.check(...)` passes (BR-VER-01, 06–10) | New version n+1 `PENDING`; previous version `SUPERSEDED`. If it was `APPROVED`, `effectiveVersion = null` and status `PENDING_APPROVAL`. Auto-approve if the set is empty. | BR-VER-02–05 |
| `cancelPending(long actorId, Instant now)` | creator; `PENDING_APPROVAL`; `!everApproved` | Version and expense `CANCELLED` | BR-CAN-01/02 |
| `openCancellation(long actorId, String reason, ApproverSet approvers, Instant now)` → `ExpenseCancellationRequest` | creator; `APPROVED`; no `OPEN` request; no inactive involved member | Request `OPEN` with a frozen set; auto-approve if empty | BR-CAN-03/04/10 |
| `applyCancellation(ExpenseCancellationRequest approved, Instant now)` | Request `APPROVED`, for the effective version | Expense and version `CANCELLED`; `effectiveVersion = null` | BR-CAN-06 |
| `involvedUserIds(ExpenseVersion v)` → SortedSet | n/a | payer ∪ participants | n/a |

State machine: [13_Expense_State_Machine](../uml/13_Expense_State_Machine.puml).

### 2.8 `ExpenseCancellationRequest` and `CancellationApproval`

Fields: `id, expenseId, expenseVersionId, groupId, requestedByUserId, reason, status, autoApproved, createdAt, resolvedAt, approvals: List<CancellationApproval>, version`.

| Operation | Pre | Post |
| --- | --- | --- |
| `recordApproval(long approverId, Instant now)` → outcome | `OPEN`; approver ∈ set, undecided | When all approved: `APPROVED` (the caller then applies `Expense.applyCancellation`) |
| `recordRejection(long approverId, String reason, Instant now)` | Same | `REJECTED`; the expense is unchanged |

State machine: [14_Expense_Cancellation_State_Machine](../uml/14_Expense_Cancellation_State_Machine.puml).

### 2.9 `Receipt`, `ReceiptContent`, `ExpenseVersionReceipt`

`Receipt(id, groupId, expenseId, ReceiptContentType contentType, int sizeBytes, String sha256, String originalFilename, long uploadedByUserId, Instant uploadedAt)`. `ReceiptContent(receiptId, byte[] content)` is an infrastructure-mapped record. `ExpenseVersionReceipt(versionId, receiptId, short displayOrder)`.

### 2.10 `Payment` (immutable)

Fields: `id, groupId, debtorUserId, creditorUserId, Money amount, Money displayedAmount, boolean amountAdjusted, PaymentStatus status = COMPLETED, LocalDate paymentDate, String note, UUID idempotencyKey, long recordedByUserId, Instant recordedAt`.

The only factory: `static Payment settle(long groupId, Transfer currentTransfer, long actorId, Money displayedAmount, UUID key, String note, LocalDate today, Instant now)`.

- Preconditions: `actorId == currentTransfer.debtorId` (D39), `currentTransfer.amount > 0`.
- `amount = currentTransfer.amount`, `amountAdjusted = !displayed.equals(amount)`.
- There are **no** mutator methods (D40).

### 2.11 `Notification`

Fields: `id, recipientUserId, groupId, NotificationType type, expenseId, expenseVersionId?, cancellationRequestId?, createdAt, readAt`. Operation: `markRead(long actorId, Instant now)` (actor must equal the recipient; idempotent).

### 2.12 `AuditEvent` (record)

`AuditEvent(Instant occurredAt, Long actorUserId, Long groupId, AuditEventType type, String entityType, long entityId, Map<String, Object> details)`.

## 3. Domain services and policies (`domain.finance`, `domain.policy`)

| Component | Signature (design) | Purpose | Rules |
| --- | --- | --- | --- |
| `SplitAllocator` | `Allocation allocateEqual(Money, SortedSet<Long>)`; `Allocation allocatePercentage(Money, SortedMap<Long, Percentage>)` | Leftover-cent allocation | BR-SPL-* |
| `ApproverSetResolver` | `ApproverSet resolve(long creatorId, long payerId, SortedSet<Long> participantIds)` | (participants ∪ payer) − creator, with basis | BR-APR-01, BR-CAN-04 |
| `BalanceCalculator` | `NetBalances netBalances(long groupId, SortedSet<Long> memberIds, List<LedgerPosting>)` | Net per member; asserts Σ = 0 | BR-BAL-* |
| `SettlementPlanner` | `SettlementPlan plan(NetBalances)` | Greedy deterministic plan | BR-SET-* |
| `ExpenseEditPolicy` | `void check(Expense e, long actorId, int expectedVersionNumber, EditContext ctx, ExpenseDraft newDraft)` | Edit eligibility | BR-VER-01, 06–10 |
| `CancellationPolicy` | `void checkDirectCancel(Expense, long actorId)`; `void checkOpenRequest(Expense, long actorId, EditContext ctx)` | Cancellation eligibility | BR-CAN-01–03, 10 |
| `MembershipDeactivationPolicy` | `DeactivationEligibility evaluate(Group g, GroupMembership target, Money targetNet, ResponsibilitySummary r)` | Leave/remove eligibility with reasons | BR-GRP-05/06 |
| `GroupArchivePolicy` | `ArchiveEligibility evaluate(Group g, NetBalances nets, long pendingExpenseCount, long openCancellationCount)` | Archive eligibility with reasons | BR-ARC-02 |
| `InvitationAcceptancePolicy` | `void check(GroupInvitation inv, UserAccount acceptor, Group g, GroupMembership existing?, Instant now)` | Acceptance checks | BR-INV-04 |

`EditContext` carries `boolean hasOpenCancellation` and `Set<Long> inactiveInvolvedUserIds` (for the effective version). These facts are queried by the application layer.

## 4. Enumerations

`UserStatus`, `GroupStatus`, `MembershipStatus`, `DeactivationReason`, `InvitationStatus`, `RevocationReason {OWNER_REVOKED, GROUP_ARCHIVED}`, `ExpenseStatus`, `ExpenseVersionStatus`, `SplitMethod`, `ApprovalBasis {PAYER, PARTICIPANT, PAYER_AND_PARTICIPANT}`, `ApprovalDecision`, `CancellationRequestStatus`, `PaymentStatus {COMPLETED}`, `NotificationType`, `ReceiptContentType {JPEG, PNG, PDF}`, `PostingType {EXPENSE_PAID, EXPENSE_SHARE, PAYMENT_SENT, PAYMENT_RECEIVED}`, `AuditEventType` (values listed in schema §2.9).

## 5. Domain exceptions (`domain.exception`)

| Exception | Meaning | Web mapping |
| --- | --- | --- |
| `ValidationException(List<FieldError(field, code, args)>)` | Input semantically invalid (FR-025) | Re-render the form (HTTP 200) with field errors |
| `BusinessRuleViolationException(code, args)` | A rule blocks the action (e.g., `MEMBER_HAS_BALANCE`, `REJECTED_IS_FINAL`) | Flash error + redirect, or 409 page |
| `GroupArchivedException` | Mutation on an archived group | 409 page |
| `InvitationNotAcceptableException(reason)` | Reasons `EXPIRED`, `REVOKED`, `ALREADY_USED`, `GROUP_ARCHIVED`, `WRONG_ACCOUNT`, `ALREADY_MEMBER`, `ACCOUNT_NOT_VERIFIED` | Invitation result page (generic for `WRONG_ACCOUNT`) |
| `LedgerInconsistencyException` | Σ ≠ 0 | 500 + alert |
| Application layer: `NotFoundException`, `ForbiddenException`, `ConcurrentModificationException` | Authorization and optimistic locking | 404 / 403 / 409 |
