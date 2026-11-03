# PostgreSQL Schema Design

> **Documentation only.** The DDL below is the design for the Flyway migrations listed in the [Flyway_Migration_Plan](Flyway_Migration_Plan.md). No executable migration files are created in this phase (D32).

| Target | PostgreSQL 16 (Amazon RDS); identical major version in Testcontainers |
| --- | --- |
| Conventions | `snake_case`; `BIGINT GENERATED ALWAYS AS IDENTITY` primary keys; money `NUMERIC(19,2)`; timestamps `TIMESTAMPTZ` stored in UTC (DA-13); business dates `DATE`; enums as `VARCHAR` + `CHECK` (portable and readable; mapped with `@Enumerated(EnumType.STRING)`); optimistic-lock column `version BIGINT` on mutable aggregates (D19) |
| Naming | PK `pk_<table>` (implicit), FK `fk_<table>_<target>`, unique `ux_…`, check `ck_…`, index `ix_…`, trigger `trg_…` |
| Related | [Entity_Relationships](Entity_Relationships.md) · [Data_Integrity_Constraints](Data_Integrity_Constraints.md) · [Financial_Ledger_Design](Financial_Ledger_Design.md) · [11_Database_Entity_Relationships](../uml/11_Database_Entity_Relationships.puml) |

## 1. Table inventory

| # | Table | Kind | Mutable? | `@Version` | Purpose | Decisions |
| --: | --- | --- | --- | :-: | --- | --- |
| 1 | `users` | Authoritative | Yes (status, password, lockout) | ✓ | Accounts | D11, D30 |
| 2 | `email_verification_tokens` | Authoritative | Terminal fields only | — | Verification tokens (hashes) | D30 |
| 3 | `password_reset_tokens` | Authoritative | Terminal fields only | — | Reset tokens (hashes) | D30 |
| 4 | `expense_groups` | Authoritative | Yes (owner, status) | ✓ | Groups. The row is also the **group ledger lock**. | D08, D17, D29, D36 |
| 5 | `group_memberships` | Authoritative | Yes (status) | ✓ | Memberships | D16 |
| 6 | `group_invitations` | Authoritative | Status only | ✓ | Invitations | D08, D37 |
| 7 | `expense_categories` | Authoritative | Name, active | ✓ | Predefined and custom categories | D22 |
| 8 | `expenses` | Authoritative | Status, pointers | ✓ | Expense aggregate root | D10, D14, D28 |
| 9 | `expense_versions` | Authoritative, **immutable content** | Status and timestamps only | — | Version snapshots | D10, D25, D27 |
| 10 | `expense_allocations` | Authoritative, immutable | No | — | Frozen participants and shares | D09, D20, D25 |
| 11 | `expense_approvals` | Authoritative | Decision once | ✓ | Frozen approver set + decisions | D02, D35 |
| 12 | `expense_cancellation_requests` | Authoritative | Status once | ✓ | Cancellation workflow | D14 |
| 13 | `cancellation_approvals` | Authoritative | Decision once | ✓ | Frozen cancellation approvers + decisions | D14 |
| 14 | `receipts` | Authoritative, immutable | No | — | Receipt metadata | D13, D27 |
| 15 | `receipt_contents` | Authoritative, immutable | No | — | Receipt bytes (`BYTEA`) | D13 |
| 16 | `expense_version_receipts` | Authoritative, immutable | No | — | Version ↔ receipt links | D27 |
| 17 | `payments` | Authoritative, **immutable** | No | — | Settlements | D03, D23, D24, D40 |
| 18 | `notifications` | Authoritative | `read_at` only | — | In-app approval requests | D04, D26 |
| 19 | `audit_events` | Authoritative, insert-only | No | — | Audit trail | D19 |
| V | `v_ledger_postings` | **Derived view** | n/a | n/a | Ledger postings for balances | D34, DA-12 |

There are deliberately **no** tables for balances, settlement plans, or report results (DA-12).

## 2. DDL

### 2.1 Accounts and tokens (migration V1)

