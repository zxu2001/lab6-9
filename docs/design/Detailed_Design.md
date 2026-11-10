# Detailed Design: Index and Conventions

| Architecture | Layered + MVC ([ADR-001](../../architecture/ADR-001-Architecture-Selection.md)) |
| --- | --- |
| Scope | Server-rendered Spring Boot web application (D01, D06, D07) |
| Status | Design baseline v1.0, 2026-11-03. **No implementation in this phase.** |

## 1. Document map

| Area | Document | Primary decisions | Key UML |
| --- | --- | --- | --- |
| Use cases and context | [spec.md](../../specs/001-splitsmart-core/spec.md) | all | [01](../uml/01_Use_Case_Overview.puml), [05](../uml/05_System_Context.puml) |
| Domain model | [Domain_Model](Domain_Model.md) | all | [09](../uml/09_Domain_Class_Diagram.puml) |
| Services overview | [application-services.md](../../specs/001-splitsmart-core/contracts/application-services.md) | all | [10](../uml/10_Application_Service_Class_Diagram.puml) |
| Authentication | [Authentication_Design](Authentication_Design.md) | D11, D30, D31 | [17](../uml/17_Account_Verification_State_Machine.puml), [25](../uml/25_Sequence_Register_Verify_Email.puml), [26](../uml/26_Sequence_Password_Reset.puml) |
| Groups and membership | [Group_Membership_Design](Group_Membership_Design.md) | D08, D16, D17, D22 | [03](../uml/03_Use_Case_Group_Management.puml), [15](../uml/15_Group_State_Machine.puml) |
| Invitations | [Group_Invitation_Design](Group_Invitation_Design.md) | D08, D37 | [16](../uml/16_Invitation_State_Machine.puml), [27](../uml/27_Sequence_Create_Group_Invitation.puml), [28](../uml/28_Sequence_Accept_Invitation.puml) |
| Archiving | [Group_Archiving_Design](Group_Archiving_Design.md) | D29, D36 | [24](../uml/24_Activity_Archive_Group.puml), [39](../uml/39_Sequence_Archive_Group.puml) |
| Expense approval | [Expense_Approval_Design](Expense_Approval_Design.md) | D02, D15, D35, D41 | [13](../uml/13_Expense_State_Machine.puml), [18](../uml/18_Activity_Create_Expense.puml), [19](../uml/19_Activity_Approve_Expense.puml), [29](../uml/29_Sequence_Create_Expense.puml)–[31](../uml/31_Sequence_Reject_Expense.puml) |
| Expense versioning | [Expense_Versioning_Design](Expense_Versioning_Design.md) | D10, D25, D27, D28 | [20](../uml/20_Activity_Edit_Expense.puml), [32](../uml/32_Sequence_Edit_Approved_Expense.puml) |
| Expense cancellation | [Expense_Cancellation_Design](Expense_Cancellation_Design.md) | D14 | [14](../uml/14_Expense_Cancellation_State_Machine.puml), [21](../uml/21_Activity_Cancel_Expense.puml), [33](../uml/33_Sequence_Cancel_Approved_Expense.puml) |
| Receipts | [Receipt_Storage_Design](Receipt_Storage_Design.md) | D13, D27 | [34](../uml/34_Sequence_Upload_Receipt.puml) |
| Settlement algorithm | [Settlement_Algorithm](Settlement_Algorithm.md) | D09, D21, D34 | [22](../uml/22_Activity_Calculate_Settlement.puml), [35](../uml/35_Sequence_Calculate_Balances.puml), [36](../uml/36_Sequence_Generate_Settlement_Plan.puml) |
| Payments | [Payment_Processing_Design](Payment_Processing_Design.md) | D03, D23, D24, D39, D40 | [04](../uml/04_Use_Case_Settlement.puml), [23](../uml/23_Activity_Record_Payment.puml), [37](../uml/37_Sequence_Record_Payment.puml), [38](../uml/38_Sequence_Concurrent_Payment_Submission.puml) |
| Notifications | [Notification_Design](Notification_Design.md) | D04, D26 | [41](../uml/41_Sequence_Approval_Notification.puml) |
| Reporting | [Reporting_Design](Reporting_Design.md) | D05, D21 | [40](../uml/40_Sequence_Generate_Report.puml) |
| Transactions and concurrency | [Transaction_Concurrency_Design](Transaction_Concurrency_Design.md) | D19, D24, D29 | [38](../uml/38_Sequence_Concurrent_Payment_Submission.puml), [39](../uml/39_Sequence_Archive_Group.puml) |

## 2. Design conventions used by every detailed design document

