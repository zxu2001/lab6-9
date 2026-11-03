# ADR-001 — SplitSmart Architecture Selection

**Status: Proposed — Pending Student Approval**

**Repository:** `zxu2001/lab6-9`

## Context
The original customer requirements specify a primarily web-based application. The CIS 285 course MVP uses Java 21, Swing, Maven, JUnit 5, and PlantUML. This delivery difference must be approved explicitly and must not silently replace customer requirement FR-022.

## Proposed Decision
Use a single-module layered architecture with MVC/presenter Swing UI. Domain contains business rules and money calculations, application contains use cases and authorization, repository interfaces belong to application/domain boundaries, and infrastructure implements persistence and receipt storage. Borrow lightweight ports and test fakes from hexagonal architecture without unnecessary interfaces.

## Alternatives
- Tightly coupled Swing monolith: low initial effort, but poor separation and testability.
- MVC alone: useful presentation structure, insufficient system-level domain/persistence boundaries.
- Layered + MVC: balanced teaching complexity and testability; **proposed**.
- Hexagonal + MVP: stronger adapter seams, but more abstraction and upfront work.
- Event-sourced CQRS: audit benefits, excessive complexity and privacy concerns for MVP.

## Consequences
Positive: clear responsibilities, independent JUnit tests, straightforward UML traceability, swappable storage. Negative: boundaries require enforcement; web delivery still requires additional UI, authentication, concurrency, and hosting design.

## Risks
Confirm desktop scope, reviewer roles, payment confirmation, notification/report MVP scope, monetary rounding, transaction atomicity, and access controls.

## Open Questions
1. Is Swing desktop delivery explicitly approved as a course MVP?
2. Are notifications, multi-level approval, and filtered reports in the MVP?
3. Who approves expenses and when are payments effective?
4. Is the system single-machine or networked?
5. What storage/receipt policy applies?

**Student approval is required before this ADR becomes accepted.**