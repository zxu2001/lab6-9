# SplitSmart Application Service Contracts (v2, 2026-11-03)

These are **internal application-layer contracts** of the Layered + MVC architecture ([ADR-001](../../../architecture/ADR-001-Architecture-Selection.md)). Spring MVC controllers (presentation) call them. They use domain objects and repository interfaces, and the infrastructure implements the integration interfaces. They are **design signatures, not Java code**.

Conventions ([Detailed_Design §2](../../../docs/design/Detailed_Design.md#2-design-conventions-used-by-every-detailed-design-document)):

- `actor` = the authenticated `users.id`.
- **TX(RW, lock = group)** means a read-write transaction that first acquires the group ledger lock.
- Every method throws `ValidationException`, `BusinessRuleViolationException`, `NotFoundException` (404), `ForbiddenException` (403), `ConcurrentModificationException` (409), or `GroupArchivedException` (409) as applicable.
- Every method returns DTOs (never entities).

Class diagram: [10_Application_Service_Class_Diagram](../../../docs/uml/10_Application_Service_Class_Diagram.puml).

## Dependency rules for contracts

- Controllers depend only on these interfaces, plus command and result records and domain value objects/enums.
- Implementations depend on domain entities, policies, and calculators, on `domain.repository.*` interfaces, and on the `application.integration.*` interfaces (`EmailService`, `TokenService`, `ReceiptContentInspector`). They never depend on infrastructure classes.
- Infrastructure implements the repository and integration interfaces.

---

## 1. Authentication: `AccountService`, `AccountVerificationService`, `PasswordResetService`

| Method | TX | Authorization | Pre → Post | Req |
| --- | --- | --- | --- | --- |
| `RegistrationResult register(RegisterAccountCommand cmd, ClientInfo client)` | RW | Anonymous | Unique email, valid password → user `PENDING_VERIFICATION`, token created, email after commit | FR-001, FR-029 |
| `void resendVerification(String email, ClientInfo client)` | RW | Anonymous; rate-limited | Always generic. A new token only for a `PENDING_VERIFICATION` account. | FR-029 |
| `AccountView getMyAccount(long actor)` | RO | Self | n/a | FR-002 |
| `VerificationResult verifyEmail(String rawToken)` | RW | Token holder | Valid token → `ACTIVE`, token used | FR-029 |
| `void requestReset(String email, ClientInfo client)` | RW | Anonymous; rate-limited | Always generic. Token + email only if the account exists. | FR-030 |
| `ResetTokenState checkToken(String rawToken)` | RO | Token holder | n/a | FR-030 |
| `void resetPassword(String rawToken, String newPassword, String confirm)` | RW | Token holder | Password changed, tokens invalidated, sessions expired | FR-030 |

Spring Security integration (infrastructure): `SplitSmartUserDetailsService.loadUserByUsername(String email)`, `LoginAttemptService.onFailure(String email, Instant)` / `onSuccess(long userId)`. Design: [Authentication_Design](../../../docs/design/Authentication_Design.md).

## 2. Group management: `GroupService`, `MembershipService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `long createGroup(long actor, CreateGroupCommand cmd)` | RW | Verified user | FR-003 |
| `GroupDetails getGroup(long actor, long groupId)` | RO | Read access (DA-31) | FR-024 |
| `List<GroupSummary> listMyGroups(long actor)` | RO | Self | FR-002 |
| `void transferOwnership(long actor, long groupId, long newOwnerUserId, long expectedGroupVersion)` | RW, lock | Owner; target `ACTIVE` member; group `ACTIVE` | FR-034 |
| `ArchiveEligibility checkArchiveEligibility(long actor, long groupId)` | RO | Owner | FR-036 |
| `void archiveGroup(long actor, long groupId, long expectedGroupVersion)` | RW, lock | Owner; eligible | FR-036 |
| `DeactivationEligibility checkDeactivation(long actor, long groupId, long memberUserId)` | RO | Self or owner | FR-035 |
| `void leaveGroup(long actor, long groupId)` | RW, lock | `ACTIVE` non-owner member; eligible | FR-035 |
| `void removeMember(long actor, long groupId, long memberUserId)` | RW, lock | Owner; target eligible | FR-035 |
| `List<MemberView> listMembers(long actor, long groupId)` | RO | Read access | FR-003 |

Design: [Group_Membership_Design](../../../docs/design/Group_Membership_Design.md), [Group_Archiving_Design](../../../docs/design/Group_Archiving_Design.md).

## 3. Group invitations: `InvitationService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `IssuedInvitation issueInvitation(long actor, long groupId, String email)` | RW, lock | Owner, group `ACTIVE` | FR-032, FR-033 |
| `void revokeInvitation(long actor, long groupId, long invitationId, long expectedVersion)` | RW | Owner | FR-033 |
| `InvitationPreview previewByToken(String rawToken, Long actorOrNull)` | RW (lazy expiry) | Anyone with the link; generic states | FR-033 |
| `long acceptByToken(long actor, String rawToken)` | RW, lock | Verified account with a matching email | FR-032, FR-033 |
| `long acceptById(long actor, long invitationId)` | RW, lock | Verified account with a matching email | FR-032 |
| `List<PendingInvitationView> listInvitationsForMe(long actor)` | RO | Self (by verified email) | FR-032 |
| `List<InvitationView> listGroupInvitations(long actor, long groupId)` | RO | Owner | FR-033 |

Design: [Group_Invitation_Design](../../../docs/design/Group_Invitation_Design.md).

## 4. Category management: `CategoryService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `List<CategoryView> listSelectable(long actor, long groupId)` | RO | Active member | FR-037 |
| `List<CategoryView> listAll(long actor, long groupId)` | RO | Read access | FR-037 |
| `long createCategory(long actor, long groupId, String name)` | RW | Owner, group `ACTIVE` | FR-037 |
| `void renameCategory(long actor, long groupId, long categoryId, String newName, long expectedVersion)` | RW | Owner; custom only | FR-037 |
| `void deactivateCategory(long actor, long groupId, long categoryId, long expectedVersion)` | RW | Owner; custom only | FR-037 |

## 5. Expense management: `ExpenseService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `ExpenseSubmissionResult createExpense(long actor, CreateExpenseCommand cmd)` | RW, lock | `ACTIVE` member of an `ACTIVE` group | FR-004–FR-009, FR-012, FR-038, FR-043 |
| `ExpenseSubmissionResult editExpense(long actor, long expenseId, EditExpenseCommand cmd)` | RW, lock | Creator; BR-VER rules | FR-039 |
| `ExpenseDetails getExpense(long actor, long groupId, long expenseId)` | RO | Expense read access | FR-028 |
| `Page<ExpenseSummary> listExpenses(long actor, long groupId, ExpenseListFilter filter, PageRequest page)` | RO | Read access | FR-028 |

Design: [Expense_Approval_Design](../../../docs/design/Expense_Approval_Design.md), [Expense_Versioning_Design](../../../docs/design/Expense_Versioning_Design.md).

## 6. Expense approvals: `ExpenseApprovalService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `ApprovalOutcome approve(long actor, long expenseId, long expenseVersionId, String optionalComment)` | RW, lock | In the frozen approver set of the current `PENDING` version; not the creator | FR-011, FR-013 |
| `ApprovalOutcome reject(long actor, long expenseId, long expenseVersionId, String reason)` | RW, lock | Same; reason required | FR-013, FR-042 |
| `List<PendingApprovalView> listMyPendingApprovals(long actor)` | RO | Self | FR-028 |

## 7. Expense cancellation: `ExpenseCancellationService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `CancellationOutcome cancelPendingExpense(long actor, long expenseId, int basedOnVersionNumber)` | RW, lock | Creator; never approved | FR-040 |
| `CancellationRequestView requestCancellation(long actor, long expenseId, String optionalReason)` | RW, lock | Creator; expense `APPROVED` | FR-041 |
| `CancellationOutcome approveCancellation(long actor, long cancellationRequestId)` | RW, lock | Frozen cancellation approver | FR-041 |
| `CancellationOutcome rejectCancellation(long actor, long cancellationRequestId, String reason)` | RW, lock | Frozen cancellation approver | FR-041 |
| `List<CancellationRequestView> listRequests(long actor, long expenseId)` | RO | Expense read access | FR-023 |

Design: [Expense_Cancellation_Design](../../../docs/design/Expense_Cancellation_Design.md).

## 8. Expense version history: `ExpenseVersionHistoryService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `List<ExpenseVersionView> getVersionHistory(long actor, long expenseId)` | RO | Expense read access | FR-023, FR-028 |
| `ExpenseVersionView getVersion(long actor, long expenseId, int versionNumber)` | RO | Expense read access | FR-023 |

## 9. Receipt management: `ReceiptService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `ValidatedReceipt validate(ReceiptUpload upload)` | none (pure) | n/a | FR-009 |
| `List<Long> storeForVersion(Expense e, ExpenseVersion v, List<ValidatedReceipt> newOnes, List<Long> retainedIds, long actor, Instant now)` | Joins the caller's TX | Called only by `ExpenseService` | FR-009, FR-039 |
| `ReceiptDownload download(long actor, long groupId, long receiptId)` | RO | Expense read access | FR-009 |
| `List<ReceiptMetadataView> listForVersion(long actor, long expenseId, int versionNumber)` | RO | Expense read access | FR-009 |

Design: [Receipt_Storage_Design](../../../docs/design/Receipt_Storage_Design.md).

## 10. Balance calculation: `BalanceService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `GroupBalanceView getGroupBalances(long actor, long groupId)` | RO | Read access (inactive: own only) | FR-014, FR-015, FR-046 |
| `MemberBalanceView getMyBalance(long actor, long groupId)` | RO | Read access | FR-014 |
| `CrossGroupOverview getOverview(long actor)` | RO | Self | FR-049 |

Internal (no authorization; used under lock by other services): `NetBalances computeNetBalances(long groupId)`.

## 11. Settlement calculation: `SettlementService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `SettlementPlanView getSettlementPlan(long actor, long groupId)` | RO | Read access | FR-045 |
| internal `SettlementPlan computePlan(long groupId)` | Joins the caller's TX | n/a | FR-045 |

Design: [Settlement_Algorithm](../../../docs/design/Settlement_Algorithm.md).

## 12. Payment recording: `PaymentService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `PaymentPreparation preparePayment(long actor, long groupId, long creditorUserId)` | RO | Debtor with obligation > 0 | FR-016, FR-048 |
| `PaymentOutcome recordSettlement(long actor, RecordSettlementCommand cmd)` | RW, lock | Debtor of the **recomputed** transfer | FR-016, FR-017, FR-047 |
| `List<PaymentView> listPayments(long actor, long groupId, PaymentFilter filter)` | RO | Read access | FR-017, FR-020 |

There are no update, delete, cancel, or reverse methods (D40). Design: [Payment_Processing_Design](../../../docs/design/Payment_Processing_Design.md).

## 13. Notifications: `NotificationService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| internal `void createApprovalRequests(ExpenseVersion v, NotificationType type)` | Joins the caller's TX | n/a | FR-010 |
| internal `void createCancellationApprovalRequests(ExpenseCancellationRequest r)` | Joins the caller's TX | n/a | FR-010 |
| `Page<NotificationView> listMyNotifications(long actor, boolean unreadOnly, PageRequest page)` | RO | Self | FR-010 |
| `long countUnread(long actor)` | RO | Self | FR-010 |
| `void markRead(long actor, long notificationId)` / `void markAllRead(long actor)` | RW | Recipient | FR-010 |
| `String open(long actor, long notificationId)` | RW | Recipient | FR-010 |

Design: [Notification_Design](../../../docs/design/Notification_Design.md).

## 14. Reporting: `ReportService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `ReportResult generateReport(long actor, ReportCriteria criteria)` | RO | Read access (+ involvement filter) | FR-018–FR-021 |
| `CrossGroupOverview getOverview(long actor)` | RO | Self | FR-049 |

Design: [Reporting_Design](../../../docs/design/Reporting_Design.md).

## 15. Email delivery: `EmailService` (integration interface; implemented by `SesEmailService` and `MockEmailService`)

| Method | Called from | Req |
| --- | --- | --- |
| `void sendVerificationEmail(EmailAddress to, String displayName, URI link, Instant expiresAt)` | After-commit listener only | FR-031 |
| `void sendPasswordResetEmail(EmailAddress to, String displayName, URI link, Instant expiresAt)` | After-commit listener only | FR-031 |

No other methods exist, by design (D31).

## 16. Audit logging: `AuditService`

| Method | TX | Authorization | Req |
| --- | --- | --- | --- |
| `void record(AuditEventType type, Long actor, Long groupId, String entityType, long entityId, Map<String,Object> details)` | Joins the caller's TX (`Propagation.MANDATORY`) | Internal | FR-050 |
| `List<AuditEventView> getExpenseAudit(long actor, long expenseId)` | RO | Expense read access | FR-023, FR-050 |
| `Page<AuditEventView> getGroupAudit(long actor, long groupId, PageRequest page)` | RO | Read access (inactive: involved entities only) | FR-050 |

`Propagation.MANDATORY` guarantees that audit rows are written only inside a business transaction (atomic with the change).

## 17. Authorization: `AuthorizationService` (internal)

`requireReadAccess`, `requireActiveMemberOfActiveGroup`, `requireOwner`, `requireExpenseReadAccess`, `requireCreator`, `requireRequiredApprover`, `requireDebtor`. Semantics: [Security_Architecture §3](../../../docs/architecture/Security_Architecture.md#3-authorization-model).

## 18. Integration interfaces (application.integration)

| Interface | Methods | Implementation |
| --- | --- | --- |
| `TokenService` | `GeneratedToken generate()`, `String sha256Hex(String raw)` | `infrastructure.token.SecureTokenService` |
| `ReceiptContentInspector` | `DetectedType detect(byte[])`, `boolean imageDecodes(byte[])` | `infrastructure.receipt.MagicByteReceiptInspector` |
| `EmailService` | see §15 | `infrastructure.email.SesEmailService`, `MockEmailService` |

## 19. Repository interfaces (domain.repository; implemented in infrastructure.persistence)

`UserAccountRepository`, `VerificationTokenRepository`, `PasswordResetTokenRepository`, `GroupRepository` (incl. `Group lockById(long)`), `MembershipRepository`, `InvitationRepository` (incl. `findByTokenHash`), `CategoryRepository`, `ExpenseRepository`, `ExpenseVersionRepository`, `CancellationRequestRepository`, `ReceiptRepository` (incl. `ReceiptContent loadContent(long)`), `PaymentRepository` (insert + queries only; **no update or delete methods**), `NotificationRepository`, `AuditEventRepository` (insert + queries only), `LedgerQueryRepository` (`List<LedgerPosting> findPostings(long groupId)`, `ResponsibilitySummary responsibilitiesOf(long groupId, long userId)`, `long countPendingExpenses(long groupId)`, `long countOpenCancellations(long groupId)`), `ReportQueryRepository`.