```sql
CREATE TABLE users (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email               VARCHAR(320) NOT NULL,
    display_name        VARCHAR(100) NOT NULL,
    password_hash       VARCHAR(100) NOT NULL,
    status              VARCHAR(30)  NOT NULL DEFAULT 'PENDING_VERIFICATION',
    email_verified_at   TIMESTAMPTZ,
    failed_login_count  INTEGER      NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL,
    updated_at          TIMESTAMPTZ  NOT NULL,
    version             BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ux_users_email          UNIQUE (email),
    CONSTRAINT ck_users_email_norm     CHECK (email = lower(btrim(email))),
    CONSTRAINT ck_users_display_name   CHECK (length(btrim(display_name)) BETWEEN 1 AND 100),
    CONSTRAINT ck_users_status         CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','DISABLED')),
    CONSTRAINT ck_users_active_verified CHECK (status <> 'ACTIVE' OR email_verified_at IS NOT NULL),
    CONSTRAINT ck_users_failed_nonneg  CHECK (failed_login_count >= 0)
);

CREATE TABLE email_verification_tokens (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES users(id),
    token_hash      CHAR(64)    NOT NULL,           -- hex SHA-256 of the raw token
    created_at      TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,           -- created_at + 24 h (DA-29)
    used_at         TIMESTAMPTZ,
    invalidated_at  TIMESTAMPTZ,
    CONSTRAINT ux_evt_token_hash   UNIQUE (token_hash),
    CONSTRAINT ck_evt_expiry       CHECK (expires_at > created_at),
    CONSTRAINT ck_evt_one_terminal CHECK (used_at IS NULL OR invalidated_at IS NULL)
);
CREATE INDEX ix_evt_user_open ON email_verification_tokens (user_id)
    WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE password_reset_tokens (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT      NOT NULL REFERENCES users(id),
    token_hash      CHAR(64)    NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,           -- created_at + 30 min (DA-29)
    used_at         TIMESTAMPTZ,
    invalidated_at  TIMESTAMPTZ,
    CONSTRAINT ux_prt_token_hash   UNIQUE (token_hash),
    CONSTRAINT ck_prt_expiry       CHECK (expires_at > created_at),
    CONSTRAINT ck_prt_one_terminal CHECK (used_at IS NULL OR invalidated_at IS NULL)
);
CREATE INDEX ix_prt_user_open ON password_reset_tokens (user_id)
    WHERE used_at IS NULL AND invalidated_at IS NULL;
```

### 2.2 Groups, memberships, invitations (V2)

