# Data Integrity Constraints

This document lists the database-level safeguards that back the business rules. The application enforces every rule first (in domain and service code). The database is the **second line of defense** against bugs, concurrency races, and manual tampering. DDL for tables, keys, and checks is in the [PostgreSQL_Schema_Design](PostgreSQL_Schema_Design.md). This document adds the trigger designs (planned migration V10) and the privilege model (V11).

## 1. Constraint catalogue by rule

| Rule | DB mechanism | Name |
| --- | --- | --- |
| Unique normalized email (BR-AUTH-01) | `CHECK` lower/trim + `UNIQUE` | `ck_users_email_norm`, `ux_users_email` |
| Active implies verified (BR-AUTH-02) | `CHECK` | `ck_users_active_verified` |
| Token hash uniqueness, single terminal state (BR-AUTH-04/07) | `UNIQUE`, `CHECK` | `ux_evt_token_hash`, `ck_evt_one_terminal`, `ux_prt_*`, `ck_prt_*` |
| Owner is a member (BR-GRP-02) | Deferred composite FK | `fk_groups_owner_membership` |
| Owner membership is `ACTIVE` (BR-GRP-02) | Constraint trigger (deferred) | `trg_group_owner_active` |
| One membership row per (group, user) (BR-GRP-07/10) | `UNIQUE` | `ux_membership_group_user` |
| Inactive fields consistent (BR-GRP-07) | `CHECK` | `ck_membership_inactive` |
| Archive fields consistent; irreversible; read-only (BR-ARC-03/04) | `CHECK` + trigger | `ck_groups_archive`, `trg_group_archived_readonly` |
| One pending invitation per (group, email) (BR-INV-03) | Partial unique index | `ux_invitation_one_pending` |
| 7-day TTL (BR-INV-02) | `CHECK` | `ck_invitation_ttl` |
| Invitation terminal states are final (BR-INV-05/06/07) | Trigger | `trg_invitation_transitions` |
| Category name uniqueness (BR-CAT-02) | Partial unique indexes | `ux_category_predefined_name`, `ux_category_group_active_name` |
| Predefined categories are read-only (BR-CAT-01) | Trigger | `trg_category_predefined_readonly` |
| Amount range, USD (BR-EXP-03) | `CHECK` | `ck_version_amount`, `ck_version_currency` |
| Payer, participants, creator, approvers are group members (BR-EXP-04/05) | Composite FKs to `group_memberships(group_id, user_id)` | `fk_version_payer_member`, `fk_allocation_member`, `fk_expense_creator_member`, `fk_approval_member`, `fk_cappr_member` |
| Version and expense belong to the same group | Composite FK `(expense_id, group_id)` | `fk_version_expense` |
| Expense status ↔ effective pointer (BR-BAL-02) | `CHECK` | `ck_expense_effective`, `ck_expense_eff_is_current` |
| Effective / current pointers belong to the same expense | Composite deferred FKs | `fk_expense_current_version`, `fk_expense_effective_version` |
| Current version required | Deferred constraint trigger | `trg_expense_current_version_required` |
| At most one live version (BR-VER-05) | Partial unique index | `ux_version_one_live` |
| Version content immutable (BR-VER-02) | Trigger | `trg_expense_version_guard` |
| Expense status transitions (BR-APR/VER/CAN) | Trigger | `trg_expense_transitions` |
| Σ shares = amount; percentage rules (BR-SPL-03/04) | Deferred constraint trigger | `trg_version_allocation_totals` |
| Shares ≥ 0, percentage range (BR-SPL-03/05) | `CHECK` | `ck_allocation_share`, `ck_allocation_pct` |
| Allocations immutable | Trigger + grants | `trg_immutable_row` |
| One decision per approver per version; immutable (BR-APR-04) | `UNIQUE` + trigger | `ux_approval_approver`, `trg_decision_once` |
| Rejection needs a reason (BR-APR-05, DA-27) | `CHECK` | `ck_approval_reason`, `ck_cappr_reason` |
| Approver ≠ creator (BR-APR-03, BR-CAN-04) | Trigger | `trg_approver_not_creator` |
| One `OPEN` cancellation per expense (BR-CAN-03) | Partial unique index | `ux_cancel_one_open` |
| Cancellation request status final once resolved | Trigger | `trg_cancel_request_transitions` |
| Receipt type/size (BR-RCP-01/02) | `CHECK` | `ck_receipt_type`, `ck_receipt_size`, `ck_receipt_content_size` |
| ≤ 10 receipts per version (BR-RCP-02) | `CHECK` on `display_order` 1–10 + `UNIQUE` order | `ck_evr_order`, `ux_evr_order` |
| Receipt linked only to versions of its own expense | Composite FKs | `fk_evr_version`, `fk_evr_receipt` |
| Payment parties, positive, recorder = debtor, COMPLETED, USD (BR-PAY-*) | `CHECK` | `ck_payment_*` |
| Payment parties are group members (BR-PAY-10) | Composite FKs | `fk_payment_debtor_member`, `fk_payment_creditor_member` |
| No duplicate settlement submission (BR-PAY-08) | `UNIQUE` | `ux_payment_idempotency` |
| Payments immutable (BR-PAY-06, D40) | Trigger + no UPDATE/DELETE grant | `trg_immutable_row` |
| One notification per approver per version/request (BR-NOT-02) | Partial unique indexes | `ux_notification_per_version`, `ux_notification_per_cancel` |
| Notification target consistency | `CHECK` | `ck_notification_target` |
| Audit insert-only (BR-AUD-01) | Trigger + grants | `trg_immutable_row` |
| No physical delete of financial history (DA-14) | No `DELETE` grant + `trg_no_delete` on mutable financial tables | `trg_no_delete` |

