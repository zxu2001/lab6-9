# Notification Design (in-app approval requests)

| Decisions | D04, D26, D31 |
| --- | --- |
| Requirements | FR-010 |
| Rules | BR-NOT-01–04 |
| UML | [41_Sequence_Approval_Notification](../uml/41_Sequence_Approval_Notification.puml) |
| Tests | UT-NOT-01–07, IT-DB-15, SEC-21, AT-D04, AT-D26 |

## 1. Scope (exhaustive)

| Trigger | Type | Recipients | Created by |
| --- | --- | --- | --- |
| Version 1 submitted with ≥ 1 required approver | `EXPENSE_APPROVAL_REQUESTED` | Each required approver of v1 | `ExpenseService.createExpense` |
| Version n > 1 (edit) submitted with ≥ 1 required approver | `EXPENSE_REAPPROVAL_REQUESTED` | Each required approver of version n | `ExpenseService.editExpense` |
| Cancellation request opened with ≥ 1 required approver | `CANCELLATION_APPROVAL_REQUESTED` | Each required cancellation approver | `ExpenseCancellationService.requestCancellation` |

**No notifications** for: auto-approved expenses, approvals, rejections, cancellations, payments, reports, invitations (their own workflow), membership, or categories (D26). **No push, no email** (D04, D31).

## 2. Interface

```
NotificationService
  // internal (called inside the triggering transaction)
  void createApprovalRequests(ExpenseVersion version, NotificationType type)        // EXPENSE_(RE)APPROVAL_REQUESTED
  void createCancellationApprovalRequests(ExpenseCancellationRequest request)
  // user-facing
  Page<NotificationView> listMyNotifications(long actor, boolean unreadOnly, PageRequest page)   // TX(RO)
  long countUnread(long actor)                                                                    // TX(RO)
  void markRead(long actor, long notificationId)                                                  // TX(RW)
  void markAllRead(long actor)                                                                    // TX(RW)
  String open(long actor, long notificationId)   // TX(RW): markRead + return target link
NotificationView(long id, NotificationType type, String groupName, long groupId, long expenseId,
                 String expenseDescription, Money amount, UserRef creator, Instant createdAt, boolean read,
                 ActionState actionState /* ACTION_REQUIRED | DONE_BY_YOU | NO_LONGER_REQUIRED */, String link)
```

## 3. Behavior

- **Atomic creation**: notifications are inserted in the same transaction as the version or request. If the transaction rolls back, no notification exists (D19).
- **Exactly once**: the partial unique indexes `(recipient, expense_version_id)` and `(recipient, cancellation_request_id)` prevent duplicates (BR-NOT-02).
- **Persistent read/unread**: `read_at` is NULL (unread) or a timestamp. Marking read is idempotent. Only the recipient can mark it (the query is filtered by `recipient_user_id = actor`; another user's ID → 404).
- **Live action state** (BR-NOT-04): computed at display time from the approval or request row. `ACTION_REQUIRED` if the recipient's decision is NULL and the version is `PENDING` (or the request is `OPEN`). `DONE_BY_YOU` if decided. `NO_LONGER_REQUIRED` if the version was superseded, rejected, or cancelled, or the request was resolved by others.
- **Link**: `/groups/{g}/expenses/{e}` (the approval panel for the current version) or the cancellation request panel. Clicking a notification in the inbox submits `POST /notifications/{n}/open` (CSRF-protected). The endpoint marks it read and redirects to the target (PRG), so every GET stays side-effect free.
- **Header badge**: `countUnread` is shown in the layout (cached per request).
- **Privacy**: the notification content is limited to the group name, the expense description, the amount, and the creator. It is visible only to the recipient, who is an approver and therefore entitled to see the expense.

## 4. Data

See `notifications` in [PostgreSQL_Schema_Design §2.8](../database/PostgreSQL_Schema_Design.md#28-notifications-v8). There is no retention purge in the MVP.
