# Research: SplitSmart Architecture and Technology (v2, 2026-11-03)

> v1 (desktop) research decisions are superseded where noted. Customer decisions referenced as Dxx are authoritative ([register](../../docs/requirements/Customer_Decision_Register.md)).

## R1. Decision: Layered + MVC server-rendered web application

**Rationale**: D01/D06 require web delivery with a cloud database. D07 fixes Spring Boot, Spring MVC, and Thymeleaf. Server-rendered MVC suits form-heavy workflows (expenses, approvals, settlements), keeps security simple (session + CSRF), and avoids an SPA/API layer. Layering keeps the financial rules testable without Spring (Constitution IV, NFR-006).

**Alternatives considered**: Hexagonal + MVP (historical recommendation for Swing; not selected, see ADR-001); REST API + SPA (not required, larger attack surface, extra build chain); event-sourced CQRS (rejected).

**Supersedes**: v1 "Layered desktop architecture with MVC presentation".

## R2. Decision: PostgreSQL on Amazon RDS with Flyway and `ddl-auto=validate`

**Rationale**: D06, D12, D32. `NUMERIC(19,2)` for exact money (D09). Partial unique indexes and `CHECK` constraints enforce lifecycle invariants (one live version, one open cancellation request, one pending invitation). `SELECT … FOR UPDATE` supports the group ledger lock.

**Alternatives**: H2 for tests (rejected: dialect differences hide constraint and locking bugs; Testcontainers is required by D33); Hibernate `update` (forbidden by D32).

**Supersedes**: v1 "Desktop-local persistence behind repositories" (the repository abstraction is kept).

## R3. Decision: BigDecimal (scale 2) with integer-cent allocation

**Rationale**: D09. `Money` wraps a `BigDecimal` with scale 2 and refuses scale > 2 input. Allocation converts to `long` cents (`unscaledValue().longValueExact()`) for floor/mod arithmetic, then converts back. Leftover cents go to participants by ascending `users.id` (equal split) or largest fractional remainder then ascending `users.id` (percentage split).

**Alternatives**: half-up rounding + remainder to payer (v1; superseded by D09, and impossible when the payer is excluded from the split per D20); banker's rounding (non-intuitive; still needs a remainder rule).

## R4. Decision: Unanimous approval by the frozen approver set

**Rationale**: D02, D35. Required approvers = (participants ∪ payer) − creator, stored as rows in `expense_approvals` per version (frozen snapshot). An empty set means automatic approval (D15). No deadlines (D41).

**Supersedes**: v1 "Pending expense decisions remain policy-sensitive" (resolved by D02/D35).

## R5. Decision: Immutable expense versions

**Rationale**: D10, D25, D27. Every edit inserts a new `expense_versions` row with its own allocations, receipt links, and approver set. `expenses.effective_version_id` is the only ledger link, which guarantees that at most one version contributes.

**Alternatives**: in-place update with an audit log (loses frozen snapshots; violates D10); temporal tables (not needed).

## R6. Decision: Derived per-group ledger and greedy settlement plan

**Rationale**: D21, D34, DA-12. Net balances come from a ledger-postings query (effective expense credits and debits, plus payments). The deterministic greedy matching of sorted creditors and debtors gives ≤ k−1 transfers in O(k log k). Finding the minimum number of transfers is NP-hard (it reduces from subset-sum style partitioning), so no global minimum is claimed.

## R7. Decision: Concurrency: group ledger lock + `@Version` + idempotency key

**Rationale**: D19, D24. A payment amount depends on all of the group's records, so row-level optimistic locking on one entity cannot detect a stale obligation. A `PESSIMISTIC_WRITE` lock on the `expense_groups` row serializes ledger-affecting operations per group (low contention at course scale). `@Version` protects individual aggregates against stale forms. A unique `payments.idempotency_key` blocks double submission.

**Alternatives**: SERIALIZABLE isolation with retry (works, but produces serialization failures across unrelated reads; harder to reason about); advisory locks (equivalent, less visible to JPA).

## R8. Decision: Spring Security form login, BCrypt, server-side sessions

**Rationale**: D11. Built-in CSRF, session-fixation protection, and `DelegatingPasswordEncoder` for future upgrades. Verification and reset use 256-bit opaque tokens with SHA-256 hashes stored (D30, DA-07/08).

## R9. Decision: Amazon SES behind `EmailService`, sent after commit

**Rationale**: D31. `SesEmailService` uses AWS SDK v2 `SesV2Client` with instance-role credentials. `MockEmailService` captures messages for tests. Sending in `AFTER_COMMIT` listeners keeps SES failures from rolling back account state, and resend is available.

## R10. Decision: Receipts in PostgreSQL `BYTEA`

**Rationale**: D13 (no S3). Content lives in a separate `receipt_contents` table so metadata queries never load the bytes. Magic-byte validation (JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, PDF `25 50 44 46 2D`) plus an image decode check.

## R11. Decision: Testing stack

**Rationale**: D33. JUnit 5 + Mockito for domain and services; `@WebMvcTest` for controllers; `@DataJpaTest` and `@SpringBootTest` with Testcontainers PostgreSQL 16 (matching RDS) for mappings, constraints, Flyway, transactions, and concurrency. No browser E2E.

## R12. Decision: Deployment on EC2 + RDS + ALB/ACM

**Rationale**: D12. A single instance (DA-30), private subnets, Secrets Manager, and IAM-role-scoped SES. See [AWS_Deployment_Design](../../docs/architecture/AWS_Deployment_Design.md).
