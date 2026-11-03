# Data Model: SplitSmart Core (v2, 2026-11-03)

> v2 replaces the v1 desktop data model (Git history `0442be5`). This Spec Kit summary is consistent with the detailed design documents, which are authoritative for details:
> [Domain_Model](../../docs/design/Domain_Model.md) · [PostgreSQL_Schema_Design](../../docs/database/PostgreSQL_Schema_Design.md) · [Entity_Relationships](../../docs/database/Entity_Relationships.md) · [Data_Integrity_Constraints](../../docs/database/Data_Integrity_Constraints.md) · [Financial_Ledger_Design](../../docs/database/Financial_Ledger_Design.md) · diagrams [09](../../docs/uml/09_Domain_Class_Diagram.puml), [11](../../docs/uml/11_Database_Entity_Relationships.puml)

## Entities (authoritative, persisted)

| Entity | Table | Key fields | Lifecycle | Rules |
| --- | --- | --- | --- | --- |
| UserAccount | `users` | id (stable participant ID), email (normalized, unique), displayName, passwordHash (BCrypt), status, emailVerifiedAt, failedLoginCount, lockedUntil, version | `PENDING_VERIFICATION → ACTIVE` (→ `DISABLED`) | BR-AUTH-* |
| EmailVerificationToken | `email_verification_tokens` | userId, tokenHash, expiresAt (24 h), usedAt, invalidatedAt | open → used / invalidated / expired | BR-AUTH-04/05 |
| PasswordResetToken | `password_reset_tokens` | userId, tokenHash, expiresAt (30 min), usedAt, invalidatedAt | same | BR-AUTH-06/07 |
| Group | `expense_groups` | id, name, description, ownerUserId, status, archivedAt, version | `ACTIVE → ARCHIVED` (irreversible) | BR-GRP-*, BR-ARC-* |
| GroupMembership | `group_memberships` | groupId, userId, status, joinedAt, deactivatedAt/By/Reason, version | `ACTIVE ⇄ INACTIVE` (reactivation by invitation only) | BR-GRP-05–10 |
| GroupInvitation | `group_invitations` | groupId, invitedEmail, tokenHash, status, expiresAt (= created + 7 d), acceptedBy/At, revokedBy/At/Reason, version | `PENDING → ACCEPTED / EXPIRED / REVOKED` | BR-INV-* |
| ExpenseCategory | `expense_categories` | groupId (NULL = predefined), name, active, version | active → inactive | BR-CAT-* |
| Expense (root) | `expenses` | groupId, creatorUserId, status, currentVersionId, effectiveVersionId, everApproved, version | `PENDING_APPROVAL ⇄ APPROVED`, → `REJECTED` / `CANCELLED` | BR-APR, BR-VER, BR-CAN |
| ExpenseVersion | `expense_versions` | expenseId, versionNumber, amount NUMERIC(19,2) USD, expenseDate, description, categoryId, payerUserId, splitMethod, status, autoApproved | `PENDING → APPROVED / REJECTED / SUPERSEDED / CANCELLED`; `APPROVED → SUPERSEDED / CANCELLED`. Content is immutable. | BR-VER-02 |
| ExpenseAllocation | `expense_allocations` | versionId, participantUserId, percentage (PERCENTAGE only), shareAmount | Immutable (frozen participants) | BR-SPL-* |
| ExpenseApproval | `expense_approvals` | versionId, approverUserId, basis, decision, decidedAt, reason, version | awaiting → `APPROVED` / `REJECTED` (once) | BR-APR-* |
| ExpenseCancellationRequest | `expense_cancellation_requests` | expenseId, expenseVersionId (effective), requestedBy, reason, status, autoApproved, version | `OPEN → APPROVED / REJECTED` | BR-CAN-* |
| CancellationApproval | `cancellation_approvals` | requestId, approverUserId, decision, decidedAt, reason, version | awaiting → decided (once) | BR-CAN-04–07 |
| Receipt + ReceiptContent | `receipts`, `receipt_contents` | expenseId, contentType, sizeBytes, sha256, originalFilename; content `BYTEA` | Immutable | BR-RCP-* |
| ExpenseVersionReceipt | `expense_version_receipts` | versionId, receiptId, displayOrder (1–10) | Immutable | BR-RCP-04 |
| Payment | `payments` | groupId, debtorUserId, creditorUserId, amount, displayedAmount, amountAdjusted, status = `COMPLETED`, paymentDate, note, idempotencyKey, recordedBy = debtor | Immutable and final | BR-PAY-* |
| Notification | `notifications` | recipientUserId, groupId, type, expenseId, expenseVersionId xor cancellationRequestId, readAt | unread → read | BR-NOT-* |
| AuditEvent | `audit_events` | occurredAt, actorUserId, groupId, eventType, entityType, entityId, details (JSONB) | Insert-only | BR-AUD-* |

## Derived (computed, never stored)

| Concept | Definition |
| --- | --- |
| LedgerPosting | From `v_ledger_postings`: payer +amount and participants −share for each effective version; debtor +x and creditor −x for each payment |
| NetBalance | Σ postings per (group, member). Σ over the group = 0.00. |
| SettlementPlan | Deterministic greedy transfers over net balances ([Settlement_Algorithm](../../docs/design/Settlement_Algorithm.md)) |
| CurrentObligation(debtor, creditor) | The amount of that transfer in the current plan, or 0.00 |
| Report | Filtered projections of authoritative records ([Reporting_Design](../../docs/design/Reporting_Design.md)) |

## Changes from v1

| v1 | v2 | Decision |
| --- | --- | --- |
| Expense with a single review state and a single receipt | Expense root + immutable versions + multiple receipts | D10, D27 |
| Approval decision with a "review step" | Frozen approver set per version, unanimous | D02, D35 |
| Pairwise balance | Per-group net balance + settlement plan | D21, D34 |
| Payment with a confirmation state | Immutable `COMPLETED` settlement | D03, D40 |
| Notification on any expense creation | Approval-request notifications only | D26 |
| Rounding half-up + payer remainder | Deterministic leftover cents by participant ID | D09 |
| (none) | Invitations, tokens, categories, cancellation requests, audit events | D08, D14, D22, D30, D37 |
