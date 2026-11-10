# Requirements Traceability Matrix

Chain: **Customer Decision → Requirement (FR/NFR) → Business Rule → Design Component (document) → UML Diagram → Test Case**.

Sources: [Customer_Decision_Register](Customer_Decision_Register.md) · [spec.md](../../specs/001-splitsmart-core/spec.md) · [Business_Rules](Business_Rules.md) · [Nonfunctional_Requirements](Nonfunctional_Requirements.md) · design in [`docs/design`](../design/) · diagrams in [`docs/uml`](../uml/) · tests in [`docs/testing`](../testing/).

UML numbers refer to `docs/uml/NN_*.puml`. AT-Dxx refers to the [Acceptance_Test_Matrix](../testing/Acceptance_Test_Matrix.md).

## 1. Decision-level matrix (all 41 decisions)

| Dec. | Requirements | Business rules | Design components (document) | UML | Tests |
| --- | --- | --- | --- | --- | --- |
| D01 | FR-022, NFR-011 | none | Spring Boot web app, Layered + MVC ([ADR-001](../../architecture/ADR-001-Architecture-Selection.md), [Architecture_Overview](../architecture/Architecture_Overview.md)) | 05, 06, 12 | AT-D01, IT-MVC-01–08, UT-ARCH-01 |
| D02 | FR-011, FR-013 | BR-APR-03–07, BR-BAL-02 | `ExpenseApprovalService`, `Expense.recordApproval/recordRejection` ([Expense_Approval_Design](../design/Expense_Approval_Design.md)) | 13, 19, 30, 31 | AT-D02, UT-APR-06–10, CON-06, FIN-01 |
| D03 | FR-017 | BR-PAY-06 | `Payment.settle`, `PaymentService` ([Payment_Processing_Design](../design/Payment_Processing_Design.md)) | 23, 37 | AT-D03, UT-PAY-01 |
| D04 | FR-010 | BR-NOT-03, BR-AUTH-09 | `NotificationService`, `notifications` table ([Notification_Design](../design/Notification_Design.md)) | 41, 05 | AT-D04, UT-NOT-06, IT-EMAIL-01 |
| D05 | FR-018–FR-021 | BR-RPT-01–05 | `ReportService`, `ReportQueryRepository` ([Reporting_Design](../design/Reporting_Design.md)) | 40 | AT-D05, UT-RPT-01–07, IT-MVC-07, IT-RPT-01 |
| D06 | FR-022, NFR-011, NFR-018 | none | RDS PostgreSQL ([AWS_Deployment_Design](../architecture/AWS_Deployment_Design.md)) | 05, 12 | AT-D06, IT-DB-01 |
| D07 | NFR-016, NFR-006 | none | Technology stack, package structure ([Architecture_Overview](../architecture/Architecture_Overview.md), [Dependency_Rules](../architecture/Dependency_Rules.md)) | 06, 07, 08 | AT-D07, IT-DB-02, UT-ARCH-01–03 |
| D08 | FR-003, FR-032 | BR-GRP-01, BR-INV-01–05 | `GroupService.createGroup`, `InvitationService` ([Group_Membership_Design](../design/Group_Membership_Design.md), [Group_Invitation_Design](../design/Group_Invitation_Design.md)) | 03, 16, 27, 28 | AT-D08, UT-INV-01, SEC-13 |
| D09 | FR-005–FR-007, NFR-001 | BR-SPL-01–06, BR-EXP-03 | `Money`, `Percentage`, `SplitAllocator` ([Settlement_Algorithm §2](../design/Settlement_Algorithm.md)) | 09, 18, 22 | AT-D09, UT-MON-01–05, UT-SPL-01–11, FIN-01–05, IT-DB-03, IT-DB-12 |
| D10 | FR-039, FR-023, FR-028 | BR-VER-01–07, BR-VER-10/11 | `ExpenseService.editExpense`, `ExpenseVersion`, `ExpenseVersionHistoryService` ([Expense_Versioning_Design](../design/Expense_Versioning_Design.md)) | 13, 20, 32 | AT-D10, UT-VER-01–08, FIN-12, IT-DB-07, CON-07, CON-09 |
| D11 | FR-001, FR-002, FR-024 | BR-AUTH-01–03, BR-AUTH-10 | Spring Security config, `AccountService`, `AuthorizationService` ([Authentication_Design](../design/Authentication_Design.md), [Security_Architecture](../architecture/Security_Architecture.md)) | 17, 25, 06 | AT-D11, SEC-01–05, IT-AUTHZ-01–06 |
| D12 | NFR-011, NFR-018 | none | EC2, RDS, ALB/ACM, Secrets Manager, IAM ([AWS_Deployment_Design](../architecture/AWS_Deployment_Design.md)) | 12 | AT-D12 (review), IT-EMAIL-02 |
| D13 | FR-009, NFR-014 | BR-RCP-01–06 | `ReceiptService`, `ReceiptContentInspector`, `receipts`/`receipt_contents` ([Receipt_Storage_Design](../design/Receipt_Storage_Design.md)) | 11, 34 | AT-D13, UT-RCP-01–05, IT-DB-10, SEC-15–17 |
| D14 | FR-040, FR-041 | BR-CAN-01–10 | `ExpenseCancellationService`, `ExpenseCancellationRequest` ([Expense_Cancellation_Design](../design/Expense_Cancellation_Design.md)) | 13, 14, 21, 33 | AT-D14, UT-CAN-01–10, FIN-13, FIN-14, CON-08 |
| D15 | FR-043 | BR-APR-02, BR-CAN-04 | `ApproverSetResolver`, `Expense.submit` auto-approval ([Expense_Approval_Design](../design/Expense_Approval_Design.md)) | 13, 18, 29 | AT-D15, UT-APR-05, UT-CAN-08, FIN-10 |
| D16 | FR-035, FR-027 | BR-GRP-05–09 | `MembershipService`, `MembershipDeactivationPolicy` ([Group_Membership_Design](../design/Group_Membership_Design.md)) | 03, 15 | AT-D16, UT-GRP-01–04, CON-12 |
| D17 | FR-034 | BR-GRP-02–04 | `GroupService.transferOwnership`, `Group` ([Group_Membership_Design](../design/Group_Membership_Design.md)) | 03, 15 | AT-D17, UT-GRP-05–07, UT-APR-07, SEC-20, CON-10 |
| D18 | FR-051 | BR-EXP-03 | `Money` (USD fixed), `ck_*_currency` ([PostgreSQL_Schema_Design](../database/PostgreSQL_Schema_Design.md)) | 09, 11 | AT-D18, UT-MON-01, IT-DB-03 |
| D19 | FR-023, FR-026, FR-050, NFR-003, NFR-009 | BR-AUD-01–03, BR-VER-10 | `AuditService`, `@Version`, group ledger lock ([Transaction_Concurrency_Design](../design/Transaction_Concurrency_Design.md)) | 32, 38, 39 | AT-D19, UT-AUD-01, IT-TX-01–05, CON-01–12 |
| D20 | FR-038 | BR-EXP-04–06, BR-BAL-01 | `SplitAllocator`, `BalanceCalculator`, ledger postings ([Financial_Ledger_Design](../database/Financial_Ledger_Design.md)) | 22, 35 | AT-D20, UT-BAL-02, UT-APR-03, FIN-06, FIN-07 |
| D21 | FR-046, FR-049 | BR-BAL-04, BR-RPT-04 | `BalanceService`, `SettlementPlanner`, composite FKs ([Settlement_Algorithm](../design/Settlement_Algorithm.md)) | 35, 36, 40 | AT-D21, FIN-20, UT-RPT-08, IT-AUTHZ-02, IT-DB-11 |
| D22 | FR-037 | BR-CAT-01–04 | `CategoryService`, `ExpenseCategory` ([Group_Membership_Design §5](../design/Group_Membership_Design.md)) | 03, 09 | AT-D22, UT-CAT-01–06, IT-DB-13 |
| D23 | FR-016 | BR-PAY-02, BR-PAY-05 | `PaymentService.recordSettlement`, `SettlementPlan.obligation` ([Payment_Processing_Design](../design/Payment_Processing_Design.md)) | 04, 23, 37 | AT-D23, UT-PAY-01, FIN-17, SEC-19 |
| D24 | FR-047 | BR-PAY-02–04, BR-PAY-08 | `PaymentService` (lock + recompute + idempotency) ([Payment_Processing_Design](../design/Payment_Processing_Design.md), [Transaction_Concurrency_Design](../design/Transaction_Concurrency_Design.md)) | 23, 37, 38 | AT-D24, UT-PAY-03/04, FIN-11, FIN-15, FIN-19, CON-01–03, IT-MVC-06 |
| D25 | FR-008, FR-027 | BR-EXP-05, BR-VER-02 | `ExpenseAllocation` (immutable per version) ([Expense_Versioning_Design](../design/Expense_Versioning_Design.md)) | 09, 20 | AT-D25, UT-VER-01, CON-12 |
| D26 | FR-010 | BR-NOT-01/02/04 | `NotificationService.create*` ([Notification_Design](../design/Notification_Design.md)) | 41 | AT-D26, UT-NOT-01–06, IT-DB-15 |
| D27 | FR-009, FR-039 | BR-RCP-02/04, BR-VER-02 | `ReceiptService.storeForVersion`, `expense_version_receipts` ([Receipt_Storage_Design](../design/Receipt_Storage_Design.md)) | 20, 34 | AT-D27, UT-VER-07, UT-RCP-04, IT-DB-10 |
| D28 | FR-042 | BR-APR-05, BR-VER-06/11 | Expense state machine; `trg_expense_transitions` ([Domain_Model](../design/Domain_Model.md)) | 13, 31 | AT-D28, UT-APR-09, UT-VER-04, FIN-18, IT-DB-09 |
| D29 | FR-036 | BR-ARC-01–05, BR-INV-07 | `GroupService.archiveGroup`, `GroupArchivePolicy` ([Group_Archiving_Design](../design/Group_Archiving_Design.md)) | 15, 24, 39 | AT-D29, UT-GRP-08–12, CON-04, CON-05, IT-AUTHZ-05 |
| D30 | FR-029, FR-030 | BR-AUTH-04–07 | `AccountVerificationService`, `PasswordResetService`, `TokenService` ([Authentication_Design](../design/Authentication_Design.md)) | 17, 25, 26 | AT-D30, UT-AUTH-05–10, SEC-06–10 |
| D31 | FR-031 | BR-AUTH-09 | `EmailService`, `SesEmailService`, `MockEmailService` ([Authentication_Design §6](../design/Authentication_Design.md)) | 05, 25, 26 | AT-D31, IT-EMAIL-01/02, IT-TX-04 |
| D32 | NFR-010 | none | Flyway V1–V11 plan ([Flyway_Migration_Plan](../database/Flyway_Migration_Plan.md)) | 11, 12 | AT-D32, IT-DB-01, IT-DB-02 |
| D33 | NFR-007 | none | Test strategy ([Test_Strategy](../testing/Test_Strategy.md)) | none | AT-D33 (review), all suites |
| D34 | FR-014, FR-045 | BR-BAL-01–05, BR-SET-01–03 | `BalanceCalculator`, `SettlementPlanner` ([Settlement_Algorithm](../design/Settlement_Algorithm.md)) | 22, 35, 36 | AT-D34, UT-SET-01–10, UT-BAL-03, FIN-08, FIN-09 |
| D35 | FR-012 | BR-APR-01, BR-CAN-04 | `ApproverSetResolver`, `expense_approvals` ([Expense_Approval_Design](../design/Expense_Approval_Design.md)) | 02, 18, 29 | AT-D35, UT-APR-01–04, FIN-07 |
| D36 | FR-036 | BR-ARC-03/05 | `Group.archive`, `trg_group_archived_readonly` ([Group_Archiving_Design](../design/Group_Archiving_Design.md)) | 15, 24 | AT-D36, UT-GRP-12 |
| D37 | FR-033 | BR-INV-02–09 | `InvitationService`, `InvitationAcceptancePolicy`, token hashing ([Group_Invitation_Design](../design/Group_Invitation_Design.md)) | 16, 27, 28 | AT-D37, UT-INV-01–10, SEC-09, SEC-11–14, CON-11 |
| D38 | FR-004 | BR-EXP-01/04 | `ExpenseService.createExpense`, `AuthorizationService.requireActiveMemberOfActiveGroup` ([Expense_Approval_Design](../design/Expense_Approval_Design.md)) | 02, 18, 29 | AT-D38, FIN-07, IT-AUTHZ-05, UT-GRP-12 |
| D39 | FR-016 | BR-PAY-01 | `PaymentService` (debtor = actor), `ck_payment_recorder` ([Payment_Processing_Design](../design/Payment_Processing_Design.md)) | 04, 23, 37 | AT-D39, UT-PAY-02, SEC-18 |
| D40 | FR-017, FR-048 | BR-PAY-06/07 | Immutable `Payment`, triggers and grants, confirmation view ([Payment_Processing_Design](../design/Payment_Processing_Design.md), [Data_Integrity_Constraints](../database/Data_Integrity_Constraints.md)) | 04, 23, 37 | AT-D40, UT-PAY-06, IT-DB-08, IT-DB-14, IT-MVC-05, SEC-20 |
| D41 | FR-044 | BR-APR-08 | No scheduler for approvals ([Expense_Approval_Design §7](../design/Expense_Approval_Design.md)) | 13, 14 | AT-D41, UT-APR-13, UT-CAN-11 |