```sql
CREATE TABLE expense_groups (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                 VARCHAR(100) NOT NULL,
    description          VARCHAR(500),
    owner_user_id        BIGINT       NOT NULL REFERENCES users(id),
    status               VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
    created_by_user_id   BIGINT       NOT NULL REFERENCES users(id),
    created_at           TIMESTAMPTZ  NOT NULL,
    archived_at          TIMESTAMPTZ,
    archived_by_user_id  BIGINT REFERENCES users(id),
    version              BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ck_groups_name    CHECK (length(btrim(name)) BETWEEN 1 AND 100),
    CONSTRAINT ck_groups_status  CHECK (status IN ('ACTIVE','ARCHIVED')),
    CONSTRAINT ck_groups_archive CHECK ((status = 'ARCHIVED') =
                                        (archived_at IS NOT NULL AND archived_by_user_id IS NOT NULL))
);

CREATE TABLE group_memberships (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id                 BIGINT      NOT NULL REFERENCES expense_groups(id),
    user_id                  BIGINT      NOT NULL REFERENCES users(id),
    status                   VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    joined_at                TIMESTAMPTZ NOT NULL,
    joined_via_invitation_id BIGINT,                 -- FK added below
    deactivated_at           TIMESTAMPTZ,
    deactivated_by_user_id   BIGINT REFERENCES users(id),
    deactivation_reason      VARCHAR(20),
    version                  BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ux_membership_group_user UNIQUE (group_id, user_id),
    CONSTRAINT ck_membership_status     CHECK (status IN ('ACTIVE','INACTIVE')),
    CONSTRAINT ck_membership_reason     CHECK (deactivation_reason IS NULL
                                               OR deactivation_reason IN ('LEFT','REMOVED')),
    CONSTRAINT ck_membership_inactive   CHECK ((status = 'INACTIVE') =
                                               (deactivated_at IS NOT NULL
                                                AND deactivated_by_user_id IS NOT NULL
                                                AND deactivation_reason IS NOT NULL))
);
CREATE INDEX ix_membership_user ON group_memberships (user_id);

-- The owner must be a member of the group (status is checked by the service + trigger, see integrity doc)
ALTER TABLE expense_groups
    ADD CONSTRAINT fk_groups_owner_membership
    FOREIGN KEY (id, owner_user_id) REFERENCES group_memberships (group_id, user_id)
    DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE group_invitations (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id             BIGINT       NOT NULL REFERENCES expense_groups(id),
    invited_email        VARCHAR(320) NOT NULL,
    token_hash           CHAR(64)     NOT NULL,
    status               VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    invited_by_user_id   BIGINT       NOT NULL REFERENCES users(id),
    created_at           TIMESTAMPTZ  NOT NULL,
    expires_at           TIMESTAMPTZ  NOT NULL,
    accepted_by_user_id  BIGINT REFERENCES users(id),
    accepted_at          TIMESTAMPTZ,
    revoked_by_user_id   BIGINT REFERENCES users(id),
    revoked_at           TIMESTAMPTZ,
    revocation_reason    VARCHAR(20),
    expired_at           TIMESTAMPTZ,
    version              BIGINT       NOT NULL DEFAULT 0,
    CONSTRAINT ux_invitation_token      UNIQUE (token_hash),
    CONSTRAINT ck_invitation_status     CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
    CONSTRAINT ck_invitation_email_norm CHECK (invited_email = lower(btrim(invited_email))),
    CONSTRAINT ck_invitation_ttl        CHECK (expires_at = created_at + INTERVAL '168 hours'),  -- 7 days; hours avoid DST/session-time-zone ambiguity
    CONSTRAINT ck_invitation_accepted   CHECK ((status = 'ACCEPTED') =
                                               (accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL)),
    CONSTRAINT ck_invitation_revoked    CHECK ((status = 'REVOKED') =
                                               (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)),
    CONSTRAINT ck_invitation_rev_reason CHECK (revocation_reason IS NULL
                                               OR revocation_reason IN ('OWNER_REVOKED','GROUP_ARCHIVED')),
    CONSTRAINT ck_invitation_expired    CHECK ((status = 'EXPIRED') = (expired_at IS NOT NULL))
);
CREATE UNIQUE INDEX ux_invitation_one_pending
    ON group_invitations (group_id, invited_email) WHERE status = 'PENDING';
CREATE INDEX ix_invitation_pending_email
    ON group_invitations (invited_email) WHERE status = 'PENDING';

ALTER TABLE group_memberships
    ADD CONSTRAINT fk_membership_invitation
    FOREIGN KEY (joined_via_invitation_id) REFERENCES group_invitations(id);
```

### 2.3 Categories (V3)

```sql
CREATE TABLE expense_categories (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id            BIGINT REFERENCES expense_groups(id),   -- NULL = predefined (global)
    name                VARCHAR(50) NOT NULL,
    active              BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by_user_id  BIGINT REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL,
    updated_at          TIMESTAMPTZ NOT NULL,
    version             BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_category_name    CHECK (length(btrim(name)) BETWEEN 1 AND 50),
    CONSTRAINT ck_category_creator CHECK ((group_id IS NULL) = (created_by_user_id IS NULL))
);
CREATE UNIQUE INDEX ux_category_predefined_name
    ON expense_categories (lower(name)) WHERE group_id IS NULL;
CREATE UNIQUE INDEX ux_category_group_active_name
    ON expense_categories (group_id, lower(name)) WHERE group_id IS NOT NULL AND active;

-- Seed (V3): predefined categories (BR-CAT-01)
INSERT INTO expense_categories (group_id, name, active, created_by_user_id, created_at, updated_at)
SELECT NULL, n, TRUE, NULL, now(), now()
FROM unnest(ARRAY['Food & Dining','Groceries','Housing & Rent','Utilities','Transportation',
                  'Travel','Entertainment','Shopping','Health','Other']) AS n;
```

The rule "a custom name must not collide with a predefined name" is checked by `CategoryService` (UT-CAT-03).

### 2.4 Expenses, versions, allocations (V4)

