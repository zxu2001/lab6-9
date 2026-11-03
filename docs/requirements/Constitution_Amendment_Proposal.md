# Constitution Amendment Proposal: v1.0.0 → v2.0.0 (MAJOR)

| Status | **Proposed. Requires human approval** (Constitution, Governance section). `.specify/memory/constitution.md` has **not** been modified. |
| --- | --- |
| Reason | Customer decisions D01, D06, D07 (web application, cloud database, Spring Boot / Spring MVC / Thymeleaf / PostgreSQL / Spring Data JPA) and D33 (test stack) conflict with Principle III ("Swing Provides the Human Interface") and partially with the Technology Constraints and Principle VI. |
| Version impact | **MAJOR**: Principle III is redefined (incompatible governance change), per the constitution's versioning policy. |
| Impacted artifacts after ratification | `.specify/memory/constitution.md`; `specs/001-splitsmart-core/plan.md` (Constitution Check row III → PASS); [Requirements_Conflict_Resolution](Requirements_Conflict_Resolution.md) C-02 → closed |

## 1. Proposed text changes

### Principle II: unchanged in substance

Java 21 and Maven remain mandatory. Spring Boot runs on Java 21.

### Principle III: replace

> **Current:** "III. Swing Provides the Human Interface — The desktop user interface MUST be implemented with Java Swing…"
>
> **Proposed:** "**III. Server-Rendered Web Interface.** The user interface MUST be a server-rendered web application built with Spring MVC and Thymeleaf (HTML, CSS, and progressive-enhancement JavaScript), delivered over HTTPS. Controllers, templates, form objects, and view models MUST remain focused on presenting application behavior and collecting user input. Implementation of the web UI does not change the customer requirements recorded separately in `UserRequirement.md` and the Customer Decision Register."

### Principle IV: wording update

Replace "Business rules MUST reside outside Swing classes and MUST not depend on UI widgets or Swing dialogs" with "Business rules MUST reside outside controllers and templates and MUST NOT depend on Spring MVC, Thymeleaf, servlet APIs, or persistence/infrastructure classes. The selected architecture is Layered + MVC (ADR-001)."

### Principle VI: extend

Add: "Unit tests use JUnit 5 and Mockito. Integration tests use Spring Boot Test and Testcontainers PostgreSQL. Browser end-to-end automation is not required for the MVP."

### Technology Constraints: replace the bullet list

- Java 21 and Maven are the build, dependency, and verification platform.
- Spring Boot with Spring MVC, Thymeleaf, Spring Security, Spring Data JPA/Hibernate.
- PostgreSQL (Amazon RDS in production), schema managed only by versioned Flyway migrations, with `ddl-auto=validate`.
- Tests use JUnit 5, Mockito, Spring Boot Test, and Testcontainers PostgreSQL.
- Architecture and interaction documentation uses PlantUML, one diagram per file.
- Money calculations use `java.math.BigDecimal` (PostgreSQL `NUMERIC(19,2)`) with explicit scale and deterministic allocation.
- Deployment target: AWS EC2 + Amazon RDS over HTTPS; Amazon SES for authentication emails only.

### Implementation Decisions paragraph

Replace "Java 21, Maven, JUnit 5, Java Swing, PlantUML…" with "Java 21, Maven, Spring Boot, Spring MVC, Thymeleaf, PostgreSQL, JUnit 5, Mockito, Testcontainers, PlantUML…".

## 2. Sync Impact Report (to prepend upon ratification)

```
- Version change: 1.0.0 -> 2.0.0
- Modified principles: III (Swing -> Server-Rendered Web Interface), IV (wording), VI (test stack)
- Modified sections: Technology Constraints; Customer Requirements and Implementation Decisions
- Added sections: none; Removed sections: none
- Follow-up TODOs: ratification date still TODO(ratification-date)
```

## 3. Approval

| Role | Name | Decision | Date |
| --- | --- | --- | --- |
| Course instructor / project owner | | ☐ Approve ☐ Reject | |
