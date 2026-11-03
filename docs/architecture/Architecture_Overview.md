# Architecture Overview

| Item | Value |
| --- | --- |
| Selected architecture | **Layered Architecture + Model–View–Controller (MVC)**, server-rendered web application ([ADR-001](../../architecture/ADR-001-Architecture-Selection.md), Accepted) |
| Not selected | Hexagonal / Ports-and-Adapters, Clean Architecture, MVP, event-sourced CQRS. These remain as historical analysis in [Claude_Architecture_Alternatives](../../architecture/Claude_Architecture_Alternatives.md) and [ChatGPT_Architecture_Review](../../architecture/ChatGPT_Architecture_Review.md). |
| Delivery | Web (D01, D06) |
| Related | [Layer_Responsibilities](Layer_Responsibilities.md) · [Dependency_Rules](Dependency_Rules.md) · [Security_Architecture](Security_Architecture.md) · [AWS_Deployment_Design](AWS_Deployment_Design.md) · [Detailed_Design](../design/Detailed_Design.md) |

## 1. Technology stack

| Concern | Technology | Decision |
| --- | --- | --- |
| Language / runtime | Java 21 (LTS) | Constitution II, D07 |
| Application framework | Spring Boot (a supported release, pinned via the BOM) | D07 |
| Web / MVC | Spring MVC, server-rendered | D07 |
| Views | Thymeleaf templates, HTML, CSS, progressive-enhancement JavaScript (no SPA) | D07 |
| Authentication | Spring Security form login, server-side `HttpSession` | D11 |
| Password hashing | BCrypt (`BCryptPasswordEncoder`, strength 12) | D11 |
| Persistence | Spring Data JPA / Hibernate. `ddl-auto=validate`, `open-in-view=false` | D07, D32 |
| Database | PostgreSQL 16 on Amazon RDS | D06, D12 |
| Migrations | Flyway versioned SQL (planned in this phase, not yet executable) | D32 |
| Email | Amazon SES (AWS SDK v2) behind `EmailService`. Mock implementation in dev/test. | D31 |
| Build | Maven | D07 |
| Tests | JUnit 5, Mockito, Spring Boot Test, Testcontainers PostgreSQL | D33 |
| Hosting | AWS EC2, HTTPS | D12 |
| UML | PlantUML, one diagram per `.puml` file in [`docs/uml`](../uml/) | Constitution VII |

## 2. Logical architecture (layers)

```
┌──────────────────────────────────────────────────────────────┐
│ Presentation layer (com.splitsmart.web)                      │
│  Spring MVC @Controller · Thymeleaf views · form objects     │
│  (Bean Validation) · view models · exception→view mapping    │
│  · current-user resolution · CSRF tokens in forms            │
└──────────────────────────┬───────────────────────────────────┘
                           │ calls service interfaces with commands,
                           ▼ receives result DTOs
┌──────────────────────────────────────────────────────────────┐
│ Application / service layer (com.splitsmart.application)     │
│  Use-case services · @Transactional boundaries ·             │
│  AuthorizationService · audit · notification creation ·      │
│  EmailService / TokenService / ReceiptContentInspector       │
│  interfaces (implemented in infrastructure)                  │
└──────────────────────────┬───────────────────────────────────┘
                           │ uses entities, policies, calculators,
                           ▼ repository interfaces
┌──────────────────────────────────────────────────────────────┐
│ Domain layer (com.splitsmart.domain)                         │
│  Entities & value objects (Money, Percentage, EmailAddress)  │
│  · lifecycle state machines · SplitAllocator ·               │
│  ApproverSetResolver · BalanceCalculator · SettlementPlanner │
│  · membership/archive/edit/cancellation policies ·           │
│  repository interfaces · domain exceptions                   │
└──────────────────────────▲───────────────────────────────────┘
                           │ implements repository interfaces and
                           │ application integration interfaces
┌──────────────────────────┴───────────────────────────────────┐
│ Persistence / infrastructure layer                           │
│ (com.splitsmart.infrastructure)                              │
│  Spring Data JPA repositories + repository adapters ·        │
│  PostgreSQL · SesEmailService / MockEmailService ·           │
│  Spring Security configuration · token generator/hasher ·    │
│  receipt content inspector · Clock bean · configuration      │
└──────────────────────────────────────────────────────────────┘
```

