# Entity Relationships

Diagram: [11_Database_Entity_Relationships](../uml/11_Database_Entity_Relationships.puml). Tables and DDL: [PostgreSQL_Schema_Design](PostgreSQL_Schema_Design.md).

## 1. Relationship catalogue

| # | Parent | Child | Cardinality | FK (child columns → parent) | Delete rule | Notes |
| --: | --- | --- | --- | --- | --- | --- |
| 1 | `users` | `email_verification_tokens` | 1 : 0..* | `user_id → users.id` | No action (never deleted) | New token invalidates earlier open ones |
| 2 | `users` | `password_reset_tokens` | 1 : 0..* | `user_id → users.id` | No action | |
| 3 | `users` | `expense_groups` (owner) | 1 : 0..* | `owner_user_id → users.id` | No action | Exactly one owner per group |
| 4 | `expense_groups` | `group_memberships` | 1 : 1..* | `group_id → expense_groups.id` | No action | ≥ 1 (the owner) |
| 5 | `users` | `group_memberships` | 1 : 0..* | `user_id → users.id` | No action | Unique (group, user) |
| 6 | `group_memberships` | `expense_groups` (owner is member) | composite | `(id, owner_user_id) → group_memberships(group_id, user_id)` | Deferred | Ensures the owner is a member |
| 7 | `expense_groups` | `group_invitations` | 1 : 0..* | `group_id` | No action | ≤ 1 `PENDING` per (group, email) |
| 8 | `group_invitations` | `group_memberships` | 0..1 : 0..* | `joined_via_invitation_id` | No action | Provenance |
| 9 | `expense_groups` | `expense_categories` | 0..1 : 0..* | `group_id` (NULL = predefined) | No action | |
| 10 | `expense_groups` | `expenses` | 1 : 0..* | `group_id` | No action | |
| 11 | `group_memberships` | `expenses` (creator) | 1 : 0..* | `(group_id, creator_user_id)` | No action | |
| 12 | `expenses` | `expense_versions` | 1 : 1..* | `(expense_id, group_id) → expenses(id, group_id)` | No action | `version_number` 1..n |
| 13 | `expense_versions` | `expenses` (current) | 1 : 1 | `(id, current_version_id) → expense_versions(expense_id, id)` | Deferred | Latest version |
| 14 | `expense_versions` | `expenses` (effective) | 0..1 : 0..1 | `(id, effective_version_id)` | Deferred | Set iff `APPROVED` |
| 15 | `expense_categories` | `expense_versions` | 1 : 0..* | `category_id` | No action | Historical reference stays valid (D22) |
| 16 | `group_memberships` | `expense_versions` (payer) | 1 : 0..* | `(group_id, payer_user_id)` | No action | |
| 17 | `expense_versions` | `expense_allocations` | 1 : 1..* | `(expense_version_id, group_id)` | No action | Frozen participants (D25) |
| 18 | `group_memberships` | `expense_allocations` | 1 : 0..* | `(group_id, participant_user_id)` | No action | |
| 19 | `expense_versions` | `expense_approvals` | 1 : 0..* | `(expense_version_id, group_id)` | No action | 0 rows = auto-approved (D15) |
| 20 | `expenses` | `expense_cancellation_requests` | 1 : 0..* | `(expense_id, group_id)` | No action | ≤ 1 `OPEN` |
| 21 | `expense_versions` | `expense_cancellation_requests` | 1 : 0..* | `(expense_id, expense_version_id)` | No action | The effective version at request time |
| 22 | `expense_cancellation_requests` | `cancellation_approvals` | 1 : 0..* | `(cancellation_request_id, group_id)` | No action | Frozen snapshot |
| 23 | `expenses` | `receipts` | 1 : 0..* | `(expense_id, group_id)` | No action | A receipt belongs to one expense |
| 24 | `receipts` | `receipt_contents` | 1 : 1 | `receipt_id` (PK = FK) | No action | Bytes split out for performance |
| 25 | `expense_versions` ↔ `receipts` | `expense_version_receipts` | * : * | `(expense_id, expense_version_id)`, `(receipt_id, expense_id)` | No action | Same expense enforced |
| 26 | `expense_groups` | `payments` | 1 : 0..* | `group_id` | No action | |
| 27 | `group_memberships` | `payments` (debtor, creditor) | 1 : 0..* each | `(group_id, debtor_user_id)`, `(group_id, creditor_user_id)` | No action | |
| 28 | `users` | `notifications` | 1 : 0..* | `recipient_user_id` | No action | |
| 29 | `expense_versions` / `expense_cancellation_requests` | `notifications` | 1 : 0..* | `expense_version_id` xor `cancellation_request_id` | No action | |
| 30 | `users`, `expense_groups` | `audit_events` | 0..1 : 0..* | `actor_user_id`, `group_id` | No action | Polymorphic `entity_type`/`entity_id` |

No `ON DELETE CASCADE` is used anywhere, because financial and audit history is never deleted (DA-14).

## 2. Aggregate boundaries (for JPA and locking)

| Aggregate root | Members | Lock |
| --- | --- | --- |
| `Group` | memberships (for the owner invariant), categories (custom) | `@Version` + **pessimistic group ledger lock** for financial operations |
| `GroupInvitation` | none | `@Version` |
| `Expense` | versions, allocations, approvals, receipt links, cancellation requests, cancellation approvals | `@Version` on `Expense`, approvals, and requests; serialized by the group lock for ledger-affecting transitions |
| `Payment` | none (immutable) | Insert under the group lock + `ux_payment_idempotency` |
| `UserAccount` | tokens | `@Version` |
| `Notification` | none | None needed (`read_at` set idempotently) |

## 3. Identity rules

- `users.id` is the **stable participant identifier** used for deterministic tie-breaking (DA-35). It is an identity column and is never reused.
- Historical identity: allocations, approvals, and payments reference `group_memberships(group_id, user_id)`. Membership rows are never deleted, only set `INACTIVE`, so historical references stay valid (D16, D25, FR-027).
