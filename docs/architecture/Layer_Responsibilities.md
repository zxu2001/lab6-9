# Layer Responsibilities

The selected architecture is Layered + MVC (see [ADR-001](../../architecture/ADR-001-Architecture-Selection.md)). This document says what each layer **must**, **may**, and **must not** do. The dependency rules are in [Dependency_Rules](Dependency_Rules.md).

## 1. Presentation layer: `com.splitsmart.web`

| Must | May | Must not |
| --- | --- | --- |
| Map HTTP requests to controller methods; bind and validate **form objects** with Bean Validation (syntax: required, length, number format) | Pre-check visibility to hide buttons the user cannot use (cosmetic only) | Contain business rules (approver sets, balances, eligibility, allocation) |
| Resolve the current authenticated user (`@AuthenticationPrincipal`) and pass the user ID into service calls | Format money and dates for display (`MoneyFormatter`) | Call repositories, `EntityManager`, `EmailService`, or the AWS SDK |
| Convert form objects into application **commands**; call application service interfaces | Use Thymeleaf fragments, layouts, and progressive JS (e.g., a live percentage-sum hint) | Bind domain entities directly to forms or expose entities to templates |
| Put **view models** / result DTOs into the `Model`; select Thymeleaf views; follow POST-Redirect-GET | Use flash attributes for outcome messages | Start transactions (`@Transactional`) |
| Map exceptions to views and status codes in `GlobalExceptionHandler` (ValidationException → re-render form with field errors; NotFound → 404; Forbidden → 403; Conflict → 409 page with a reload link) | | Log sensitive data (passwords, tokens) |
| Include CSRF tokens in every form (Thymeleaf does this automatically with Spring Security) | | |

