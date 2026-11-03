# Expense Versioning Design (editing)

| Decisions | D10, D25, D27, D28, D19 |
| --- | --- |
| Requirements | FR-023, FR-028, FR-039, FR-042 |
| Rules | BR-VER-01–11, BR-RCP-04 |
| Assumptions | DA-18, DA-21, DA-32, DA-39 |
| UML | [13](../uml/13_Expense_State_Machine.puml), [20_Activity_Edit_Expense](../uml/20_Activity_Edit_Expense.puml), [32_Sequence_Edit_Approved_Expense](../uml/32_Sequence_Edit_Approved_Expense.puml) |
| Tests | UT-VER-01–11, IT-DB-07, IT-DB-09, CON-07, CON-09, FIN-12, AT-D10, AT-D25, AT-D27, AT-D28 |

## 1. Model

- `expenses` is the stable identity (expense ID never changes). It holds `status`, `current_version_id`, `effective_version_id`, and `ever_approved`.
- `expense_versions` rows are **immutable snapshots**: amount, date, description, category, payer, split method, `expense_allocations` (participants and shares, frozen per D25), `expense_version_receipts` (receipt set, D27), and `expense_approvals` (frozen approver set and decisions).
- Exactly one version is current. At most one version is live (`PENDING` or `APPROVED`): partial unique index `ux_version_one_live`. At most one is effective: the single pointer `effective_version_id`, non-null iff the expense is `APPROVED`.

## 2. Interface

```
ExpenseService
  ExpenseSubmissionResult editExpense(long actor, long expenseId, EditExpenseCommand cmd)
EditExpenseCommand(int basedOnVersionNumber, String amount, LocalDate expenseDate, String description,
                   long categoryId, long payerUserId, SplitMethod splitMethod,
                   SortedSet<Long> participantIds, SortedMap<Long,String> percentages,
                   List<Long> retainedReceiptIds, List<ReceiptUpload> newReceipts, String changeSummary)

ExpenseVersionHistoryService                                    // TX(RO)
  List<ExpenseVersionView> getVersionHistory(long actor, long expenseId)
  ExpenseVersionView getVersion(long actor, long expenseId, int versionNumber)
ExpenseVersionView(int versionNumber, ExpenseVersionStatus status, Money amount, LocalDate date, String description,
                   String categoryName, UserRef payer, SplitMethod method, List<AllocationView> allocations,
                   List<ApprovalView> approvals, List<ReceiptMetadataView> receipts, Instant createdAt,
                   Instant approvedAt, Instant supersededAt, boolean autoApproved, String changeSummary)
```

## 3. Edit algorithm

**TX(RW, lock = group)**. Editing an approved expense changes the ledger.

1. Load the expense. `authz.requireActiveMemberOfActiveGroup(actor, groupId)`; `authz.requireCreator(actor, expense)` (BR-VER-01).
2. `ExpenseEditPolicy.check`:
   - Status ∈ {`PENDING_APPROVAL`, `APPROVED`}. `REJECTED` → `REJECTED_IS_FINAL` (D28). `CANCELLED` → `CANCELLED_IS_FINAL`.
   - `basedOnVersionNumber == current.versionNumber`, otherwise `ConcurrentModificationException("STALE_VERSION")` (BR-VER-10).
   - No `OPEN` cancellation request (BR-VER-09, DA-39).
   - If `APPROVED`: no `INACTIVE` member among payer ∪ participants of the effective version (BR-VER-08, DA-21).
3. Validate the new content exactly as for creation (participants and payer `ACTIVE` now, D25). Retained receipt IDs must belong to the current version of this expense. New uploads are validated. Total ≤ 10.
4. Build the new draft. If it equals the current version's content (fields, allocations, percentages, payer, receipt set), throw `NO_CHANGES` (DA-32).
5. Allocate and resolve approvers again (new frozen set from the **new** participants and payer, D35).
6. `expense.edit(...)`:
   - Old current version: `PENDING → SUPERSEDED` or `APPROVED → SUPERSEDED` (`superseded_at = now`). Its approvals stay as history (moot).
   - New version n+1 is `PENDING`, with allocations, the approver set, and receipt links (retained receipts re-linked by reference, new receipts inserted).
   - If the expense was `APPROVED`: `effective_version_id = NULL` and status `PENDING_APPROVAL` **in this transaction**. The expense stops affecting balances immediately (D10).
   - `current_version_id = new`.
7. If the new approver set is empty, auto-approve the new version (D15), restoring `effective_version_id = new`. Otherwise create `EXPENSE_REAPPROVAL_REQUESTED` notifications for every approver of the new version (D26).
8. Audit `EXPENSE_VERSION_CREATED` (details: from → to version numbers, changed fields, previous status, whether the ledger effect was suspended).

**Post**: exactly one live version; at most one effective version; old versions retrievable through the history service.

## 4. Audit visibility of the previous approved version (§6.2)

The superseded version keeps its full content, `approved_at`, approval decisions, and receipt links, and is shown in the version history with status `SUPERSEDED`. It no longer contributes because the ledger view joins **only** through `expenses.effective_version_id` (schema §2.10). DB checks `ck_expense_effective` and `ck_expense_eff_is_current` and the index `ux_version_one_live` make simultaneous contribution impossible.

## 5. Rejection of an edited version (DA-18, Q-01)

If any approver rejects version n+1, D02 and D28 apply literally: the version and the **expense** become `REJECTED`. The earlier approved version stays in history but never becomes effective again. The creator can create a new expense to retry. This consequence is flagged for customer confirmation (Q-01) and covered by UT-VER-11 and FIN-18.

## 6. Receipts and versions (D27)

- Adding, removing, or replacing receipts is an edit (step 3), producing a new version and restarting approval.
- Receipt rows are never deleted. Older versions keep their links (`expense_version_receipts`), so the historical receipt set of each version is reproducible.
- An unchanged receipt is not copied. The new version references the same `receipts.id`.

## 7. Transitions (editing subset)

| Expense before | Version before | Edit guard | Expense after | Old version | New version |
| --- | --- | --- | --- | --- | --- |
| `PENDING_APPROVAL` | `PENDING` | creator, current, no changes conflict | `PENDING_APPROVAL` | `SUPERSEDED` | `PENDING` (or `APPROVED` if auto) |
| `APPROVED` | `APPROVED` | creator, no open cancellation, no inactive involved | `PENDING_APPROVAL` (effective cleared) | `SUPERSEDED` | `PENDING` (or `APPROVED` if auto) |
| `REJECTED` / `CANCELLED` | any | n/a | refused | none | none |

## 8. Failure handling

| Failure | Result |
| --- | --- |
| Stale `basedOnVersionNumber` / `@Version` conflict | 409 page: "This expense changed. Reload to see the latest version." No changes. |
| Validation | Form re-rendered with field errors |
| Approval decision on the old version that races the edit | The approval service sees `VERSION_NOT_CURRENT` (it waits for the lock, then re-reads) |
| Lock timeout | Retry page |
