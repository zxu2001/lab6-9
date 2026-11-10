# SplitSmart — Independent ChatGPT Architecture Review

> **HISTORICAL DOCUMENT (superseded 2026-11-03).** This analysis predates customer decisions D01–D41. The selected architecture is **Layered + MVC for a Spring Boot web application** ([ADR-001](ADR-001-Architecture-Selection.md), Accepted). Swing/desktop and Hexagonal/MVP content below is kept unchanged as historical design alternatives. See [Requirements_Conflict_Resolution](../docs/requirements/Requirements_Conflict_Resolution.md) C-01, C-03.

**Repository:** `zxu2001/lab6-9`  
**Reviewed branch:** `master`  
**Reviewed commit:** `0442be5a1c26b050b62b8109376eb5d789888881`  
**Status:** AI-generated independent review; human verification required.

## 1. Repository and document verification

Successfully retrieved and examined:
- `UserRequirement.md`
- `.specify/memory/constitution.md`
- `specs/001-splitsmart-core/spec.md` including clarifications
- `specs/001-splitsmart-core/plan.md`
- `specs/001-splitsmart-core/research.md`
- `specs/001-splitsmart-core/data-model.md`
- `specs/001-splitsmart-core/architecture.puml`
- `specs/001-splitsmart-core/contracts/application-services.md`
- `architecture/Claude_Architecture_Alternatives.md`

The tree also lists `checklists/requirements.md` and `quickstart.md`, which were not substantively assessed. No Java implementation, JUnit tests, or separate use-case/class/activity/sequence diagrams appeared in the reviewed tree.

## 2. Executive summary

**Architecture selection can proceed after targeted clarifications; detailed design cannot yet be fully verified.** Spec Kit recommends layered architecture with MVC/presenter boundaries. Claude independently compares classic layered MVC, hexagonal/ports-and-adapters with Swing MVP, and event-sourced CQRS, recommending hexagonal. Both emphasize GUI/business separation, `BigDecimal`, repository abstractions, testability, and traceability. Their primary disagreement is how much abstraction the course MVP warrants.

**Critical issue:** The customer requests primary web-based delivery (`UserRequirement.md`, FR-022), whereas the course implementation is a Java Swing desktop MVP. Preserve this as an explicit scope decision, not a change to customer requirements.

## 3. Requirements-to-architecture traceability

These are *design-level mappings*, not evidence of completed features.

| IDs | Intended components | Finding |
|---|---|---|
| FR-001–003, FR-024; NFR-002–003 | Account, group, membership, session and authorization services | Need concrete security/shared-user model. |
| FR-004–009; NFR-001 | Expense domain/service, split allocator, receipt adapter | Need payer and rounding edge-case tests. |
| FR-010 | Notification workflow | Deferred in spec; plan scope mentions notifications. |
| FR-011–013, FR-028 | Approval policy and state transitions | Reviewer role and multistep policy unresolved. |
| FR-014–017, FR-023 | Balance calculator, payment service, audit history | Payment confirmation and overpayment policies unresolved. |
| FR-018–021; NFR-005 | Report queries and services | Basic summaries in MVP; filtered reports deferred. |
| FR-022 | Future web delivery | Not satisfied by desktop Swing implementation. |
| FR-025–026 | Validation and transaction boundary | Atomicity/rollback need explicit design. |
| NFR-006–008 | GUI separation, JUnit, human review | Design intent aligned; no code/tests yet. |

## 4. Architecture alternatives

**Tightly coupled Swing monolith:** Few classes and quick initial GUI, but weak testability and likely violation of the constitution if financial rules live in UI event handlers.

**Layered + MVC/presenter (Spec Kit):** Swing views/controllers → application services → domain; infrastructure implements repository contracts. Strong balance of clarity, testability and moderate effort. Risk of oversized services/controllers if boundaries are not enforced.

**MVC alone:** Useful GUI pattern, but insufficient as the complete architecture because it does not define persistence, authorization, or domain boundaries.

**Hexagonal + Swing MVP (Claude):** Core-owned ports, pure domain, test adapters, and swappable persistence/presentation. Excellent isolation and potential future web adapter, but additional interfaces, DTOs, presenters and wiring may overcomplicate a course MVP.

**Event-sourced CQRS (Claude):** Strong audit/replay capability but event versioning, projection correctness, privacy and implementation complexity are disproportionate to the MVP.

## 5. Weighted architecture comparison

**Illustrative engineering judgments, not empirical measurements.** Scale 1–5; higher simplicity and implementation-effort scores mean simpler/less effort. Total = sum(weight × score / 5).

| Criterion | Weight | Coupled | Layered+MVC | MVC alone | Hexagonal | Event CQRS |
|---|---:|---:|---:|---:|---:|---:|
| Requirements coverage | 25% | 2 | 4 | 3 | 4 | 4 |
| Maintainability | 20% | 2 | 4 | 3 | 5 | 3 |
| Testability | 20% | 2 | 4 | 3 | 5 | 4 |
| Extensibility | 15% | 2 | 4 | 3 | 5 | 4 |
| Simplicity | 10% | 5 | 4 | 4 | 3 | 1 |
| Implementation effort | 10% | 5 | 4 | 4 | 2 | 1 |
| **Total /100** | **100%** | **52** | **80** | **64** | **85** | **64** |