**Components**: controllers listed in [Architecture_Overview §4](Architecture_Overview.md#4-package-structure-canonical); templates under `src/main/resources/templates/{auth,groups,expenses,approvals,payments,reports,notifications}`.

## 2. Application / service layer: `com.splitsmart.application`

| Must | May | Must not |
| --- | --- | --- |
| Define one service interface per capability (see [contracts](../../specs/001-splitsmart-core/contracts/application-services.md)) and implement the use-case orchestration | Compose several domain policies in one use case | Depend on `web` classes, servlet APIs, or Thymeleaf |
| Own **transaction boundaries** (`@Transactional` on public service methods; `readOnly = true` for queries) | Use Spring annotations (`@Service`, `@Transactional`, `@TransactionalEventListener`) | Contain SQL or JPA queries directly (use repositories) |
| Enforce **authorization** for every operation through `AuthorizationService` (membership, ownership, creator, approver, debtor) | Publish application events (e.g., `VerificationEmailRequested`) to be handled after commit | Perform money arithmetic outside domain classes (`Money`, `SplitAllocator`, `BalanceCalculator`) |
| Acquire the group ledger lock for ledger-affecting operations (`GroupRepository.lockById`) | Retry once on `PessimisticLockException` / deadlock (see [Transaction_Concurrency_Design](../design/Transaction_Concurrency_Design.md)) | Return entities to the presentation layer (return result DTOs) |
| Write audit events and approval-request notifications in the **same** transaction as the change | | Send email inside the transaction |
| Declare integration interfaces (`EmailService`, `TokenService`, `ReceiptContentInspector`) | | |
| Translate optimistic-lock failures into `ConcurrentModificationException` (application) | | |

**Services**: `AccountService`, `AccountVerificationService`, `PasswordResetService`, `GroupService`, `MembershipService`, `InvitationService`, `CategoryService`, `ExpenseService`, `ExpenseVersionHistoryService`, `ExpenseApprovalService`, `ExpenseCancellationService`, `ReceiptService`, `BalanceService`, `SettlementService`, `PaymentService`, `NotificationService`, `ReportService`, `AuditService`, `AuthorizationService`.

## 3. Domain layer: `com.splitsmart.domain`

| Must | May | Must not |
| --- | --- | --- |
| Hold entities with invariant-enforcing behavior (e.g., `Expense.recordApproval`, `Expense.supersedeWith`, `GroupInvitation.accept`) | Carry `jakarta.persistence` mapping annotations and `@Version` (AD-08) | Import `org.springframework.*`, `org.hibernate.*`, `org.postgresql.*`, `software.amazon.*`, `jakarta.servlet.*`, `org.thymeleaf.*`, or `com.splitsmart.{web,application,infrastructure}` |
| Hold value objects: `Money`, `Percentage`, `EmailAddress`, `DateRange` | Throw domain exceptions (`BusinessRuleViolation`, `ValidationException` with field codes) | Perform I/O, read the clock directly (receive `Instant`/`LocalDate` as parameters), or log |
| Hold pure financial algorithms: `SplitAllocator`, `BalanceCalculator`, `SettlementPlanner` | Provide static factory methods for valid construction | Use `float`/`double` for money |
| Hold policies: `ApproverSetResolver`, `MembershipDeactivationPolicy`, `GroupArchivePolicy`, `ExpenseEditPolicy`, `CancellationPolicy`, `InvitationAcceptancePolicy` | | Depend on concrete repository implementations |
| Declare repository interfaces in `domain.repository` | | |

## 4. Persistence / infrastructure layer: `com.splitsmart.infrastructure`

| Must | May | Must not |
| --- | --- | --- |
| Implement domain repository interfaces with adapters over Spring Data JPA (`JpaExpenseRepository extends JpaRepository<Expense, Long>`) | Use native SQL for the ledger-postings query and `FOR UPDATE` locks | Contain business decisions (eligibility, allocation, approval outcome) |
| Configure Spring Security (filter chain, form login, CSRF, session management, `UserDetailsService`, BCrypt) | Use Hibernate-specific features inside adapters only | Be called directly by controllers (except Spring Security filters, which wrap the web layer by framework design) |
| Implement `EmailService` with `SesEmailService` (prod) and `MockEmailService` (dev/test, profile-selected) | Cache predefined categories | Store secrets in properties files committed to Git |
| Implement `TokenService` (SecureRandom, SHA-256) and `ReceiptContentInspector` (magic bytes, `ImageIO` decode check) | | |
| Provide a `Clock` bean (UTC); data source and Flyway configuration; AWS client configuration via instance-role credentials | | |

## 5. Responsibility allocation for key rules

| Rule | Enforced in | Supporting layers |
| --- | --- | --- |
| Approver set (D35) | Domain `ApproverSetResolver` | Application stores the snapshot; DB unique (version, approver) |
| Unanimous approval / rejection (D02) | Domain `Expense.recordApproval` / `recordRejection` | Application authorization + lock; DB check (reason on reject) |
| Leftover cents (D09) | Domain `SplitAllocator` | DB `CHECK share >= 0`; integration test Σ = amount |
| Net balances (D34) | Domain `BalanceCalculator` | Infrastructure ledger-postings query |
| Settlement plan (D34) | Domain `SettlementPlanner` | Application `SettlementService` |
| Debtor-only, full settlement, stale adjustment (D23, D24, D39) | Application `PaymentService` (authorization + lock + recompute) | Domain `SettlementPlanner`; DB unique idempotency key; immutability trigger |
| Archive eligibility (D29) | Domain `GroupArchivePolicy` | Application lock + queries |
| Deactivation eligibility (D16) | Domain `MembershipDeactivationPolicy` | Application queries for responsibilities |
| Invitation acceptance (D37) | Domain `InvitationAcceptancePolicy` / `GroupInvitation.accept` | Application token hashing + lookup |
| Receipt type/size (D13) | Application `ReceiptService` + infrastructure `ReceiptContentInspector` | DB `CHECK` on content type and size |
| Finality warning (D40) | Presentation (payment confirmation view) | Application `PaymentPreparation.finalityWarning` text |
| Field-level validation (FR-025) | Presentation (syntax) + domain (semantics) | GlobalExceptionHandler maps domain field codes to form fields |
