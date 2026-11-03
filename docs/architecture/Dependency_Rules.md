# Dependency Rules

These rules are normative for the Layered + MVC architecture ([ADR-001](../../architecture/ADR-001-Architecture-Selection.md)). Architecture tests UT-ARCH-01–03 enforce them (see [Unit_Test_Specification](../testing/Unit_Test_Specification.md)). Diagrams [06](../uml/06_Layered_MVC_Architecture.puml), [07](../uml/07_Component_Diagram.puml), and [08](../uml/08_Package_Diagram.puml) show the same directions.

## 1. Allowed compile-time dependencies

| From \ To | web | application | domain | infrastructure | Spring MVC / Thymeleaf / Servlet | Spring core / tx | Spring Data / Hibernate | `jakarta.persistence` | AWS SDK / JDBC driver |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **web** | ✓ | ✓ | ✓ (value objects and enums only) | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **application** | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ (except `OptimisticLockException` translation) | ✗ |
| **domain** | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ (annotations only, AD-08) | ✗ |
| **infrastructure** | ✗ | ✓ (implements integration interfaces) | ✓ (implements repositories) | ✓ | ✓ (security config only) | ✓ | ✓ | ✓ | ✓ |

Rules:

- **R1** — Dependencies point downward (web → application → domain) or inward toward domain abstractions (infrastructure → domain / application interfaces). No cycles between packages.
- **R2** — `domain` depends only on the JDK and `jakarta.persistence` annotations. It never references Spring, Hibernate-specific types, PostgreSQL, SES, Thymeleaf, or any concrete infrastructure class.
- **R3** — `web` never depends on `infrastructure` or on repositories. All data access goes through application services.
- **R4** — `application` depends on **interfaces** for persistence (`domain.repository.*`) and external services (`application.integration.*`). The Spring container injects implementations at runtime.
- **R5** — Templates (`.html`) receive only view models and result DTOs, never JPA entities. (`open-in-view=false` makes violations fail fast.)
- **R6** — Money types: no `float`/`double` fields, parameters, or return values in `domain.finance`, `domain.model`, or `application.result` for monetary values.
- **R7** — Spring Security's filter chain (infrastructure) wraps the web layer at **runtime**. This is a framework call, not a compile-time dependency of `web` on `infrastructure`.

## 2. Runtime call directions

```
Browser → [Spring Security filters] → web.controller → application.service
         → domain (entities, policies, calculators)
         → domain.repository (interface) ⇢ infrastructure.persistence (adapter) → PostgreSQL
application.service → application.integration.EmailService (interface)
         ⇢ infrastructure.email.SesEmailService → Amazon SES       (after commit)
```

`⇢` means "implemented by". Compile-time dependencies always point from the implementation to the interface.

## 3. Dependency inversion seams

| Abstraction (owner layer) | Implementation (infrastructure) | Reason |
| --- | --- | --- |
| `domain.repository.UserAccountRepository`, `GroupRepository`, `MembershipRepository`, `InvitationRepository`, `CategoryRepository`, `ExpenseRepository`, `ExpenseVersionRepository`, `CancellationRequestRepository`, `ReceiptRepository`, `PaymentRepository`, `NotificationRepository`, `AuditEventRepository`, `VerificationTokenRepository`, `PasswordResetTokenRepository`, `LedgerQueryRepository` | `*RepositoryAdapter` delegating to `Jpa*Repository` (Spring Data) and native queries | Keeps domain and application free of Spring Data; allows Mockito fakes |
| `application.integration.EmailService` | `SesEmailService` (profile `prod`), `MockEmailService` (profiles `dev`, `test`) | D31 |
| `application.integration.TokenService` | `SecureTokenService` | Hashing and random generation details |
| `application.integration.ReceiptContentInspector` | `MagicByteReceiptInspector` | Uses `javax.imageio` (desktop module), kept out of the domain |
| `java.time.Clock` (JDK) | `ClockConfiguration` bean (`Clock.systemUTC()`); fixed clock in tests | Deterministic time |

## 4. Why entities carry JPA annotations (AD-08)

| Option | Assessment |
| --- | --- |
| A. Annotated domain entities (selected) | One model. `@Version` is directly on the aggregates (D19). `jakarta.persistence` is a vendor-neutral specification API, not concrete infrastructure. Requires discipline: no Hibernate-specific annotations (e.g., `@Type`) in the domain. |
| B. Separate persistence entities + mappers | Purest separation, but doubles the class count and adds mapping bugs. This is closer to the hexagonal style that was explicitly not selected. |

If a Hibernate-specific mapping is needed (e.g., for `BYTEA` or `JSONB`), it goes on an infrastructure-only entity. Examples: `ReceiptContentEntity` and `AuditEventEntity` live in `infrastructure.persistence`, and the domain sees `ReceiptContent` and `AuditEvent` through the repository interface as plain records.

## 5. Enforcement

| Test | Assertion |
| --- | --- |
| UT-ARCH-01 | Classes in `..domain..` do not depend on `org.springframework..`, `org.hibernate..`, `org.postgresql..`, `software.amazon..`, `jakarta.servlet..`, `org.thymeleaf..`, `..web..`, `..application..`, `..infrastructure..` |
| UT-ARCH-02 | `..web..` does not depend on `..infrastructure..` or `..domain.repository..`. `..application..` does not depend on `..web..` or `..infrastructure..`. No package cycles. |
| UT-ARCH-03 | No field, parameter, or return type of `float`/`double` in `..domain.finance..`, `..domain.model..`, or `..application.result..` |

Implementation note: ArchUnit as a test-scope Maven dependency is recommended (a new test dependency, so instructor approval is needed). Without it, UT-ARCH-01/02 can be checked with `jdeps --multi-release 21 -verbose:package` output parsed in a JUnit test, and UT-ARCH-03 with a JUnit reflection scan of declared fields, parameters, and return types.
