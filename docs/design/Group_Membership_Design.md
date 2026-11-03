# Group and Membership Design (creation, ownership, leaving, removal, categories)

| Decisions | D08, D16, D17, D22, D25, D38 |
| --- | --- |
| Requirements | FR-003, FR-024, FR-027, FR-034, FR-035, FR-037 |
| Rules | BR-GRP-01–10, BR-CAT-01–04 |
| Assumptions | DA-21, DA-22, DA-31, DA-34, DA-36 |
| UML | [03_Use_Case_Group_Management](../uml/03_Use_Case_Group_Management.puml), [15_Group_State_Machine](../uml/15_Group_State_Machine.puml) |
| Tests | UT-GRP-01–07, UT-GRP-13, UT-CAT-01–06, CON-10, CON-12, AT-D08, AT-D16, AT-D17, AT-D22 |

## 1. Interfaces

```
GroupService
  long createGroup(long actor, CreateGroupCommand cmd)                     // TX(RW)
  GroupDetails getGroup(long actor, long groupId)                          // TX(RO)
  List<GroupSummary> listMyGroups(long actor)                              // TX(RO)
  void transferOwnership(long actor, long groupId, long newOwnerUserId, long expectedGroupVersion)  // TX(RW, lock=group)
  ArchiveEligibility checkArchiveEligibility(long actor, long groupId)     // TX(RO)
  void archiveGroup(long actor, long groupId, long expectedGroupVersion)   // see Group_Archiving_Design

MembershipService
  DeactivationEligibility checkDeactivation(long actor, long groupId, long memberUserId)   // TX(RO)
  void leaveGroup(long actor, long groupId)                                // TX(RW, lock=group)
  void removeMember(long actor, long groupId, long memberUserId)           // TX(RW, lock=group)
  List<MemberView> listMembers(long actor, long groupId)                   // TX(RO)

CategoryService
  List<CategoryView> listSelectable(long actor, long groupId)              // TX(RO): active predefined + active custom
  List<CategoryView> listAll(long actor, long groupId)                     // TX(RO): includes inactive
  long createCategory(long actor, long groupId, String name)               // TX(RW)
  void renameCategory(long actor, long groupId, long categoryId, String newName, long expectedVersion) // TX(RW)
  void deactivateCategory(long actor, long groupId, long categoryId, long expectedVersion)           // TX(RW)

CreateGroupCommand(String name, String description)
DeactivationEligibility(boolean eligible, List<String> blockingReasons)    // e.g. NET_BALANCE_NOT_ZERO, PENDING_APPROVAL_RESPONSIBILITY, …
```

## 2. Create group

**TX(RW)**. The actor must be `ACTIVE` (verified). `Group.create` inserts `expense_groups` (owner = actor, `ACTIVE`) and the owner's `group_memberships` row (`ACTIVE`) in one transaction (the owner-membership FK is deferred). Audit `GROUP_CREATED`. There is no member limit in the MVP.

## 3. Ownership (D17)

- Exactly one owner (`expense_groups.owner_user_id`). No administrator role exists anywhere in the model.
- `transferOwnership`: the actor is the owner; the group is `ACTIVE`; the target is another `ACTIVE` member; `expectedGroupVersion` matches (`@Version`). The owner pointer is set to the target. Audit `OWNERSHIP_TRANSFERRED` (from, to).
- The owner cannot leave (`OWNER_MUST_TRANSFER`) and cannot be removed.
- Ownership grants: invitations, revocation, member removal, categories, archiving, transfer. It **does not** grant approval rights or any override of expenses or payments.

## 4. Leaving and removal (D16)

### 4.1 Responsibility summary (DA-22)

For member m in group g, the application computes (under the group lock):

| Check | Query (conceptual) | Blocking reason |
| --- | --- | --- |
| Net balance | `BalanceCalculator` over the ledger postings → net(m) ≠ 0.00 | `NET_BALANCE_NOT_ZERO` |
| Awaiting expense approval | `expense_approvals` with approver m, decision NULL, on a version with status `PENDING` | `PENDING_APPROVAL_RESPONSIBILITY` |
| Awaiting cancellation approval | `cancellation_approvals` with approver m, decision NULL, request `OPEN` | `PENDING_CANCELLATION_RESPONSIBILITY` |
| Involved in a pending version | m is creator, payer, or participant of a version with status `PENDING` | `INVOLVED_IN_PENDING_EXPENSE` |
| Involved in an open cancellation | m is payer or participant of the effective version of an expense with an `OPEN` request, or the requester | `INVOLVED_IN_OPEN_CANCELLATION` |
| Owner | m = owner | `OWNER_MUST_TRANSFER` |

`MembershipDeactivationPolicy.evaluate` returns all blocking reasons, which are shown to the user.

### 4.2 Operation

**TX(RW, lock = group)**

1. `leaveGroup`: the actor is an `ACTIVE` member of an `ACTIVE` group. `removeMember`: the actor is the owner, and the target is an `ACTIVE` member ≠ owner.
2. Evaluate eligibility under the lock (so a concurrent expense or approval cannot create a new responsibility in between, CON-12).
3. `membership.deactivate(actor, LEFT | REMOVED, now)` sets status `INACTIVE`. The row is kept.
4. Audit `MEMBER_LEFT` / `MEMBER_REMOVED`.

**Post**: the member can no longer act. Historical allocations, approvals, and payments still reference the membership (FR-027). Their read access becomes involvement-only (DA-31).

### 4.3 Invariant protection (LI-5: inactive ⇒ net 0)

| Path that could change an inactive member's net | Protection |
| --- | --- |
| Approval of a pending version involving them | They cannot leave while involved (DA-22) |
| Edit of an approved expense involving them | Blocked (BR-VER-08, DA-21) |
| Cancellation of an approved expense involving them | Blocked (BR-CAN-10, DA-21) |
| A payment to or from them | They are never in the plan (net 0), and `PaymentService` requires `ACTIVE` parties |

### 4.4 Rejoining (DA-36)

A former member can rejoin only through a new invitation. Acceptance reactivates the same membership row (`MEMBER_REACTIVATED`). History is continuous.

## 5. Categories (D22)

| Operation | Authorization | Validation | Effect |
| --- | --- | --- | --- |
| create | Owner, group `ACTIVE` | Name 1–50 chars, trimmed; unique case-insensitive among active predefined and active custom names in the group | Inserts an active custom category. Audit `CATEGORY_CREATED`. |
| rename | Owner, group `ACTIVE`, custom only | Same uniqueness; `@Version` | Name updated. Historical versions keep `category_id`, so the display shows the new name. Audit `CATEGORY_RENAMED` (old, new) (DA-34). |
| deactivate | Owner, group `ACTIVE`, custom only | none | `active = false`. No longer selectable. Historical references remain valid (FK). Audit `CATEGORY_DEACTIVATED`. |
| Predefined categories | Nobody (read-only) | n/a | n/a |

Reactivating a deactivated custom category is not provided. The owner creates a new one with the same name, which the partial unique index allows because the old one is inactive.

## 6. Failure handling

| Failure | Response |
| --- | --- |
| Ineligible leave/removal | Page lists the blocking reasons (no change) |
| Stale group version on transfer | 409 conflict page |
| Archived group | `GroupArchivedException`, 409 read-only notice |