```sql
CREATE TABLE expenses (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id              BIGINT      NOT NULL REFERENCES expense_groups(id),
    creator_user_id       BIGINT      NOT NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'PENDING_APPROVAL',
    current_version_id    BIGINT,      -- required at commit (deferred trigger), see integrity doc
    effective_version_id  BIGINT,      -- non-null iff APPROVED
    ever_approved         BOOLEAN     NOT NULL DEFAULT FALSE,   -- supports DA-17 / BR-CAN-01
    created_at            TIMESTAMPTZ NOT NULL,
    updated_at            TIMESTAMPTZ NOT NULL,
    rejected_at           TIMESTAMPTZ,
    cancelled_at          TIMESTAMPTZ,
    version               BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ux_expense_id_group       UNIQUE (id, group_id),
    CONSTRAINT fk_expense_creator_member FOREIGN KEY (group_id, creator_user_id)
                                         REFERENCES group_memberships (group_id, user_id),
    CONSTRAINT ck_expense_status         CHECK (status IN ('PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED')),
    CONSTRAINT ck_expense_effective      CHECK ((status = 'APPROVED') = (effective_version_id IS NOT NULL)),
    CONSTRAINT ck_expense_eff_is_current CHECK (effective_version_id IS NULL
                                                OR effective_version_id = current_version_id),
    CONSTRAINT ck_expense_rejected       CHECK ((status = 'REJECTED')  = (rejected_at  IS NOT NULL)),
    CONSTRAINT ck_expense_cancelled      CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
    CONSTRAINT ck_expense_ever_approved  CHECK (status <> 'APPROVED' OR ever_approved)
);
CREATE INDEX ix_expense_group_status ON expenses (group_id, status);

CREATE TABLE expense_versions (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expense_id           BIGINT        NOT NULL,
    group_id             BIGINT        NOT NULL,
    version_number       INTEGER       NOT NULL,
    amount               NUMERIC(19,2) NOT NULL,
    currency             CHAR(3)       NOT NULL DEFAULT 'USD',
    expense_date         DATE          NOT NULL,
    description          VARCHAR(200)  NOT NULL,
    category_id          BIGINT        NOT NULL REFERENCES expense_categories(id),
    payer_user_id        BIGINT        NOT NULL,
    split_method         VARCHAR(20)   NOT NULL,
    status               VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
    auto_approved        BOOLEAN       NOT NULL DEFAULT FALSE,
    created_by_user_id   BIGINT        NOT NULL REFERENCES users(id),
    created_at           TIMESTAMPTZ   NOT NULL,
    approved_at          TIMESTAMPTZ,
    rejected_at          TIMESTAMPTZ,
    superseded_at        TIMESTAMPTZ,
    cancelled_at         TIMESTAMPTZ,
    change_summary       VARCHAR(500),
    CONSTRAINT fk_version_expense        FOREIGN KEY (expense_id, group_id) REFERENCES expenses (id, group_id),
    CONSTRAINT fk_version_payer_member   FOREIGN KEY (group_id, payer_user_id)
                                         REFERENCES group_memberships (group_id, user_id),
    CONSTRAINT ux_version_number         UNIQUE (expense_id, version_number),
    CONSTRAINT ux_version_expense_id     UNIQUE (expense_id, id),
    CONSTRAINT ux_version_id_group       UNIQUE (id, group_id),
    CONSTRAINT ck_version_number         CHECK (version_number >= 1),
    CONSTRAINT ck_version_amount         CHECK (amount > 0 AND amount <= 1000000.00),
    CONSTRAINT ck_version_currency       CHECK (currency = 'USD'),
    CONSTRAINT ck_version_description    CHECK (length(btrim(description)) BETWEEN 1 AND 200),
    CONSTRAINT ck_version_split          CHECK (split_method IN ('EQUAL','PERCENTAGE')),
    CONSTRAINT ck_version_status         CHECK (status IN ('PENDING','APPROVED','REJECTED','SUPERSEDED','CANCELLED')),
    CONSTRAINT ck_version_approved_ts    CHECK (status <> 'APPROVED' OR approved_at IS NOT NULL),
    CONSTRAINT ck_version_auto           CHECK (NOT auto_approved OR approved_at IS NOT NULL),
    CONSTRAINT ck_version_rejected       CHECK ((status = 'REJECTED')   = (rejected_at   IS NOT NULL)),
    CONSTRAINT ck_version_superseded     CHECK ((status = 'SUPERSEDED') = (superseded_at IS NOT NULL)),
    CONSTRAINT ck_version_cancelled      CHECK ((status = 'CANCELLED')  = (cancelled_at  IS NOT NULL))
);
-- At most one live (PENDING or APPROVED) version per expense (BR-VER-05)
CREATE UNIQUE INDEX ux_version_one_live ON expense_versions (expense_id)
    WHERE status IN ('PENDING','APPROVED');
CREATE INDEX ix_version_group_date ON expense_versions (group_id, expense_date);
CREATE INDEX ix_version_category   ON expense_versions (category_id);

ALTER TABLE expenses
    ADD CONSTRAINT fk_expense_current_version
        FOREIGN KEY (id, current_version_id) REFERENCES expense_versions (expense_id, id)
        DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT fk_expense_effective_version
        FOREIGN KEY (id, effective_version_id) REFERENCES expense_versions (expense_id, id)
        DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE expense_allocations (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expense_version_id   BIGINT        NOT NULL,
    group_id             BIGINT        NOT NULL,
    participant_user_id  BIGINT        NOT NULL,
    percentage           NUMERIC(5,2),                 -- required iff split_method = PERCENTAGE
    share_amount         NUMERIC(19,2) NOT NULL,
    CONSTRAINT fk_allocation_version   FOREIGN KEY (expense_version_id, group_id)
                                       REFERENCES expense_versions (id, group_id),
    CONSTRAINT fk_allocation_member    FOREIGN KEY (group_id, participant_user_id)
                                       REFERENCES group_memberships (group_id, user_id),
    CONSTRAINT ux_allocation_participant UNIQUE (expense_version_id, participant_user_id),
    CONSTRAINT ck_allocation_share     CHECK (share_amount >= 0),
    CONSTRAINT ck_allocation_pct       CHECK (percentage IS NULL OR (percentage > 0 AND percentage <= 100))
);
CREATE INDEX ix_allocation_participant ON expense_allocations (participant_user_id);
```

