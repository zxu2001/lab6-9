# SplitSmart Design Documentation (v1.0, 2026-11-03)

This covers the design and documentation baseline for SplitSmart, a server-rendered **Spring Boot web application** built with a **Layered + MVC** architecture ([ADR-001](../architecture/ADR-001-Architecture-Selection.md)). **No application code exists yet.** All artifacts are AI-assisted drafts and require human review (Constitution IX).

| Area | Documents |
| --- | --- |
| Requirements | [Customer_Decision_Register](requirements/Customer_Decision_Register.md) · [Business_Rules](requirements/Business_Rules.md) · [Nonfunctional_Requirements](requirements/Nonfunctional_Requirements.md) · [Requirements_Traceability_Matrix](requirements/Requirements_Traceability_Matrix.md) · [Requirements_Conflict_Resolution](requirements/Requirements_Conflict_Resolution.md) · [Constitution_Amendment_Proposal](requirements/Constitution_Amendment_Proposal.md) |
| Spec Kit | [spec.md](../specs/001-splitsmart-core/spec.md) · [plan.md](../specs/001-splitsmart-core/plan.md) · [research.md](../specs/001-splitsmart-core/research.md) · [data-model.md](../specs/001-splitsmart-core/data-model.md) · [contracts](../specs/001-splitsmart-core/contracts/application-services.md) · [quickstart.md](../specs/001-splitsmart-core/quickstart.md) |
| Architecture | [Architecture_Overview](architecture/Architecture_Overview.md) · [Layer_Responsibilities](architecture/Layer_Responsibilities.md) · [Dependency_Rules](architecture/Dependency_Rules.md) · [Security_Architecture](architecture/Security_Architecture.md) · [AWS_Deployment_Design](architecture/AWS_Deployment_Design.md) |
| Detailed design | [Detailed_Design (index)](design/Detailed_Design.md) · [Domain_Model](design/Domain_Model.md) · [Expense_Approval_Design](design/Expense_Approval_Design.md) · [Expense_Versioning_Design](design/Expense_Versioning_Design.md) · [Expense_Cancellation_Design](design/Expense_Cancellation_Design.md) · [Group_Membership_Design](design/Group_Membership_Design.md) · [Group_Invitation_Design](design/Group_Invitation_Design.md) · [Group_Archiving_Design](design/Group_Archiving_Design.md) · [Settlement_Algorithm](design/Settlement_Algorithm.md) · [Payment_Processing_Design](design/Payment_Processing_Design.md) · [Notification_Design](design/Notification_Design.md) · [Reporting_Design](design/Reporting_Design.md) · [Receipt_Storage_Design](design/Receipt_Storage_Design.md) · [Authentication_Design](design/Authentication_Design.md) · [Transaction_Concurrency_Design](design/Transaction_Concurrency_Design.md) |
| Database | [PostgreSQL_Schema_Design](database/PostgreSQL_Schema_Design.md) · [Flyway_Migration_Plan](database/Flyway_Migration_Plan.md) · [Entity_Relationships](database/Entity_Relationships.md) · [Data_Integrity_Constraints](database/Data_Integrity_Constraints.md) · [Financial_Ledger_Design](database/Financial_Ledger_Design.md) |
| Testing | [Test_Strategy](testing/Test_Strategy.md) · [Unit_Test_Specification](testing/Unit_Test_Specification.md) · [Integration_Test_Specification](testing/Integration_Test_Specification.md) · [Financial_Edge_Cases](testing/Financial_Edge_Cases.md) · [Security_Test_Cases](testing/Security_Test_Cases.md) · [Concurrency_Test_Cases](testing/Concurrency_Test_Cases.md) · [Acceptance_Test_Matrix](testing/Acceptance_Test_Matrix.md) |
| UML (41 files, one diagram each) | [`docs/uml`](uml/): use cases 01–04 · context and structure 05–12 · state machines 13–17 · activities 18–24 · sequences 25–41 |
| Historical | [Claude_Architecture_Alternatives](../architecture/Claude_Architecture_Alternatives.md) · [ChatGPT_Architecture_Review](../architecture/ChatGPT_Architecture_Review.md) (superseded; retained) |

Render diagrams locally (from the repository root):

```text
java -jar plantuml-1.2025.10.jar -tsvg -o out docs/uml/*.puml
```
