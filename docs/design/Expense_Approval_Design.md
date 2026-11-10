# Expense Approval Design (creation, approval, rejection, auto-approval)

| Decisions | D02, D15, D20, D25, D26, D28, D35, D38, D41 |
| --- | --- |
| Requirements | FR-004–FR-013, FR-038, FR-042–FR-044, FR-050 |
| Rules | BR-EXP-*, BR-SPL-*, BR-APR-*, BR-NOT-01/02 |
| Assumptions | DA-01, DA-27, DA-35, DA-38 |
| UML | [02](../uml/02_Use_Case_Expense_Management.puml), [13](../uml/13_Expense_State_Machine.puml), [18](../uml/18_Activity_Create_Expense.puml), [19](../uml/19_Activity_Approve_Expense.puml), [29](../uml/29_Sequence_Create_Expense.puml), [30](../uml/30_Sequence_Approve_Expense.puml), [31](../uml/31_Sequence_Reject_Expense.puml), [41](../uml/41_Sequence_Approval_Notification.puml) |
| Tests | UT-APR-01–13, UT-SPL-*, UT-NOT-01–04, IT-MVC-03/04, CON-06/07, AT-D02, AT-D15, AT-D35, AT-D38, AT-D41 |

## 1. Responsibilities

| Component | Responsibility |
| --- | --- |
| `ExpenseController` (web) | Render the expense form (active members as payer/participant options, active visible categories); bind `ExpenseForm` (+ multipart receipts); build `CreateExpenseCommand`; show field errors and keep the input |
| `ExpenseService` (application) | Authorize; lock the group; validate; allocate; resolve approvers; persist version 1; auto-approve or create notifications; audit |
| `ExpenseApprovalService` (application) | Authorize the approver; lock the group; record the decision; finalize approval or rejection; audit |
| `Expense`, `ExpenseVersion`, `ExpenseApproval` (domain) | State machine and invariants |
| `SplitAllocator`, `ApproverSetResolver` (domain) | Pure calculations |
| `NotificationService` (application) | One notification per required approver |

## 2. Interfaces (design signatures)

```
ExpenseService
  ExpenseSubmissionResult createExpense(long actor, CreateExpenseCommand cmd)

CreateExpenseCommand(long groupId, String amount, LocalDate expenseDate, String description,
                     long categoryId, long payerUserId, SplitMethod splitMethod,
                     SortedSet<Long> participantIds, SortedMap<Long, String> percentages /* PERCENTAGE only */,
                     List<ReceiptUpload> receipts)
ReceiptUpload(String originalFilename, String declaredContentType, byte[] bytes)
ExpenseSubmissionResult(long expenseId, int versionNumber, ExpenseStatus status, boolean autoApproved,
                        List<Long> requiredApproverIds, List<AllocationView> allocations)

ExpenseApprovalService
  ApprovalOutcome approve(long actor, long expenseId, long expenseVersionId, String optionalComment)
  ApprovalOutcome reject (long actor, long expenseId, long expenseVersionId, String reason)
  List<PendingApprovalView> listMyPendingApprovals(long actor)      // TX(RO)
ApprovalOutcome(long expenseId, long versionId, ApprovalDecision recorded,
                ExpenseStatus expenseStatusAfter, int remainingApprovals)
```

## 3. Create expense: algorithm and contract

**Pre**: actor authenticated. **TX(RW, lock = group)**.

1. `access = authz.requireActiveMemberOfActiveGroup(actor, groupId)` (D38). This is checked **after** acquiring the group lock, so a concurrent archive cannot slip in between (§6.6).
2. Parse and validate (all field errors are collected, then thrown together as `ValidationException`):
   - `amount` → `ExpenseAmount.parse` (BR-EXP-03).
   - `expenseDate ≤ today` (DA-33).
   - `description` 1–200 chars.
   - Category selectable for the group (BR-CAT-04).
   - Payer is an `ACTIVE` member (BR-EXP-04).
   - Participants are a non-empty set of `ACTIVE` members (BR-EXP-05).
   - For `PERCENTAGE`, each percentage parses with ≤ 2 dp, is > 0, and the sum is exactly 100.00 (BR-SPL-03). For `EQUAL`, percentages must be absent.
   - Receipts: ≤ 10, each validated by `ReceiptService.validate` (BR-RCP-01/02).