### 2.5 Approvals and cancellation (V5)

```sql
CREATE TABLE expense_approvals (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expense_version_id  BIGINT      NOT NULL,
    group_id            BIGINT      NOT NULL,
    approver_user_id    BIGINT      NOT NULL,
    basis               VARCHAR(30) NOT NULL,        -- why this member must approve
    decision            VARCHAR(10),                  -- NULL = awaiting
    decided_at          TIMESTAMPTZ,
    reason              VARCHAR(500),
    version             BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT fk_approval_version    FOREIGN KEY (expense_version_id, group_id)
                                      REFERENCES expense_versions (id, group_id),
    CONSTRAINT fk_approval_member     FOREIGN KEY (group_id, approver_user_id)
                                      REFERENCES group_memberships (group_id, user_id),
    CONSTRAINT ux_approval_approver   UNIQUE (expense_version_id, approver_user_id),
    CONSTRAINT ck_approval_basis      CHECK (basis IN ('PAYER','PARTICIPANT','PAYER_AND_PARTICIPANT')),
    CONSTRAINT ck_approval_decision   CHECK (decision IS NULL OR decision IN ('APPROVED','REJECTED')),
    CONSTRAINT ck_approval_decided    CHECK ((decision IS NULL) = (decided_at IS NULL)),
    CONSTRAINT ck_approval_reason     CHECK (decision IS DISTINCT FROM 'REJECTED'
                                             OR (reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500))
);
CREATE INDEX ix_approval_awaiting ON expense_approvals (approver_user_id) WHERE decision IS NULL;

CREATE TABLE expense_cancellation_requests (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expense_id            BIGINT      NOT NULL,
    expense_version_id    BIGINT      NOT NULL,        -- the effective version being cancelled
    group_id              BIGINT      NOT NULL,
    requested_by_user_id  BIGINT      NOT NULL REFERENCES users(id),
    reason                VARCHAR(500),
    status                VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    auto_approved         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL,
    resolved_at           TIMESTAMPTZ,
    version               BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT fk_cancel_expense   FOREIGN KEY (expense_id, group_id) REFERENCES expenses (id, group_id),
    CONSTRAINT fk_cancel_version   FOREIGN KEY (expense_id, expense_version_id)
                                   REFERENCES expense_versions (expense_id, id),
    CONSTRAINT ux_cancel_id_group  UNIQUE (id, group_id),
    CONSTRAINT ck_cancel_status    CHECK (status IN ('OPEN','APPROVED','REJECTED')),
    CONSTRAINT ck_cancel_resolved  CHECK ((status = 'OPEN') = (resolved_at IS NULL)),
    CONSTRAINT ck_cancel_auto      CHECK (NOT auto_approved OR status = 'APPROVED')
);
CREATE UNIQUE INDEX ux_cancel_one_open ON expense_cancellation_requests (expense_id) WHERE status = 'OPEN';

CREATE TABLE cancellation_approvals (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cancellation_request_id   BIGINT      NOT NULL,
    group_id                  BIGINT      NOT NULL,
    approver_user_id          BIGINT      NOT NULL,
    decision                  VARCHAR(10),
    decided_at                TIMESTAMPTZ,
    reason                    VARCHAR(500),
    version                   BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT fk_cappr_request   FOREIGN KEY (cancellation_request_id, group_id)
                                  REFERENCES expense_cancellation_requests (id, group_id),
    CONSTRAINT fk_cappr_member    FOREIGN KEY (group_id, approver_user_id)
                                  REFERENCES group_memberships (group_id, user_id),
    CONSTRAINT ux_cappr_approver  UNIQUE (cancellation_request_id, approver_user_id),
    CONSTRAINT ck_cappr_decision  CHECK (decision IS NULL OR decision IN ('APPROVED','REJECTED')),
    CONSTRAINT ck_cappr_decided   CHECK ((decision IS NULL) = (decided_at IS NULL)),
    CONSTRAINT ck_cappr_reason    CHECK (decision IS DISTINCT FROM 'REJECTED'
                                         OR (reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500))
);
CREATE INDEX ix_cappr_awaiting ON cancellation_approvals (approver_user_id) WHERE decision IS NULL;
```