The MVC roles live in the presentation layer:

- **Controller**: a Spring MVC `@Controller` (e.g., `ExpenseController`).
- **Model**: the view model or form object placed in the Spring `Model`. It is not the domain entity.
- **View**: a Thymeleaf template.

The **domain model** is a separate layer and is never bound directly to forms (this prevents over-posting).

**Dependency inversion** is applied at two seams:

1. Repository interfaces (`ExpenseRepository`, `PaymentRepository`, …) are declared in the domain layer and implemented in infrastructure by adapters that delegate to Spring Data JPA.
2. External services (`EmailService`, `TokenService`, `ReceiptContentInspector`) are declared in the application layer and implemented in infrastructure.

This is ordinary layered DIP. It is **not** a ports-and-adapters architecture: there are no inbound ports, and the controllers call concrete service interfaces of the application layer directly.

Diagrams: [06_Layered_MVC_Architecture](../uml/06_Layered_MVC_Architecture.puml), [07_Component_Diagram](../uml/07_Component_Diagram.puml), [08_Package_Diagram](../uml/08_Package_Diagram.puml).

## 3. Physical (deployment) architecture

The physical and logical views are different: all four logical layers run inside **one** Spring Boot process (a single deployable JAR) on an EC2 instance. The physical tiers are:

| Tier | Node | Notes |
| --- | --- | --- |
| Client | User's browser | HTTPS only |
| Edge | Application Load Balancer with an ACM certificate (recommended), or nginx + TLS on the instance (cost alternative) | TLS 1.2+, HTTP → HTTPS redirect |
| Application | EC2 (Amazon Linux 2023, Amazon Corretto 21), `splitsmart.jar` under systemd | Private subnet, IAM instance role |
| Data | Amazon RDS for PostgreSQL 16 | Private subnet, TLS required, encrypted, automated backups |
| External | Amazon SES | Verification and reset emails only |
| Ops | AWS Secrets Manager / SSM Parameter Store, CloudWatch Logs | No secrets in the AMI or repository |

See [AWS_Deployment_Design](AWS_Deployment_Design.md) and [12_AWS_Deployment_Diagram](../uml/12_AWS_Deployment_Diagram.puml). System context: [05_System_Context](../uml/05_System_Context.puml).

## 4. Package structure (canonical)

```text
com.splitsmart
├── SplitSmartApplication                 (Spring Boot entry point)
├── web                                   PRESENTATION
│   ├── controller   AuthController, AccountController, GroupController,
│   │                InvitationController, CategoryController, ExpenseController,
│   │                ApprovalController, CancellationController, ReceiptController,
│   │                BalanceController, PaymentController, NotificationController,
│   │                ReportController, DashboardController
│   ├── form         RegistrationForm, PasswordResetForm, GroupForm, InvitationForm,
│   │                CategoryForm, ExpenseForm, AllocationRow, DecisionForm,
│   │                CancellationRequestForm, SettlementForm, ReportFilterForm
│   ├── view         *ViewModel classes (read-only presentation data)
│   ├── advice       GlobalExceptionHandler (domain/app exceptions → views/status)
│   └── support      CurrentUserArgumentResolver, FlashMessages
├── application                           APPLICATION / SERVICE
│   ├── service      *Service interfaces + *ServiceImpl (@Service, @Transactional)
│   ├── command      immutable command records (CreateExpenseCommand, …)
│   ├── result       result/DTO records (ExpenseDetails, PaymentOutcome, …)
│   ├── security     AuthorizationService, Actor, GroupAccess
│   ├── audit        AuditService
│   ├── notification NotificationService
│   └── integration  EmailService, TokenService, ReceiptContentInspector (interfaces)
├── domain                                DOMAIN (no Spring, no web, no DB driver)
│   ├── model        entities + enums (Expense, ExpenseVersion, Payment, …)
│   ├── finance      Money, Percentage, SplitAllocator, BalanceCalculator,
│   │                SettlementPlanner, LedgerPosting, NetBalance, SettlementPlan
│   ├── policy       ApproverSetResolver, MembershipDeactivationPolicy,
│   │                GroupArchivePolicy, ExpenseEditPolicy, CancellationPolicy
│   ├── repository   repository interfaces (plain Java)
│   └── exception    DomainException hierarchy (ValidationException, …)
└── infrastructure                        PERSISTENCE / INFRASTRUCTURE
    ├── persistence  Spring Data JPA interfaces (Jpa*Repository) + *RepositoryAdapter
    ├── email        SesEmailService, MockEmailService, EmailTemplates
    ├── security     SecurityConfiguration, SplitSmartUserDetailsService,
    │                LoginAttemptService, RateLimiter
    ├── token        SecureTokenService (SecureRandom + SHA-256)
    ├── receipt      MagicByteReceiptInspector
    └── config       ClockConfiguration, AwsConfiguration, properties classes
```