3. `alloc = SplitAllocator.allocate…(amount, participants)`. Σ = amount is asserted.
4. `approvers = ApproverSetResolver.resolve(creator = actor, payer, participants)`. Example: Alice creates, Bob pays, Carol and David share → {Bob: PAYER, Carol: PARTICIPANT, David: PARTICIPANT}.
5. `expense = Expense.submit(...)`. This persists `expenses`, `expense_versions` (v1 `PENDING`), `expense_allocations`, `expense_approvals` (one awaiting row per approver), and receipts with their links.
6. If `approvers.isEmpty()` (the creator is the only financially involved person: payer = creator and participants = {creator}), the version and expense become `APPROVED` immediately with `auto_approved = true`. Audit `EXPENSE_AUTO_APPROVED` (D15). **No notification.**
7. Otherwise, `notificationService.createApprovalRequests(version, EXPENSE_APPROVAL_REQUESTED)` creates one notification per approver (D26).
8. Audit `EXPENSE_CREATED` (details: amount, payer, participants with shares, approver IDs, receipt count).

**Post**: the expense is `PENDING_APPROVAL` (no ledger effect) or `APPROVED` (auto). The return is an `ExpenseSubmissionResult`.

**Failure handling**: any validation error rolls back everything, including the receipt rows. The form re-renders with the entered values (receipt file inputs must be re-selected; that limitation is noted in the UI). A lock timeout (5 s) produces `ConcurrentModificationException` → "Please retry" page.

## 4. Approve / reject: algorithm and contract

**TX(RW, lock = group)** (approval finalization changes the ledger).

1. Load the expense. `authz.requireActiveMemberOfActiveGroup(actor, expense.groupId)`.
2. Verify that `expenseVersionId == expense.currentVersion.id` and the version is `PENDING`. Otherwise `ConcurrentModificationException("VERSION_NOT_CURRENT")` (BR-APR-07). This covers a decision that races an edit or a cancellation.
3. `authz.requireRequiredApprover(actor, version)`. The creator is never in the set (BR-APR-03). Ownership gives no override (D17).
4. If the approver's row already has a decision → `BusinessRuleViolation("ALREADY_DECIDED")` (BR-APR-04).
5. **Approve**: `expense.recordApproval(actor, comment, now)`. Audit `EXPENSE_APPROVAL_RECORDED`. If no awaiting rows remain: version `APPROVED` (`approved_at = now`), expense `APPROVED`, `effective_version_id = version.id`, `ever_approved = true`. Audit `EXPENSE_APPROVED`.
6. **Reject**: the reason is required (1–500, DA-27). `expense.recordRejection(actor, reason, now)` sets version `REJECTED` and expense `REJECTED` immediately (D02). Other awaiting rows stay undecided (moot). Audit `EXPENSE_REJECTED` (with the reason). No further action is possible (D28).
7. The `@Version` on `expense_approvals` and `expenses` detects double submission of the same decision form (the second request sees `ALREADY_DECIDED`).

**Post (approve, last)**: balances now include the version (FR-011). **Post (reject)**: no ledger effect, ever.

## 5. State transitions (approval subset)

| From (expense / version) | Event | Guard | To |
| --- | --- | --- | --- |
| none | submit | approvers ≠ ∅ | `PENDING_APPROVAL` / `PENDING` |
| none | submit | approvers = ∅ | `APPROVED` / `APPROVED` (auto) |
| `PENDING_APPROVAL` / `PENDING` | approve | remaining awaiting > 1 | unchanged (decision recorded) |
| `PENDING_APPROVAL` / `PENDING` | approve | last awaiting | `APPROVED` / `APPROVED` |
| `PENDING_APPROVAL` / `PENDING` | reject | reason present | `REJECTED` / `REJECTED` (final) |

Editing and cancellation transitions are in the versioning and cancellation designs.

## 6. Authorization summary

| Action | Who |
| --- | --- |
| Create | Any `ACTIVE` member of an `ACTIVE` group (D38) |
| Approve / reject | A member of the frozen approver set of the current `PENDING` version, still `ACTIVE`; never the creator |
| View pending approvals | Self only (`listMyPendingApprovals`) |

## 7. No deadline (D41)

There are no scheduled jobs, reminders, escalation, or expiry for approvals (DA-01). A version stays `PENDING` until all approve, one rejects, the creator edits it (superseding it), or the creator cancels a never-approved expense.

## 8. Audit events

`EXPENSE_CREATED`, `EXPENSE_AUTO_APPROVED`, `EXPENSE_APPROVAL_RECORDED` (details: approver, version, comment), `EXPENSE_APPROVED`, `EXPENSE_REJECTED` (details: approver, reason).