### 2.6 Receipts (V6)

```sql
CREATE TABLE receipts (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id             BIGINT       NOT NULL,
    expense_id           BIGINT       NOT NULL,
    content_type         VARCHAR(50)  NOT NULL,
    size_bytes           INTEGER      NOT NULL,
    sha256               CHAR(64)     NOT NULL,
    original_filename    VARCHAR(255) NOT NULL,      -- sanitized, display only
    uploaded_by_user_id  BIGINT       NOT NULL REFERENCES users(id),
    uploaded_at          TIMESTAMPTZ  NOT NULL,
    CONSTRAINT fk_receipt_expense    FOREIGN KEY (expense_id, group_id) REFERENCES expenses (id, group_id),
    CONSTRAINT ux_receipt_id_expense UNIQUE (id, expense_id),
    CONSTRAINT ck_receipt_type       CHECK (content_type IN ('image/jpeg','image/png','application/pdf')),
    CONSTRAINT ck_receipt_size       CHECK (size_bytes > 0 AND size_bytes <= 10485760)
);

CREATE TABLE receipt_contents (
    receipt_id  BIGINT PRIMARY KEY REFERENCES receipts(id),
    content     BYTEA  NOT NULL,
    CONSTRAINT ck_receipt_content_size CHECK (octet_length(content) BETWEEN 1 AND 10485760)
);

CREATE TABLE expense_version_receipts (
    expense_version_id  BIGINT   NOT NULL,
    expense_id          BIGINT   NOT NULL,
    receipt_id          BIGINT   NOT NULL,
    display_order       SMALLINT NOT NULL,
    CONSTRAINT pk_expense_version_receipts PRIMARY KEY (expense_version_id, receipt_id),
    CONSTRAINT fk_evr_version  FOREIGN KEY (expense_id, expense_version_id) REFERENCES expense_versions (expense_id, id),
    CONSTRAINT fk_evr_receipt  FOREIGN KEY (receipt_id, expense_id)         REFERENCES receipts (id, expense_id),
    CONSTRAINT ux_evr_order    UNIQUE (expense_version_id, display_order),
    CONSTRAINT ck_evr_order    CHECK (display_order BETWEEN 1 AND 10)       -- ≤ 10 per version (DA-24)
);
```

### 2.7 Payments (V7)