Hexagonal scores highest on these criteria, but this rubric omits explicit teaching burden and schedule risk. Students should defend their own weights and scores. A five-point advantage is not conclusive.

## 6. Spec Kit vs. Claude Code cross-validation

| Area | Spec Kit | Claude | Independent assessment |
|---|---|---|---|
| Architecture | Layered + MVC | Hexagonal + MVP | Compatible principles, different abstraction depth. |
| Domain/testability | Domain/services and repository interfaces | Pure domain, use cases, in-memory fakes | Both can support tests independent of Swing. |
| Monetary rules | BigDecimal, HALF_UP, payer remainder | Money, allocator, rounding policy | Agree, but actual boundary tests needed. |
| Approval | Policy-sensitive, TBD | ApprovalPolicy strategy | Good extension seam; do not invent reviewer roles. |
| Notifications | Delivery TBD | Domain events and in-app inbox | Inbox may not satisfy cross-user real-time needs. |
| Future web | Deferred | Future inbound adapter | Reuse is possible, not automatic. |
| Effort | Single Maven module | Estimated 60–80 classes and 1.3× effort | Claude estimates are not measured facts. |

**Correction:** Claude's claim that only hexagonal architecture structurally enforces GUI/domain separation is overstated. Spec Kit's plan already specifies inward dependencies and repository interfaces owned by domain/application boundaries; layered architecture can enforce these via architecture tests.

## 7. Detailed design and UML verification

`specs/001-splitsmart-core/architecture.puml` is a high-level **component diagram**. It does not replace detailed use-case, class, activity and sequence diagrams, which were not found in the reviewed tree.

The component diagram depicts `Services --> Repositories`, where `Repositories` represents infrastructure adapters. If interpreted as a source-code dependency, this conflicts with `plan.md`'s rule that repository interfaces belong to domain/application boundaries. Add explicit repository ports and infrastructure implementations, and distinguish compile-time from runtime dependencies. Clarify ownership of financial rules and domain entities.

Expense splitting design options:
1. Logic inside `Expense`: simple but risks overloading the entity.
2. Dedicated `SplitCalculator` or `ExpenseService`: straightforward and independently testable; good course default.
3. `SplitStrategy` with equal/percentage implementations: appropriate when algorithm variation is an explicit learning objective or more split types are expected; otherwise possible overengineering.

## 8. Findings and risk priorities

| ID | Severity | Evidence | Recommendation |
|---|---|---|---|
| R-01 | Critical | Customer requirements, FR-022, plan | Explicitly approve desktop as *course MVP*, preserve web target. |
| R-02 | Major | Spec open questions, research | Define reviewer authorization, multistep approval, payment confirmation. |
| R-03 | Major | Spec MVP list vs plan scope | Reconcile notifications and filtered reports scope. |
| R-04 | Major | Architecture diagram vs plan | Diagram repository ports and inward source dependencies. |
| R-05 | Major | NFR-001, FR-004–008 | Test $100/3, $0.02/3, payer changes, 100% percentage and exact totals. |
| R-06 | Major | FR-024, NFR-002, Claude assumptions | Decide shared-machine/network use, password hashing, access controls. |
| R-07 | Major | FR-026, research | Specify atomicity for receipts, expenses, approvals and payments. |
| R-08 | Minor | Constitution and spec headers | Constitution ratification date TODO; spec still Draft. |
| R-09 | Minor | SC-001/002/006 | Identify numerical usability targets as proposed course metrics, not customer-stated. |
| R-10 | Major | Repository tree | Add detailed UML and tests before claiming design verification. |

## 9. Recommended architecture

**Proposed for CIS 285:** one Java 21 Maven module with **layered architecture + MVC/presenter Swing UI**, adopting selected hexagonal practices where useful:
- `ui`: Swing views, thin controllers/presenters, no money/authorization rules.
- `application`: use cases, validation, authorization, transaction orchestration.
- `domain`: user/group/expense/payment models, pure split and balance calculations.
- `application.port`: repository/storage interfaces owned by the inner boundary.
- `infrastructure`: persistence, receipt, and credential adapters.
- `bootstrap`: dependency wiring.

Use `BigDecimal`, deterministic rounding, auditable decisions/payments and JUnit tests. Keep future web delivery as a separate approved phase. Do not adopt full event sourcing for the classroom MVP.

**This is a recommendation, not an approved decision.** Students must justify their architecture choice.

## 10. Architecture Decision Record

See `architecture/ADR-001-Architecture-Selection.md`, marked **Proposed — Pending Student Approval**.

## References

- [Original requirements](https://github.com/zxu2001/lab6-9/blob/master/UserRequirement.md)
- [Constitution](https://github.com/zxu2001/lab6-9/blob/master/.specify/memory/constitution.md)
- [Spec Kit specification](https://github.com/zxu2001/lab6-9/blob/master/specs/001-splitsmart-core/spec.md)
- [Spec Kit plan](https://github.com/zxu2001/lab6-9/blob/master/specs/001-splitsmart-core/plan.md)
- [Claude alternatives](https://github.com/zxu2001/lab6-9/blob/master/architecture/Claude_Architecture_Alternatives.md)
- [Component diagram](https://github.com/zxu2001/lab6-9/blob/master/specs/001-splitsmart-core/architecture.puml)