## 5. Key cross-cutting decisions

| # | Decision | Rationale | Detail |
| --- | --- | --- | --- |
| AD-01 | Application services own transactions (`@Transactional`). Controllers are non-transactional. `open-in-view=false`. | Clear atomic boundaries (D19). No lazy loading in views. | [Transaction_Concurrency_Design](../design/Transaction_Concurrency_Design.md) |
| AD-02 | All ledger-affecting operations acquire a per-group pessimistic lock (`SELECT … FOR UPDATE` on `expense_groups`) before validating. | Serializes financial changes per group. Prevents stale payment amounts, duplicate settlement, and archive races (D24, D29). | same |
| AD-03 | Aggregates (`Group`, `GroupMembership`, `GroupInvitation`, `Expense`, `ExpenseApproval`, `ExpenseCancellationRequest`, `CancellationApproval`, `ExpenseCategory`, `UserAccount`) carry JPA `@Version`. | Detects lost updates from stale forms (D19). | same |
| AD-04 | Balances and settlement plans are computed on demand by pure domain classes from ledger postings. They are never stored. | Single source of truth (DA-12). | [Financial_Ledger_Design](../database/Financial_Ledger_Design.md) |
| AD-05 | Expense content lives in immutable `ExpenseVersion` rows. `Expense` holds lifecycle status and the `current_version_id` / `effective_version_id` pointers. | D10, D25, D27. | [Expense_Versioning_Design](../design/Expense_Versioning_Design.md) |
| AD-06 | Authorization is enforced inside application services through `AuthorizationService`. Spring Security handles only authentication and URL-level "authenticated" checks. | D11, D39, DA-06. | [Security_Architecture](Security_Architecture.md) |
| AD-07 | Emails are sent after commit (`@TransactionalEventListener(phase = AFTER_COMMIT)`). An SES failure never rolls back registration or reset, and the user can resend. | D31, §6.12. | [Authentication_Design](../design/Authentication_Design.md) |
| AD-08 | Domain entities may carry Jakarta Persistence mapping annotations (`jakarta.persistence.*`, a standard API) but no Spring, Hibernate-specific, or PostgreSQL types. | Pragmatic layered design. Keeps D19 `@Version` on entities. Avoids a parallel entity model. | [Dependency_Rules](Dependency_Rules.md) |
| AD-09 | Unauthorized object access returns 404, and in-group role failures return 403. | Prevents enumeration (DA-40). | [Security_Architecture](Security_Architecture.md) |
| AD-10 | The POST-Redirect-GET pattern applies to every state-changing form. Flash attributes carry outcomes such as payment adjustments. | Prevents duplicate submits on refresh. Complements idempotency keys. | [Payment_Processing_Design](../design/Payment_Processing_Design.md) |

## 6. Quality-attribute strategies

| Quality | Strategy |
| --- | --- |
| Financial correctness | Integer-cent allocation; DB `CHECK`s; Σ invariants tested; derived balances; immutable payments |
| Security | Spring Security, BCrypt, CSRF, HTTPS/HSTS, object-level authorization, token hashing, rate limits |
| Consistency under concurrency | Group ledger lock + `@Version` + unique constraints + idempotency keys |
| Auditability | Immutable versions, decisions, and payments + insert-only `audit_events` |
| Maintainability | Layered packages with architecture tests; one service per capability; DTO boundaries |
| Testability | Pure domain calculators (unit tests); Mockito for services; Testcontainers for persistence, constraints, and concurrency; `@WebMvcTest` for controllers |