## 2. Trigger designs (planned V10; pseudocode-level PL/pgSQL)

### 2.1 Generic immutability: `trg_immutable_row`

Applied `BEFORE UPDATE OR DELETE` on `payments`, `audit_events`, `expense_allocations`, `receipts`, `receipt_contents`, `expense_version_receipts`.

```sql
CREATE FUNCTION fn_reject_modification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table % is immutable (operation %)', TG_TABLE_NAME, TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
END $$;

CREATE TRIGGER trg_payments_immutable BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_reject_modification();
-- same pattern for the other five tables
```

### 2.2 `trg_no_delete`

`BEFORE DELETE` on `users`, `expense_groups`, `group_memberships`, `group_invitations`, `expense_categories`, `expenses`, `expense_versions`, `expense_approvals`, `expense_cancellation_requests`, `cancellation_approvals`, `notifications`. Same function as above. (Tests use fresh Testcontainers databases rather than deletes.)

### 2.3 `trg_expense_version_guard` (`BEFORE UPDATE ON expense_versions`)

- Reject if any of these changed: `expense_id`, `group_id`, `version_number`, `amount`, `currency`, `expense_date`, `description`, `category_id`, `payer_user_id`, `split_method`, `created_by_user_id`, `created_at`, `auto_approved` (except false→true together with PENDING→APPROVED), `change_summary`.
- Allowed `status` transitions: `PENDING → APPROVED | REJECTED | SUPERSEDED | CANCELLED`; `APPROVED → SUPERSEDED | CANCELLED`. Everything else raises (terminal: `REJECTED`, `SUPERSEDED`, `CANCELLED`).
- Timestamps may only go from NULL to a value.

### 2.4 `trg_expense_transitions` (`BEFORE UPDATE ON expenses`)

| From | Allowed to | Condition |
| --- | --- | --- |
| `PENDING_APPROVAL` | `APPROVED` | `NEW.effective_version_id = NEW.current_version_id`, `NEW.ever_approved` |
| `PENDING_APPROVAL` | `REJECTED` | none |
| `PENDING_APPROVAL` | `CANCELLED` | `OLD.ever_approved = false` (DA-17) |
| `PENDING_APPROVAL` | `PENDING_APPROVAL` | `current_version_id` changes (edit of a pending expense) |
| `APPROVED` | `PENDING_APPROVAL` | `current_version_id` changes, `effective_version_id` becomes NULL (edit, BR-VER-04) |
| `APPROVED` | `CANCELLED` | via an approved cancellation request |
| `REJECTED`, `CANCELLED` | none | terminal (D28) |

Also: `group_id`, `creator_user_id`, and `created_at` are immutable, and `ever_approved` can never go from true to false.