## 2. Requirement-level coverage (FR/NFR → tests)

| Requirement | Decisions | Tests |
| --- | --- | --- |
| FR-001, FR-002 | D11 | UT-AUTH-01–03, SEC-01–05 |
| FR-003 | D08 | UT-GRP-13, UT-INV-01 |
| FR-004 | D38, D18, D20, D22 | UT-MON-*, IT-MVC-03 |
| FR-005–FR-007 | D09 | UT-SPL-*, FIN-01–05 |
| FR-008 | D25 | UT-VER-01, CON-12 |
| FR-009 | D13, D27 | UT-RCP-*, IT-DB-10 |
| FR-010 | D04, D26 | UT-NOT-*, IT-DB-15 |
| FR-011–FR-013 | D02, D35 | UT-APR-*, CON-06 |
| FR-014, FR-015 | D34, D20 | UT-BAL-*, IT-DB-12 |
| FR-016, FR-017 | D23, D39, D03, D40 | UT-PAY-*, SEC-18/19 |
| FR-018–FR-021 | D05 | UT-RPT-*, IT-RPT-01 |
| FR-022 | D01, D06 | AT-D01 |
| FR-023 | D10, D19 | UT-VER-*, UT-AUD-01 |
| FR-024 | D11, D21 | IT-AUTHZ-*, SEC-21/22 |
| FR-025 | none | IT-MVC-01/03, UT-MON-03 |
| FR-026 | D19 | IT-TX-01–03 |
| FR-027 | D16, D25 | IT-AUTHZ-04, UT-GRP-* |
| FR-028 | D10, D28 | UT-RPT-05, IT-AUTHZ-04 |
| FR-029, FR-030 | D30 | UT-AUTH-05–12, SEC-06–10 |
| FR-031 | D31 | IT-EMAIL-01/02 |
| FR-032, FR-033 | D08, D37 | UT-INV-*, SEC-11–14 |
| FR-034 | D17 | UT-GRP-05–07 |
| FR-035 | D16 | UT-GRP-01–04 |
| FR-036 | D29, D36 | UT-GRP-08–12, CON-04/05 |
| FR-037 | D22 | UT-CAT-* |
| FR-038 | D20 | UT-BAL-02, FIN-06 |
| FR-039 | D10, D25, D27 | UT-VER-* |
| FR-040, FR-041 | D14 | UT-CAN-* |
| FR-042 | D28 | UT-APR-09, UT-VER-04 |
| FR-043 | D15 | UT-APR-05 |
| FR-044 | D41 | UT-APR-13, UT-CAN-11 |
| FR-045 | D34 | UT-SET-* |
| FR-046, FR-049 | D21 | FIN-20, UT-RPT-08 |
| FR-047 | D24 | UT-PAY-03/04, CON-01–03 |
| FR-048 | D40 | IT-MVC-05 |
| FR-050 | D19 | UT-AUD-01 |
| FR-051 | D18 | UT-MON-01, IT-DB-03 |
| NFR-001 … NFR-020 | see [Nonfunctional_Requirements](Nonfunctional_Requirements.md) (each row lists its verification) | none |

## 3. Design assumption traceability

| DA | Owner document | Tests |
| --- | --- | --- |
| DA-16 (obligation = plan transfer) | Payment_Processing_Design | UT-PAY-01–04, FIN-17 |
| DA-17 (no direct cancel after approval) | Expense_Cancellation_Design | UT-CAN-09 |
| DA-18 (rejected edit rejects expense) | Expense_Versioning_Design | UT-VER-11, FIN-18 |
| DA-19 (new request after rejection) | Expense_Cancellation_Design | UT-CAN-06/07 |
| DA-21/22 (inactive invariant) | Group_Membership_Design | UT-VER-10, UT-GRP-02–04, CON-12 |
| DA-23 (no invitation email) | Group_Invitation_Design | IT-EMAIL-01 (no other emails) |
| DA-24 (receipt limits) | Receipt_Storage_Design | UT-RCP-03/04 |
| DA-28 (payment status filter) | Reporting_Design | UT-RPT-04 |
| DA-31 (inactive read access) | Security_Architecture | IT-AUTHZ-04 |
| DA-41 (reset verifies email) | Authentication_Design | UT-AUTH-12 |
