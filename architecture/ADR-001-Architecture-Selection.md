# ADR-001 — SplitSmart Architecture Selection

**Status: Accepted** (2026-11-03). This supersedes the earlier "Proposed — Pending Student Approval" version of this ADR (commit `f1410dc`).

**Repository:** `zxu2001/lab6-9`

**Deciders:** Customer decisions D01, D06, D07, D11, D12 (see the [Customer Decision Register](../docs/requirements/Customer_Decision_Register.md)) and the course architecture selection: **Layered + MVC**.

## Context

The original customer requirements ([`UserRequirement.md`](../UserRequirement.md)) state "OS supported: primary web-based". The first planning iteration (2026-10-27 to 2026-11-03) proposed a Java 21 **Swing desktop MVP** with a layered + MVC/presenter structure. Two independent reviews were produced:

- [Claude_Architecture_Alternatives.md](Claude_Architecture_Alternatives.md) compared Layered MVC, Hexagonal + MVP, and Event-sourced CQRS, and recommended Hexagonal + MVP **for a Swing desktop MVP**.
- [ChatGPT_Architecture_Review.md](ChatGPT_Architecture_Review.md) recommended Layered + MVC/presenter with selected hexagonal practices.

Afterwards the customer made 41 decisions. The decisive ones:

- **D01 / D06**: deliver a web-based application with a cloud-hosted database. This overrides the desktop selection.
- **D07**: Spring Boot, Spring MVC, Thymeleaf, PostgreSQL, Spring Data JPA/Hibernate, Maven, JUnit 5.
- **D11 / D12**: Spring Security with server-side sessions; AWS EC2 + Amazon RDS + HTTPS.

## Decision

Adopt a **Layered Architecture with Model–View–Controller (MVC)** for a **server-rendered Spring Boot web application**:

1. **Presentation layer**: Spring MVC controllers, Thymeleaf views, form objects with Bean Validation, view models, and authentication/session interaction.
2. **Application/service layer**: use-case services, `@Transactional` boundaries, authorization checks, audit and notification creation.
3. **Domain layer**: entities, value objects, lifecycle state machines, and financial rules (allocation, balances, settlement), with no dependency on Spring MVC, Thymeleaf, PostgreSQL, SES, or concrete infrastructure.
4. **Persistence/infrastructure layer**: Spring Data JPA repository adapters, PostgreSQL, the Amazon SES email adapter, Spring Security configuration, token and receipt inspection services.

Dependency inversion is applied **only** where it pays off. Repository interfaces live in the domain and `EmailService` / `TokenService` / `ReceiptContentInspector` in the application layer. Infrastructure implements them. The architecture is **not** Hexagonal, Clean Architecture, or MVP: there are no inbound ports, controllers call application service interfaces directly, and MVC is the presentation pattern.

Details: [Architecture_Overview](../docs/architecture/Architecture_Overview.md), [Layer_Responsibilities](../docs/architecture/Layer_Responsibilities.md), [Dependency_Rules](../docs/architecture/Dependency_Rules.md).

## Alternatives considered (historical analysis preserved)

| Alternative | Outcome | Reason |
| --- | --- | --- |
| Tightly coupled Swing monolith | Rejected (v1) | Poor separation and testability; Swing is no longer the platform (D01). |
| MVC alone | Rejected | Provides presentation roles only, with no persistence, transaction, or domain boundaries. |
| Layered + MVC (Swing) | Superseded | Same structure, wrong platform after D01/D06. |
| Hexagonal + MVP (Swing) | Not selected | Recommended in the Claude analysis for the desktop context. The MVP pattern does not apply to server-rendered Spring MVC. The extra port and adapter layers are not required by the course; layered DIP at the repository and email seams achieves the needed testability. |
| Event-sourced CQRS | Rejected | Complexity, event versioning, and the privacy tension outweigh the benefits. The audit needs are met by immutable versions, decisions, payments, and audit events. |
| **Layered + MVC (Spring Boot web)** | **Accepted** | Matches D01/D06/D07 and the course architecture selection, is well supported by Spring idioms, is testable with JUnit 5 + Mockito + Testcontainers (D33), and has clear UML traceability. |

## Consequences

**Positive**

- One deployable Spring Boot JAR with clear package-level layers, enforced by architecture tests (UT-ARCH-01–03).
- Financial rules (D09, D20, D34) are pure domain code and can be unit-tested without Spring.
- Transactions, locking, and authorization are centralized in application services (D19, D24, D39).

**Negative / accepted trade-offs**

- Domain entities carry `jakarta.persistence` annotations (AD-08). This is a pragmatic coupling to a standard API.
- Application services can grow large. This is mitigated by one service per capability (19 services) and policies in the domain.
- Single-instance in-memory sessions (DA-30) limit horizontal scaling until Spring Session JDBC is adopted.

## Compliance and follow-ups

| Item | Status |
| --- | --- |
| Constitution Principle III ("Swing provides the human interface") conflicts with D01/D06/D07. | **Open.** A MAJOR amendment (v2.0.0) is drafted in [Constitution_Amendment_Proposal](../docs/requirements/Constitution_Amendment_Proposal.md). Ratification by a human is required (Constitution Governance). |
| Constitution II (Java 21, Maven), IV (separation), V (BigDecimal), VI (JUnit 5), VII (PlantUML), VIII (traceability), IX (human review) | Satisfied by this design |
| Superseded artifacts | v1 Swing statements in `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `architecture.puml` were rewritten on 2026-11-03. The historical reviews keep their original content with a superseded banner. |

**This ADR is AI-assisted. It records the customer's and the course's decisions and requires human review (Constitution IX).**