### 2.5 `trg_version_allocation_totals` (`CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED AFTER INSERT ON expense_versions`)

At commit, for the new version:

- `SUM(share_amount) = amount` (BR-SPL-04).
- `COUNT(*) >= 1` participant.
- If `split_method = 'PERCENTAGE'`: every `percentage IS NOT NULL` and `SUM(percentage) = 100.00`. If `EQUAL`: every `percentage IS NULL`, and the shares differ by at most 0.01 (max − min ≤ 0.01).
- `COUNT(expense_version_receipts) <= 10`.

### 2.6 `trg_expense_current_version_required` (deferred constraint trigger on `expenses`, INSERT/UPDATE)

At commit, `current_version_id IS NOT NULL`.

### 2.7 `trg_decision_once` (`BEFORE UPDATE ON expense_approvals`, `cancellation_approvals`)

Raise if `OLD.decision IS NOT NULL`. Raise if any column other than `decision`, `decided_at`, `reason`, or `version` changes.

### 2.8 `trg_approver_not_creator` (`BEFORE INSERT ON expense_approvals`, `cancellation_approvals`)

Raise if `approver_user_id` equals the creator of the related expense (looked up through version → expense, or request → expense).

### 2.9 `trg_cancel_request_transitions`

`OPEN → APPROVED | REJECTED` only. The `expense_version_id` of the request must equal the expense's `effective_version_id` at insert time.

### 2.10 `trg_group_archived_readonly` (`BEFORE UPDATE ON expense_groups`)

Raise if `OLD.status = 'ARCHIVED'` (no change at all after archiving: D36). Also `BEFORE INSERT` on `expenses`, `payments`, `group_invitations`, and `expense_categories` (custom), and `BEFORE UPDATE` on `group_memberships`: raise if the referenced group is `ARCHIVED`. (The service checks this first under the group lock; the trigger is defense in depth.)

### 2.11 `trg_group_owner_active` (deferred constraint trigger on `expense_groups` and `group_memberships`)

At commit, the owner's membership row has `status = 'ACTIVE'`.

### 2.12 `trg_invitation_transitions`

`PENDING → ACCEPTED | EXPIRED | REVOKED` only. `ACCEPTED` requires `accepted_at < expires_at`.

### 2.13 `trg_category_predefined_readonly`

Raise on UPDATE of rows with `group_id IS NULL` (in the application role; seed data changes go through migrations).

## 3. Privilege model (planned V11)

```sql
-- executed by splitsmart_owner; ${app_role} is a Flyway placeholder (e.g., splitsmart_app)
GRANT USAGE ON SCHEMA public TO ${app_role};
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${app_role};
GRANT INSERT ON ALL TABLES IN SCHEMA public TO ${app_role};
GRANT UPDATE ON users, email_verification_tokens, password_reset_tokens, expense_groups,
               group_memberships, group_invitations, expense_categories, expenses,
               expense_versions, expense_approvals, expense_cancellation_requests,
               cancellation_approvals, notifications TO ${app_role};
-- intentionally NO UPDATE on payments, audit_events, expense_allocations, receipts,
-- receipt_contents, expense_version_receipts; NO DELETE on any table
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${app_role};
```

## 4. Application-only rules (not expressible declaratively)

| Rule | Why not in the DB | Enforced / tested by |
| --- | --- | --- |
| Participants and payer are `ACTIVE` at submission (BR-EXP-04/05) | Status at a point in time | `ExpenseService` under group lock; UT-VER-*, IT-AUTHZ-* |
| Deactivation eligibility (BR-GRP-05/06) | Needs derived balances | `MembershipDeactivationPolicy`; UT-GRP-01–04 |
| Archive eligibility (BR-ARC-02) | Needs derived balances | `GroupArchivePolicy`; UT-GRP-08–10, CON-04/05 |
| Payment amount = current obligation (BR-PAY-02) | Derived from the plan | `PaymentService`; UT-PAY-*, CON-01–03 |
| Category active and visible at submission | Status at a point in time | `ExpenseService`; UT-CAT-04 |
| Expense date ≤ today (DA-33) | Zone-dependent | `ExpenseVersion` factory; UT-MON-06 |