```sql
CREATE TABLE payments (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    group_id             BIGINT        NOT NULL REFERENCES expense_groups(id),
    debtor_user_id       BIGINT        NOT NULL,
    creditor_user_id     BIGINT        NOT NULL,
    amount               NUMERIC(19,2) NOT NULL,   -- settled amount = current obligation (D23/D24)
    displayed_amount     NUMERIC(19,2) NOT NULL,   -- amount shown when the form was rendered
    amount_adjusted      BOOLEAN       NOT NULL,
    currency             CHAR(3)       NOT NULL DEFAULT 'USD',
    status               VARCHAR(20)   NOT NULL DEFAULT 'COMPLETED',
    payment_date         DATE          NOT NULL,
    note                 VARCHAR(200),
    idempotency_key      UUID          NOT NULL,
    recorded_by_user_id  BIGINT        NOT NULL,
    recorded_at          TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ux_payment_idempotency    UNIQUE (idempotency_key),
    CONSTRAINT fk_payment_debtor_member  FOREIGN KEY (group_id, debtor_user_id)
                                         REFERENCES group_memberships (group_id, user_id),
    CONSTRAINT fk_payment_creditor_member FOREIGN KEY (group_id, creditor_user_id)
                                         REFERENCES group_memberships (group_id, user_id),
    CONSTRAINT ck_payment_amount         CHECK (amount > 0),
    CONSTRAINT ck_payment_displayed      CHECK (displayed_amount >= 0),
    CONSTRAINT ck_payment_adjusted       CHECK (amount_adjusted = (displayed_amount <> amount)),
    CONSTRAINT ck_payment_parties        CHECK (debtor_user_id <> creditor_user_id),
    CONSTRAINT ck_payment_recorder       CHECK (recorded_by_user_id = debtor_user_id),   -- D39
    CONSTRAINT ck_payment_status         CHECK (status = 'COMPLETED'),                   -- D03
    CONSTRAINT ck_payment_currency       CHECK (currency = 'USD')                        -- D18
);
CREATE INDEX ix_payment_group_date ON payments (group_id, payment_date);
CREATE INDEX ix_payment_debtor     ON payments (debtor_user_id);
CREATE INDEX ix_payment_creditor   ON payments (creditor_user_id);
```

### 2.8 Notifications (V8)

```sql
CREATE TABLE notifications (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recipient_user_id        BIGINT      NOT NULL REFERENCES users(id),
    group_id                 BIGINT      NOT NULL REFERENCES expense_groups(id),
    type                     VARCHAR(40) NOT NULL,
    expense_id               BIGINT      NOT NULL REFERENCES expenses(id),
    expense_version_id       BIGINT REFERENCES expense_versions(id),
    cancellation_request_id  BIGINT REFERENCES expense_cancellation_requests(id),
    created_at               TIMESTAMPTZ NOT NULL,
    read_at                  TIMESTAMPTZ,
    CONSTRAINT ck_notification_type   CHECK (type IN ('EXPENSE_APPROVAL_REQUESTED',
                                                      'EXPENSE_REAPPROVAL_REQUESTED',
                                                      'CANCELLATION_APPROVAL_REQUESTED')),
    CONSTRAINT ck_notification_target CHECK (
        (type IN ('EXPENSE_APPROVAL_REQUESTED','EXPENSE_REAPPROVAL_REQUESTED')
             AND expense_version_id IS NOT NULL AND cancellation_request_id IS NULL)
     OR (type = 'CANCELLATION_APPROVAL_REQUESTED'
             AND cancellation_request_id IS NOT NULL AND expense_version_id IS NULL))
);
CREATE UNIQUE INDEX ux_notification_per_version ON notifications (recipient_user_id, expense_version_id)
    WHERE expense_version_id IS NOT NULL;
CREATE UNIQUE INDEX ux_notification_per_cancel  ON notifications (recipient_user_id, cancellation_request_id)
    WHERE cancellation_request_id IS NOT NULL;
CREATE INDEX ix_notification_inbox ON notifications (recipient_user_id, created_at DESC);
CREATE INDEX ix_notification_unread ON notifications (recipient_user_id) WHERE read_at IS NULL;
```

### 2.9 Audit (V9)

```sql
CREATE TABLE audit_events (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at    TIMESTAMPTZ NOT NULL,
    actor_user_id  BIGINT REFERENCES users(id),          -- NULL = system
    group_id       BIGINT REFERENCES expense_groups(id),
    event_type     VARCHAR(60) NOT NULL,
    entity_type    VARCHAR(40) NOT NULL,
    entity_id      BIGINT      NOT NULL,
    details        JSONB       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_audit_group_time ON audit_events (group_id, occurred_at);
CREATE INDEX ix_audit_entity     ON audit_events (entity_type, entity_id);
CREATE INDEX ix_audit_actor_time ON audit_events (actor_user_id, occurred_at);
```

