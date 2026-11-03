# Group Archiving Design

| Decisions | D29, D36, D37 |
| --- | --- |
| Requirements | FR-036 |
| Rules | BR-ARC-01–05, BR-INV-07 |
| UML | [15_Group_State_Machine](../uml/15_Group_State_Machine.puml), [24_Activity_Archive_Group](../uml/24_Activity_Archive_Group.puml), [39_Sequence_Archive_Group](../uml/39_Sequence_Archive_Group.puml) |
| Tests | UT-GRP-08–12, CON-04, CON-05, SEC-20, AT-D29, AT-D36 |

## 1. Interface

```
GroupService
  ArchiveEligibility checkArchiveEligibility(long actor, long groupId)   // TX(RO); for the confirmation page
  void archiveGroup(long actor, long groupId, long expectedGroupVersion) // TX(RW, lock=group)
ArchiveEligibility(boolean eligible, List<String> reasons, List<MemberBalanceView> nonZeroBalances,
                   long pendingExpenseCount, long openCancellationCount)
```

## 2. Preconditions (BR-ARC-02)

| Check | Source | Blocking reason |
| --- | --- | --- |
| The actor is the owner | `expense_groups.owner_user_id` | 403 |
| The group is `ACTIVE` | status | `ALREADY_ARCHIVED` |
| Every member's net = 0.00 (including inactive members, which are 0 by LI-5) | `BalanceCalculator` over the postings | `BALANCES_NOT_SETTLED` (with the list) |
| No expense in `PENDING_APPROVAL` | `expenses` | `UNRESOLVED_EXPENSE_APPROVALS` |
| No `OPEN` cancellation request | `expense_cancellation_requests` | `UNRESOLVED_CANCELLATION_APPROVALS` |
| `expectedGroupVersion` matches | `@Version` | 409 |

## 3. Algorithm (atomic, §6.6)

**TX(RW, lock = group)**

1. `group = groupRepository.lockById(groupId)` (`SELECT … FOR UPDATE`). From here on, no expense creation, edit, approval finalization, cancellation, payment, invitation acceptance, or membership change can commit for this group, because all of them take the same lock first.
2. `authz.requireOwner`; check the version.
3. Compute the nets, the pending count, and the open-cancellation count inside this transaction.
4. `GroupArchivePolicy.evaluate(...)` → if not eligible, throw `BusinessRuleViolation` with the reasons (the transaction rolls back; nothing changed).
5. Revoke all `PENDING` invitations (`GROUP_ARCHIVED`). Audit `INVITATION_REVOKED` per invitation.
6. `group.archive(actor, eligibility, now)` → `ARCHIVED`, `archived_at`, `archived_by`.
7. Audit `GROUP_ARCHIVED` (details: member count, expense count, payment count).

**Post**: the group is permanently read-only (D36). Trigger `trg_group_archived_readonly` rejects further changes at the DB level.

## 4. Read-only behavior

| Capability | Archived group |
| --- | --- |
| View group, members, expenses, versions, receipts, payments, balances (all 0), reports, audit trail | ✓ (members by DA-31) |
| Create, edit, cancel expenses; decide approvals | ✗ (none can exist: no pending items at archive time) |
| Payments | ✗ (all balances 0; `GroupArchivedException` anyway) |
| Invitations (issue, accept), categories, ownership transfer, leave/remove | ✗ |
| Unarchive / reopen / delete | ✗ (D36, BR-ARC-05). Members must create a new group. |

## 5. Concurrency cases

| Race | Outcome |
| --- | --- |
| Archive vs. expense creation (CON-04) | Whichever acquires the group lock first wins. If creation commits first, archive sees `PENDING_APPROVAL` and refuses. If archive commits first, creation re-checks `group.status` after acquiring the lock and gets `GroupArchivedException`. |
| Archive vs. payment (CON-05) | If the payment commits first, archive re-computes the nets (now possibly 0) and may succeed. If archive commits first, the payment fails with `GroupArchivedException`. (The nets were 0, so no obligation could exist.) |
| Two archive clicks | The second sees `ALREADY_ARCHIVED` (409, informational) |
