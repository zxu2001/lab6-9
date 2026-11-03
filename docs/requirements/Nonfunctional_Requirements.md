# Nonfunctional Requirements

The IDs NFR-001 to NFR-008 keep their numbers from the 2026-10-27 specification. Their text is revised where a customer decision changed them. NFR-009 onward are new. Every NFR has a verification method and test references (see the [Test Strategy](../testing/Test_Strategy.md)).

| ID | Category | Requirement | Measure / verification | Source | Status vs. 2026-10-27 |
| --- | --- | --- | --- | --- | --- |
| NFR-001 | Monetary precision | All money uses `java.math.BigDecimal` (scale 2, USD) in Java and `NUMERIC(19,2)` in PostgreSQL. No `float` or `double` anywhere in money paths. Leftover cents are allocated deterministically by stable participant ID (BR-SPL-02/03). Σ shares = amount. Σ group net balances = 0.00. | UT-SPL-*, UT-BAL-03, FIN-*, IT-DB-03; a static check that money fields have no `double` or `float` (UT-ARCH-03) | D09, D18 | **Revised** (rounding rule changed from "half-up + remainder to payer") |
| NFR-002 | Security | BCrypt (cost ≥ 12) password hashes. HTTPS only (HSTS). CSRF tokens on state-changing requests. Secure/HttpOnly/SameSite=Lax cookies. Object-level authorization. Secrets never in source control. Token hashes only. | SEC-* | D11, D12, D30, D37 | Revised (made concrete) |
| NFR-003 | Auditability | Every audited action (BR-AUD-02) records the actor, UTC timestamp, entity, and details in the same transaction as the change. Audit rows are insert-only. | IT-DB-08, IT-TX-02, UT-AUD-01 | D19 | Retained, expanded |
| NFR-004 | Usability / feedback | Each primary journey ends with clear success or field-level error feedback. A failed submission re-renders the form with the entered values (except passwords and file inputs, which browsers cannot repopulate; already-retained receipts stay listed). | IT-MVC-01, IT-MVC-03 | Spec NFR-004 | Retained (web wording) |
| NFR-005 | Report consistency | `EFFECTIVE`-mode report totals equal the balance-service figures for the same group and filters. | UT-RPT-07, IT-RPT-01 | D05 | Retained |
| NFR-006 | Architecture separation | Layered + MVC. The domain layer has no dependency on Spring MVC, Thymeleaf, Spring Data, Hibernate-specific APIs, PostgreSQL drivers, the AWS SDK, or infrastructure classes. Controllers contain no business rules. | UT-ARCH-01/02 (architecture tests) | ADR-001, Constitution IV | **Revised** (desktop → web) |
| NFR-007 | Test automation | Unit tests: JUnit 5 + Mockito. Integration tests: Spring Boot Test + Testcontainers PostgreSQL (same major version as RDS). MVC slice tests for controllers. No browser E2E. Run by `mvn verify`. | Test Strategy | D33 | **Revised** (Swing GUI tests removed) |
| NFR-008 | Governance | AI-generated artifacts receive human review before acceptance or commit. | Review checklist | Constitution IX | Retained |
| NFR-009 | Concurrency and atomicity | Each use case runs in exactly one database transaction (READ COMMITTED). Ledger-affecting operations serialize per group via `SELECT … FOR UPDATE` on the group row. Aggregates use JPA `@Version` optimistic locking. Any failure rolls back completely. | CON-*, IT-TX-* | D19, D24 | New |
| NFR-010 | Schema management | Schema is created and changed only by versioned Flyway SQL migrations. `spring.jpa.hibernate.ddl-auto=validate` in every environment. | IT-DB-01, IT-DB-02 | D32 | New |
| NFR-011 | Deployment | Spring Boot on AWS EC2 (Java 21), Amazon RDS for PostgreSQL in private subnets, TLS everywhere, secrets in AWS Secrets Manager / SSM, IAM least privilege. No infrastructure provisioned in this phase. | Deployment review checklist | D06, D12 | New |
| NFR-012 | Determinism | Allocation, approver ordering, and settlement-plan generation give identical output for identical ledger state, regardless of input order. | UT-SPL-11, UT-SET-09 | D09, D34, DA-15 | New |
| NFR-013 | Time handling | Timestamps are persisted as `TIMESTAMPTZ` in UTC, using an injected `java.time.Clock`. Display converts to the user's zone (default `America/Detroit`). Business dates (expense date, payment date) are `DATE`. | UT-TIME-01 | DA-13 | New |
| NFR-014 | Receipt limits | Only JPEG, PNG, or PDF; ≤ 10 MiB per file; ≤ 10 per version; magic-byte validated. The servlet multipart limit is configured at 10 MiB per file and 105 MiB per request. | UT-RCP-*, SEC-15–SEC-17 | D13, D27, DA-24 | New |
| NFR-015 | Abuse resistance | Login lockout and auth-email rate limits per BR-AUTH-08. Generic responses for reset and resend. | SEC-05–SEC-08 | D30, DA-29 | New |
| NFR-016 | Platform | Java 21 (LTS). Maven build. A currently supported Spring Boot release with Spring MVC, Spring Security, Spring Data JPA/Hibernate, Thymeleaf, and Flyway. Versions are pinned in the Maven BOM. | Build review | D07, Constitution II | New |
| NFR-017 | Performance (design target) | p95 server time < 1 s for page requests and < 2 s for reports, for groups ≤ 50 members and ≤ 10 000 expense versions, on a t3.small-class instance. | Load smoke test (manual, pre-release) | Design assumption | New (DA, not customer-stated) |
| NFR-018 | Data durability | RDS automated backups (≥ 7-day retention), deletion protection, and encryption at rest (KMS). Multi-AZ recommended for production. | Deployment checklist | D12 | New |
| NFR-019 | Privacy | No response discloses whether an email is registered (reset, resend, invitation preview). Logs never contain passwords, raw tokens, session IDs, or receipt bytes. | SEC-09, SEC-24 | D30, NFR-002 | New |
| NFR-020 | Accessibility (design target) | Thymeleaf pages use semantic HTML, labeled form controls, and visible error text tied to fields (`aria-describedby`). Status is never conveyed by color alone. | Manual review | Design assumption | New |

## Retired

| Former statement | Reason |
| --- | --- |
| Spec NFR-006 "desktop MVP must keep presentation and business separated" (Swing wording) | Replaced by the web wording in NFR-006 (D01). |
| Spec NFR-007 "display-critical workflows" via Swing GUI tests | Replaced by MVC controller slice tests. Browser E2E is explicitly not required (D33). |
| Spec NFR-001 "half-up rounding; payer receives the remainder" | Replaced by deterministic allocation by stable participant ID (D09). This also matters because the payer may not be a participant (D20). |
