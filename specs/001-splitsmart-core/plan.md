# Implementation Plan: SplitSmart Core

**Branch**: `001-splitsmart-core` | **Date**: 2026-11-03 (v2) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification v2 from `/specs/001-splitsmart-core/spec.md` and the [Customer Decision Register](../../docs/requirements/Customer_Decision_Register.md) (D01–D41)

> v2 replaces the v1 desktop/Swing plan. The v1 plan is in Git history (commit `0442be5`). Reasons are in [Requirements_Conflict_Resolution](../../docs/requirements/Requirements_Conflict_Resolution.md).

## Summary

SplitSmart is a **server-rendered web application** for group expense sharing and settlement. The architecture is **Layered + MVC** ([ADR-001](../../architecture/ADR-001-Architecture-Selection.md)): Spring MVC controllers and Thymeleaf views → application services (transactions, authorization) → domain (entities, financial rules) ← infrastructure (Spring Data JPA, PostgreSQL, Amazon SES, Spring Security). It is deployed to AWS EC2 with Amazon RDS for PostgreSQL over HTTPS.

## Technical Context

| Item | Value |
| --- | --- |
| Language/Version | Java 21 |
| Primary Dependencies | Spring Boot (supported release; BOM-pinned), Spring MVC, Thymeleaf, Spring Security, Spring Data JPA/Hibernate, Flyway, AWS SDK v2 (SES), PostgreSQL JDBC |
| Storage | PostgreSQL 16 (Amazon RDS). Receipts as `BYTEA` (D13). Flyway-managed schema (D32). |
| Testing | JUnit 5, Mockito, Spring Boot Test (`@WebMvcTest`, `@DataJpaTest`, `@SpringBootTest`), Testcontainers PostgreSQL (D33) |
| Target Platform | Linux (Amazon Linux 2023) on AWS EC2 behind HTTPS. Modern browsers. |
| Project Type | Web application (single Maven module, server-rendered) |
| Performance Goals | NFR-017 (design target): p95 page < 1 s, reports < 2 s for ≤ 50 members and ≤ 10k versions |
| Constraints | BigDecimal / `NUMERIC(19,2)`, USD only; per-group ledger lock; immutable payments; `ddl-auto=validate`; HTTPS; CSRF |
| Scale/Scope | Course MVP with all of D01–D41 in scope; single application instance (DA-30) |

## Constitution Check

| Principle | Result | Note |
| --- | --- | --- |
| I. Customer requirements are the source of intent | PASS | `UserRequirement.md` preserved. Customer decisions D01–D41 recorded and traced. |
| II. Java 21 and Maven | PASS | |
| III. Swing provides the human interface | **CONFLICT, documented** | Superseded by customer decisions D01/D06/D07. The amendment proposal v2.0.0 ([Constitution_Amendment_Proposal](../../docs/requirements/Constitution_Amendment_Proposal.md)) awaits human ratification. Tracked in Complexity Tracking below. |
| IV. OO separation of GUI and business logic | PASS | Layered + MVC; domain free of web and infrastructure (NFR-006, UT-ARCH-01/02) |
| V. BigDecimal | PASS | NFR-001, BR-SPL-* |
| VI. JUnit 5 | PASS | Plus Mockito and Testcontainers (D33) |
| VII. PlantUML | PASS | 41 single-diagram files in [`docs/uml`](../../docs/uml/) |
| VIII. Traceability | PASS | [Requirements_Traceability_Matrix](../../docs/requirements/Requirements_Traceability_Matrix.md) |
| IX. Human review of AI output | GATE | All v2 artifacts are AI-assisted drafts. |

## Architecture Decision

**Layered + MVC** (Accepted). See [Architecture_Overview](../../docs/architecture/Architecture_Overview.md) for the layers, the canonical package tree, and the cross-cutting decisions AD-01–AD-10.

Key design decisions:

1. **Immutable expense versions** with `current_version_id` and `effective_version_id` pointers. Only the effective version of an `APPROVED` expense contributes to the ledger ([Expense_Versioning_Design](../../docs/design/Expense_Versioning_Design.md)).
2. **Unanimous approval** by the frozen set (participants ∪ payer) − creator. Auto-approve when the set is empty ([Expense_Approval_Design](../../docs/design/Expense_Approval_Design.md)).
3. **Derived ledger**: net balances and settlement plans are computed from authoritative records. Nothing derived is persisted ([Financial_Ledger_Design](../../docs/database/Financial_Ledger_Design.md), [Settlement_Algorithm](../../docs/design/Settlement_Algorithm.md)).
4. **Per-group ledger lock** plus `@Version` optimistic locking plus idempotency keys for financial concurrency ([Transaction_Concurrency_Design](../../docs/design/Transaction_Concurrency_Design.md)).
5. **Service-boundary authorization** with object-level checks and 404 for out-of-scope objects ([Security_Architecture](../../docs/architecture/Security_Architecture.md)).

## Project Structure

### Documentation (this feature)

```text
specs/001-splitsmart-core/
├── spec.md                     (v2)
├── plan.md                     (this file, v2)
├── research.md                 (v2)
├── data-model.md               (v2)
├── quickstart.md               (v2)
├── architecture.puml           (v2 summary; detailed diagrams in docs/uml)
├── contracts/application-services.md (v2)
└── checklists/requirements.md  (v2)

docs/
├── requirements/   decision register, business rules, NFRs, RTM, conflicts, constitution amendment proposal
├── architecture/   overview, layers, dependency rules, security, AWS deployment
├── design/         detailed design (15 documents)
├── database/       schema, Flyway plan, ERD, integrity constraints, ledger
├── testing/        strategy, unit, integration, financial, security, concurrency, acceptance
└── uml/            01–41 *.puml (one diagram per file)
```

### Source Code (planned; **not created in this phase**)

```text
pom.xml
src/main/java/com/splitsmart/{web,application,domain,infrastructure}/...
src/main/resources/
├── templates/            Thymeleaf
├── static/               CSS, JS
├── db/migration/         Flyway V1__…V11__ (planned; see Flyway_Migration_Plan)
└── application*.yml
src/test/java/com/splitsmart/{domain,application,web,infrastructure,architecture}/...
```

**Structure Decision**: a single Maven module with package-level layers (see [Architecture_Overview §4](../../docs/architecture/Architecture_Overview.md#4-package-structure-canonical)).

## Phases (future implementation; not executed now)

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| P0 | Maven skeleton, Flyway V1–V11, entity mappings, `ddl-auto=validate`, Testcontainers base | IT-DB-01/02 green |
| P1 | Accounts: registration, verification, login, reset, `EmailService` (mock + SES) | UT-AUTH-*, IT-MVC-01/02, SEC-01–SEC-10 |
| P2 | Groups, invitations, ownership, categories, membership deactivation | UT-GRP-*, UT-INV-*, UT-CAT-* |
| P3 | Expenses: allocation, versions, receipts, approvals, notifications | UT-SPL-*, UT-APR-*, UT-VER-*, UT-NOT-*, UT-RCP-* |
| P4 | Cancellation workflow | UT-CAN-*, CON-08 |
| P5 | Balances, settlement plan, payments with concurrency controls | UT-BAL-*, UT-SET-*, UT-PAY-*, CON-01–CON-05 |
| P6 | Reports, archiving | UT-RPT-*, UT-GRP-08–12 |
| P7 | Deployment documentation validation, security review | SEC-*, AT-D01–AT-D41 |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Constitution III (Swing) not followed | Customer decisions D01/D06/D07 require a web application | Keeping Swing would violate authoritative customer decisions. The amendment is proposed rather than silently ignored. |
| Pessimistic group lock in addition to `@Version` | D24 requires stale amounts to be recomputed safely, and D29 requires archive checks to be atomic | Optimistic locking alone cannot protect a derived aggregate (net balances) spread across many rows |
