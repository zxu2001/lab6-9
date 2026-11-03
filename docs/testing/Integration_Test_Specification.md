# Integration Test Specification

Spring Boot Test + Testcontainers `postgres:16` (D33). Flyway runs V1–V11 at context start (test profile). `ddl-auto=validate`. `MockEmailService` is active. The application connects as the restricted `${app_role}`; fixtures use the owner role where needed. Not implemented in this phase.

## IT-DB: Migrations, mappings, constraints, ledger view

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| IT-DB-01 | Empty container | Flyway migrate | 11 successful migrations; `flyway validate` passes | D32, NFR-010 |
| IT-DB-02 | Migrated DB | Start the Spring context with `ddl-auto=validate` | Context starts (all entities match) | D32 |
| IT-DB-03 | n/a | Insert a version with amount 0, −1, 1000000.01, or currency 'EUR' (as owner, bypassing the service) | `CHECK` violations | D09, D18 |
| IT-DB-04 | User `alice@x.com` | Insert `ALICE@x.com` (non-normalized) or a duplicate | `ck_users_email_norm` / `ux_users_email` violation | BR-AUTH-01 |
| IT-DB-05 | A `PENDING` invitation for (g, email) | Insert a second `PENDING` | `ux_invitation_one_pending` violation | D37 |
| IT-DB-06 | An `OPEN` request for an expense | Insert a second `OPEN` | `ux_cancel_one_open` violation | DA-19 |
| IT-DB-07 | Expense with v1 `APPROVED` | Insert v2 `PENDING` without superseding v1 | `ux_version_one_live` violation | D10, LI-3 |
| IT-DB-08 | A payment exists | `UPDATE payments SET amount = …`; `DELETE FROM payments` (as owner) | Trigger `trg_payments_immutable` raises | D40 |
| IT-DB-09 | Expense `APPROVED` | Set `effective_version_id = NULL` while keeping status `APPROVED`; set status `REJECTED → APPROVED` | `ck_expense_effective` / `trg_expense_transitions` raise | BR-BAL-02, D28 |
| IT-DB-10 | Receipt stored (5 MiB PNG) | Load the expense version list; then download | The listing query does not select `receipt_contents` (Hibernate statistics); download bytes equal the upload (SHA-256 match) | D13 |
| IT-DB-11 | Users in group G1 only | Insert an allocation or payment in G2 referencing a non-member | Composite FK violation | D21, LI-6 |
| IT-DB-12 | Generated ledger (50 approved expenses, 20 payments, random) | Compare `SUM(delta)` from `v_ledger_postings` with `BalanceCalculator` | Equal per member; Σ = 0; the allocation-totals trigger never fires | LI-1, LI-2 |
| IT-DB-13 | Migrated DB | Query predefined categories | Exactly 10, active, `group_id IS NULL` | D22 |
| IT-DB-14 | Connect as `${app_role}` | `UPDATE`/`DELETE` on `payments`, `audit_events` | Permission denied | D40, D19 |
| IT-DB-15 | Notification for (Bob, v1) exists | Insert a duplicate | `ux_notification_per_version` violation | D26 |

## IT-TX: Transactions and rollback

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| IT-TX-01 | Spy `ReceiptService.storeForVersion` to throw after the expense insert | `createExpense` | No `expenses`, versions, allocations, approvals, receipts, notifications, or audit rows remain | FR-026, D19 |
| IT-TX-02 | Spy `AuditService.record` to throw on `EXPENSE_APPROVED` | The last approver approves | The decision and status change are rolled back; the expense stays `PENDING_APPROVAL` | D19 |
| IT-TX-03 | Spy the audit to throw on `PAYMENT_RECORDED` | `recordSettlement` | No payment row | D19 |
| IT-TX-04 | `MockEmailService` configured to throw | Register | User and token committed; the outcome page offers resend; error logged without the token | D31, AD-07 |
| IT-TX-05 | Two browser forms based on expense version 1 | Submit both edits sequentially | The second fails with 409 `STALE_VERSION`; DB unchanged by the second | D19 |

## IT-AUTHZ: Authorization end to end (MockMvc + real DB)

| ID | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- |
| IT-AUTHZ-01 | Erin is not a member of G1 | `GET /groups/G1`, `/groups/G1/balances`, `/groups/G1/reports` | 404 for all | FR-024, DA-40 |
| IT-AUTHZ-02 | Expense E in G1; Bob is a member of G2 only | `GET /groups/G2/expenses/E` (URL nesting mismatch) | 404 | D21 |
| IT-AUTHZ-03 | Receipt R in G1 | Erin downloads `/groups/G1/receipts/R`; Bob (G2) downloads via G2 | 404 | DA-10 |
| IT-AUTHZ-04 | Carol `INACTIVE` in G1, involved only in E1 | View E1, E2, balances, reports | E1 visible; E2 → 404; only her own balance shown; report rows limited | DA-31 |
| IT-AUTHZ-05 | G1 `ARCHIVED` | POST create expense, settle, invite, category | 409 read-only; GET pages 200 | D29 |
| IT-AUTHZ-06 | Any POST without a CSRF token | e.g., `POST /groups/G1/settle/1` | 403 | DA-09 |

## IT-MVC: Controllers (`@WebMvcTest` slices; services mocked unless stated)

| ID | Endpoint | Scenario | Expected | Req |
| --- | --- | --- | --- | --- |
| IT-MVC-01 | `POST /register` | Invalid email, short password | 200 with view `auth/register`; field errors on `email` and `password`; email value preserved | FR-025, NFR-004 |
| IT-MVC-02 | `POST /login` | Unverified account (full context) | Redirect `/login?unverified`; message with a resend link | D30 |
| IT-MVC-03 | `POST /groups/1/expenses/new` | Service throws `ValidationException(percentages, SUM_NOT_100)` | Form re-rendered; error bound to `percentages`; other values retained | FR-007, NFR-004 |
| IT-MVC-04 | `POST /groups/1/expenses/5/versions/9/approve` | Service returns outcome `APPROVED` | 302 to the expense page; flash success | D02 |
| IT-MVC-05 | `GET /groups/1/settle/2` | Preparation with an amount | View contains the finality warning text and a hidden token; **no editable amount input** | D40, D23 |
| IT-MVC-06 | `POST /groups/1/settle/2` | Outcome `RECORDED_ADJUSTED` (48.33 vs 33.33) | 302 to balances; flash shows both amounts | D24 |
| IT-MVC-07 | `GET /groups/1/reports?type=EXPENSE&from=2026-12-01&to=2026-11-01` | Invalid range | Filter form error; no service report call | D05 |
| IT-MVC-08 | `GET /groups/1/receipts/7` | Service returns a PDF | Headers `Content-Disposition: attachment`, `application/pdf`, `nosniff`, `no-store` | D13 |

## IT-EMAIL and IT-RPT

| ID | Action | Expected | Req |
| --- | --- | --- | --- |
| IT-EMAIL-01 | Register (full context, mock email) | Exactly one verification email captured **after commit**, with a link containing the raw token that verifies successfully; no other emails for later expense, payment, or notification flows | D31, D04 |
| IT-EMAIL-02 | `SesEmailService` with a mocked `SesV2Client` | The request has the configured from-address, recipient, subject, and a link built from `splitsmart.base-url` (not the request host) | D31 |
| IT-RPT-01 | Generated ledger | The `EFFECTIVE` balance report equals the `/balances` figures; the expense report total equals Σ effective amounts in range | NFR-005 |
