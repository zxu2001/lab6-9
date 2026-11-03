# Flyway Migration Plan

> **Plan only (D32).** No files are created under `src/main/resources/db/migration` in this phase. The SQL content of each migration is the corresponding DDL section in [PostgreSQL_Schema_Design](PostgreSQL_Schema_Design.md) and [Data_Integrity_Constraints](Data_Integrity_Constraints.md).

## 1. Policy

| Rule | Detail |
| --- | --- |
| Tool | Flyway (Spring Boot integration for dev/test; Flyway Maven plugin or CLI for prod releases) |
| Location | `classpath:db/migration` |
| Naming | `V<n>__<snake_case_description>.sql` (versioned only). Repeatable `R__` migrations are reserved for views if they ever need redefinition. |
| Hibernate | `spring.jpa.hibernate.ddl-auto=validate` in every profile. Startup fails on any mismatch. |
| Immutability | An applied migration is never edited. Fixes are new migrations. CI runs `flyway validate` (checksums). |
| Backward compatibility | Each release's migrations must work with the previous application version (expand → migrate → contract over two releases) so the JAR can be rolled back. |
| Placeholders | `${app_role}` (DB application role name) |
| Execution in prod | A separate release step as `splitsmart_owner`, before the app restarts. The app runs with `spring.flyway.enabled=false` in prod. |
| Execution in tests | Testcontainers PostgreSQL 16 + Spring Boot Flyway auto-migration (`spring.flyway.enabled=true` in the `test` profile) |
| Baseline | Fresh database (no `baselineOnMigrate`) |

## 2. Migration sequence

| Version | File name (planned) | Contents | Schema doc section | Depends on |
| --- | --- | --- | --- | --- |
| V1 | `V1__create_users_and_auth_tokens.sql` | `users`, `email_verification_tokens`, `password_reset_tokens` and indexes | §2.1 | none |
| V2 | `V2__create_groups_memberships_invitations.sql` | `expense_groups`, `group_memberships`, `group_invitations`, deferred owner-membership FK, invitation provenance FK | §2.2 | V1 |
| V3 | `V3__create_expense_categories_and_seed.sql` | `expense_categories`, partial unique indexes, **seed of 10 predefined categories** | §2.3 | V2 |
| V4 | `V4__create_expenses_versions_allocations.sql` | `expenses`, `expense_versions`, `expense_allocations`, deferred current/effective FKs, `ux_version_one_live` | §2.4 | V3 |
| V5 | `V5__create_approvals_and_cancellations.sql` | `expense_approvals`, `expense_cancellation_requests`, `cancellation_approvals` | §2.5 | V4 |
| V6 | `V6__create_receipts.sql` | `receipts`, `receipt_contents`, `expense_version_receipts` | §2.6 | V4 |
| V7 | `V7__create_payments.sql` | `payments` | §2.7 | V2 |
| V8 | `V8__create_notifications.sql` | `notifications` | §2.8 | V5 |
| V9 | `V9__create_audit_events.sql` | `audit_events` | §2.9 | V2 |
| V10 | `V10__create_ledger_view_and_integrity_triggers.sql` | `v_ledger_postings`; functions and triggers §2.1–§2.13 of the integrity doc | §2.10; integrity §2 | V1–V9 |
| V11 | `V11__grant_application_role_privileges.sql` | Grants per integrity §3 | integrity §3 | V10 |

## 3. Verification (integration tests)

| Test | Assertion |
| --- | --- |
| IT-DB-01 | Flyway migrates an empty Testcontainers DB to V11 without errors. `flyway_schema_history` shows 11 successful rows. |
| IT-DB-02 | The Spring context starts with `ddl-auto=validate` (every entity matches the schema). |
| IT-DB-03 … IT-DB-12 | Constraint, trigger, and view behavior (see [Integration_Test_Specification](../testing/Integration_Test_Specification.md)) |
| IT-DB-13 | Seeded predefined categories: exactly 10, all active, `group_id IS NULL` |
| IT-DB-14 | The application role cannot `UPDATE`/`DELETE` `payments` (connect as `${app_role}`; expect a permission error) |

## 4. Future migration guidelines

- New nullable columns first, backfill, then `NOT NULL` in a later migration.
- Never drop a column that a currently deployed JAR reads.
- Changing a `CHECK` enum list: add values in release N, start using them in N+1.
- Any change to ledger-relevant tables requires re-running FIN-* and IT-DB-12.