| Convention | Meaning |
| --- | --- |
| `actor` | The authenticated user's `users.id`, resolved by the controller from the session principal and passed as the first argument of every service method. Services never trust user IDs from forms for authorization. |
| Commands / results | Immutable records in `application.command` / `application.result`. Controllers build commands from form objects. Services return results (never entities). |
| Transaction notation | **TX(RW, lock = group)** = `@Transactional` read-write that first calls `GroupRepository.lockById(groupId)` (`SELECT … FOR UPDATE`). **TX(RW)** = read-write without the group lock. **TX(RO)** = `readOnly = true`. |
| Failure semantics | Any exception rolls back the whole transaction (`rollbackFor = Exception.class`). No partial effects (FR-026). |
| Audit | "Audit: X" means `AuditService.record(...)` with event type X **inside** the same transaction |
| Time | `Instant now = clock.instant()`; `LocalDate today = LocalDate.now(clock.withZone(displayZone))` |
| Errors | `ValidationException` (field errors), `BusinessRuleViolationException` (rule code), `NotFoundException` (404), `ForbiddenException` (403), `ConcurrentModificationException` (409), `GroupArchivedException` (409) |

## 3. Controller → service map (presentation layer)

| Controller | Main routes (GET shows a form/page, POST changes state; all POSTs CSRF-protected and PRG) | Services |
| --- | --- | --- |
| `AuthController` | `GET/POST /register`, `GET /verify/{token}`, `POST /verify/resend`, `GET/POST /password-reset`, `GET/POST /password-reset/{token}`, `GET /login` | `AccountService`, `AccountVerificationService`, `PasswordResetService` |
| `DashboardController` | `GET /` (groups, pending approvals, unread count, pending invitations for me) | `GroupService`, `ExpenseApprovalService`, `NotificationService`, `InvitationService` |
| `GroupController` | `GET/POST /groups/new`, `GET /groups/{g}`, `POST /groups/{g}/ownership`, `POST /groups/{g}/leave`, `POST /groups/{g}/members/{u}/remove`, `GET/POST /groups/{g}/archive` | `GroupService`, `MembershipService` |
| `InvitationController` | `GET/POST /groups/{g}/invitations`, `POST /groups/{g}/invitations/{i}/revoke`, `GET /invitations/accept/{token}`, `POST /invitations/accept/{token}`, `POST /invitations/{i}/accept` | `InvitationService` |
| `CategoryController` | `GET/POST /groups/{g}/categories`, `POST /groups/{g}/categories/{c}/rename`, `POST …/{c}/deactivate` | `CategoryService` |
| `ExpenseController` | `GET /groups/{g}/expenses`, `GET/POST /groups/{g}/expenses/new` (multipart), `GET /groups/{g}/expenses/{e}`, `GET/POST /groups/{g}/expenses/{e}/edit` (multipart), `GET /groups/{g}/expenses/{e}/versions[/{n}]` | `ExpenseService`, `ExpenseVersionHistoryService`, `CategoryService` |
| `ApprovalController` | `GET /approvals`, `POST /groups/{g}/expenses/{e}/versions/{v}/approve`, `…/reject` | `ExpenseApprovalService` |
| `CancellationController` | `POST /groups/{g}/expenses/{e}/cancel`, `POST /groups/{g}/expenses/{e}/cancellation-requests`, `POST /groups/{g}/cancellation-requests/{r}/approve`, `…/reject` | `ExpenseCancellationService` |
| `ReceiptController` | `GET /groups/{g}/receipts/{r}` (download) | `ReceiptService` |
| `BalanceController` | `GET /groups/{g}/balances` (nets + plan) | `BalanceService`, `SettlementService` |
| `PaymentController` | `GET /groups/{g}/settle/{creditorId}` (confirmation with warning), `POST /groups/{g}/settle/{creditorId}`, `GET /groups/{g}/payments` | `PaymentService` |
| `NotificationController` | `GET /notifications`, `POST /notifications/{n}/open`, `POST /notifications/{n}/read`, `POST /notifications/read-all` | `NotificationService` |
| `ReportController` | `GET /reports` (cross-group overview), `GET /groups/{g}/reports` (filter form + results) | `ReportService` |

## 4. Design-level consistency rules

1. Only `ExpenseApprovalService`, `ExpenseService.edit`, `ExpenseCancellationService`, and `PaymentService` change ledger postings. All of them run TX(RW, lock = group).
2. `ArchiveService` logic (in `GroupService.archiveGroup`) and `MembershipService.deactivate` read the ledger under the same lock.
3. `NotificationService.create*` is called only from `ExpenseService` (submit/edit) and `ExpenseCancellationService.requestCancellation`, inside their transactions (D26).
4. `EmailService` is called only by after-commit listeners for `VerificationEmailRequested` and `PasswordResetEmailRequested` events (D31).