Event types: `USER_REGISTERED`, `EMAIL_VERIFIED`, `VERIFICATION_RESENT`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `ACCOUNT_LOCKED`, `GROUP_CREATED`, `OWNERSHIP_TRANSFERRED`, `INVITATION_ISSUED`, `INVITATION_REVOKED`, `INVITATION_ACCEPTED`, `INVITATION_EXPIRED`, `INVITATION_WRONG_ACCOUNT`, `MEMBER_LEFT`, `MEMBER_REMOVED`, `MEMBER_REACTIVATED`, `CATEGORY_CREATED`, `CATEGORY_RENAMED`, `CATEGORY_DEACTIVATED`, `EXPENSE_CREATED`, `EXPENSE_VERSION_CREATED`, `EXPENSE_APPROVAL_RECORDED`, `EXPENSE_APPROVED`, `EXPENSE_AUTO_APPROVED`, `EXPENSE_REJECTED`, `EXPENSE_CANCELLED`, `CANCELLATION_REQUESTED`, `CANCELLATION_DECISION_RECORDED`, `CANCELLATION_APPROVED`, `CANCELLATION_AUTO_APPROVED`, `CANCELLATION_REJECTED`, `PAYMENT_RECORDED`, `PAYMENT_NOT_CREATED_ZERO_OBLIGATION`, `GROUP_ARCHIVED`.

### 2.10 Derived ledger view (V10)

```sql
CREATE VIEW v_ledger_postings AS
    SELECT e.group_id, v.payer_user_id AS user_id, v.amount AS delta,
           'EXPENSE_PAID'::varchar(20) AS posting_type,
           e.id AS expense_id, v.id AS expense_version_id, NULL::bigint AS payment_id,
           v.expense_date AS business_date
      FROM expenses e
      JOIN expense_versions v ON v.id = e.effective_version_id
     WHERE e.status = 'APPROVED'
UNION ALL
    SELECT e.group_id, a.participant_user_id, -a.share_amount, 'EXPENSE_SHARE',
           e.id, v.id, NULL, v.expense_date
      FROM expenses e
      JOIN expense_versions v    ON v.id = e.effective_version_id
      JOIN expense_allocations a ON a.expense_version_id = v.id
     WHERE e.status = 'APPROVED'
UNION ALL
    SELECT p.group_id, p.debtor_user_id, p.amount, 'PAYMENT_SENT', NULL, NULL, p.id, p.payment_date
      FROM payments p
UNION ALL
    SELECT p.group_id, p.creditor_user_id, -p.amount, 'PAYMENT_RECEIVED', NULL, NULL, p.id, p.payment_date
      FROM payments p;
```

Net balance query (used by `LedgerQueryRepository.netBalances(groupId)`):

```sql
SELECT m.user_id, COALESCE(SUM(l.delta), 0)::numeric(19,2) AS net
  FROM group_memberships m
  LEFT JOIN v_ledger_postings l ON l.group_id = m.group_id AND l.user_id = m.user_id
 WHERE m.group_id = :groupId
 GROUP BY m.user_id
 ORDER BY m.user_id;
```

Triggers (immutability and transition guards, also V10) are specified in [Data_Integrity_Constraints](Data_Integrity_Constraints.md).

## 3. JPA mapping notes

| Entity | Notes |
| --- | --- |
| All aggregates | `@Version long version`; `@Enumerated(STRING)`; `Instant` ↔ `TIMESTAMPTZ`; `LocalDate` ↔ `DATE`; `BigDecimal` with `@Column(precision = 19, scale = 2)` |
| `Expense` | `currentVersion` / `effectiveVersion` are `@ManyToOne(fetch = LAZY)`; `versions` is `@OneToMany(mappedBy)` read-only |
| `ExpenseVersion` | Content fields have `@Column(updatable = false)`; `allocations`, `approvals`, `receiptLinks` are `@OneToMany(cascade = PERSIST)` |
| `Payment` | `@Immutable` (Hibernate-specific, so it is used on the infrastructure mapping, or replaced by all-`updatable = false` columns in the domain, per AD-08) |
| `ReceiptContent` | Infrastructure-only entity `ReceiptContentEntity` with `byte[]` mapped to `BYTEA` (`@JdbcTypeCode(SqlTypes.VARBINARY)`); loaded only for downloads |
| `AuditEvent` | Infrastructure entity with `JSONB` via `@JdbcTypeCode(SqlTypes.JSON)` |
| Locking | `GroupRepository.lockById(id)` → `@Lock(PESSIMISTIC_WRITE)` + `@QueryHints(jakarta.persistence.lock.timeout = 5000)` |
