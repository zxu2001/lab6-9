# Security Architecture

| Scope | Authentication, sessions, CSRF, transport security, authorization model and matrix, object-level authorization, cross-group isolation, secrets, logging, threats |
| --- | --- |
| Decisions | D11, D12, D13, D21, D30, D31, D37, D39, D40 |
| Assumptions | DA-06–DA-11, DA-29, DA-31, DA-40 |
| Related | [Authentication_Design](../design/Authentication_Design.md) · [AWS_Deployment_Design](AWS_Deployment_Design.md) · [Security_Test_Cases](../testing/Security_Test_Cases.md) · [Group_Invitation_Design](../design/Group_Invitation_Design.md) |

## 1. Authentication and session management

| Control | Design |
| --- | --- |
| Mechanism | Spring Security form login (`/login`, POST `email`, `password`). `DaoAuthenticationProvider` with `SplitSmartUserDetailsService`. |
| Account state gating | `UserDetails.isEnabled()` is true only for `ACTIVE`. `PENDING_VERIFICATION` shows "Verify your email first" (with a resend link). `DISABLED` shows a generic failure. `isAccountNonLocked()` is false while `locked_until > now`. |
| Password storage | `BCryptPasswordEncoder(12)`. Hashes use the `{bcrypt}` prefix through `DelegatingPasswordEncoder` so the cost can be upgraded later. |
| Sessions | Server-side `HttpSession` (in memory, single instance, DA-30). `sessionFixation().changeSessionId()`. Idle timeout 30 min. `maximumSessions(5)` per user. Logout invalidates the session and clears the cookie. |
| Cookie | `JSESSIONID`: `Secure`, `HttpOnly`, `SameSite=Lax`, path `/`. |
| Remember-me | Not provided in the MVP. |
| Session invalidation on password reset | `SessionRegistry` expires all sessions of the user (BR-AUTH-07). |
| Lockout and rate limits | `LoginAttemptService` (failed counter + `locked_until`). `RateLimiter` (in-memory token buckets keyed by email hash and IP) for resend-verification, reset-request, and invitation-preview endpoints (BR-AUTH-08). |

## 2. Transport and browser security

| Control | Design |
| --- | --- |
| HTTPS | TLS terminates at the ALB (ACM certificate) or at nginx. HTTP→HTTPS redirect. `server.forward-headers-strategy=native` so Spring sees the original scheme. `requiresChannel().anyRequest().requiresSecure()` behind the proxy. |
| HSTS | `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| CSRF | Spring Security `CsrfTokenRepository` (session-backed). Thymeleaf injects `_csrf` hidden fields into every `th:action` form. Every POST, PUT, and DELETE requires the token. No state change happens on GET. |
| Headers | `Content-Security-Policy: default-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: same-origin`; `X-Frame-Options: DENY` |
| Output encoding | Thymeleaf `th:text` (escaped) only. `th:utext` is forbidden for user data. |
| Receipt download | `Content-Disposition: attachment; filename*=UTF-8''<sanitized>`, the stored `Content-Type`, `nosniff`. Receipts are never rendered inline from user-controlled types (PDF inline preview is not provided). |
| Token URLs | Verification, reset, and invitation links carry the raw token only in the URL path. Responses set `Referrer-Policy: no-referrer` on those pages. Tokens are never logged (access-log pattern masks `/verify/*`, `/reset/*`, `/invitations/*`). |

## 3. Authorization model

Authorization is enforced at the **application service boundary** (DA-06). Spring Security URL rules only separate public pages (`/`, `/login`, `/register`, `/verify/**`, `/password-reset/**`, `/invitations/accept/**` preview, static assets) from authenticated ones (`/**`).

`AuthorizationService` (application layer) offers:

| Method | Semantics |
| --- | --- |
| `GroupAccess requireReadAccess(long actorId, long groupId)` | Actor has an `ACTIVE` membership (any group status), or an `INACTIVE` membership (the result is flagged `involvementOnly = true`). Otherwise `NotFoundException` → 404. |
| `GroupAccess requireActiveMemberOfActiveGroup(long actorId, long groupId)` | Membership `ACTIVE` and group `ACTIVE`. Archived → `GroupArchivedException` (409). Inactive → `ForbiddenException` (403). Non-member → 404. |
| `void requireOwner(GroupAccess access)` | `group.owner_user_id == actorId`, otherwise 403 |
| `void requireExpenseReadAccess(long actorId, Expense expense)` | `requireReadAccess`. If `involvementOnly`, the actor must be the creator, or the payer, participant, or approver of any version, or a cancellation approver. |
| `void requireCreator(long actorId, Expense e)` | `e.creatorUserId == actorId`, otherwise 403 |
| `void requireRequiredApprover(long actorId, ExpenseVersion v)` | The actor is in the frozen approver set of `v`, otherwise 403 |
| `void requireDebtor(long actorId, SettlementTransfer t)` | `t.debtorId == actorId`, otherwise 403 (D39) |

**Object resolution rule**: services load the target object first and derive `groupId` from the **persisted** object, never from request parameters. URL nesting (`/groups/{groupId}/expenses/{expenseId}`) is cross-checked: if `expense.groupId != groupId`, the response is 404.

## 4. Authorization matrix

Role columns are cumulative contexts. Unless the column says otherwise, contextual roles (Creator … Creditor) assume an `ACTIVE` membership in an `ACTIVE` group.

Legend: ✓ allowed · ✗ denied · **C*n*** conditional (see notes) · — not applicable

| # | Action | Anonymous | Unverified | Verified (non-member) | Active member | Owner | Expense creator | Expense payer | Required approver | Debtor | Creditor | Inactive member | Member of archived group |
| --: | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 1 | Register | ✓ | — | — | — | — | — | — | — | — | — | — | — |
| 2 | Verify email (token link) | ✓ C1 | ✓ C1 | — | — | — | — | — | — | — | — | — | — |
| 3 | Resend verification | ✓ C2 | ✓ C2 | — | — | — | — | — | — | — | — | — | — |
| 4 | Request password reset | ✓ C2 | ✓ C2 | ✓ C2 | ✓ C2 | ✓ C2 | ✓ C2 | ✓ C2 | ✓ C2 | ✓ C2 | ✓ C2 | ✓ C2 | ✓ C2 |
| 5 | Complete password reset (token) | ✓ C1 | ✓ C1 | ✓ C1 | ✓ C1 | ✓ C1 | ✓ C1 | ✓ C1 | ✓ C1 | ✓ C1 | ✓ C1 | ✓ C1 | ✓ C1 |
| 6 | Sign in | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 7 | Create group | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 8 | View group, members, expenses, history | ✗ | ✗ | ✗ (404) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C3 | ✓ (read-only) |
| 9 | Issue invitation | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ | ✗ |
| 10 | Revoke pending invitation | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ | ✗ |
| 11 | Accept invitation (join) | ✗ (sign in first) | ✗ | C5 | — (already member) | — | — | — | — | — | — | C5 (reactivate) | ✗ |
| 12 | Transfer ownership | ✗ | ✗ | ✗ | ✗ | C6 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ | ✗ |
| 13 | Leave group | ✗ | ✗ | — | C7 | ✗ (transfer first) | C7 | C7 | C7 | C7 | C7 | — | ✗ |
| 14 | Remove (deactivate) a member | ✗ | ✗ | ✗ | ✗ | C7 (target) | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ | ✗ |
| 15 | Create expense (and name a payer) | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| 16 | Edit expense | ✗ | ✗ | ✗ | ✗ | ✗ C4 | C8 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 17 | Approve / reject expense version | ✗ | ✗ | ✗ | ✗ | ✗ C4 | ✗ (never) | C9 | ✓ C9 | ✗ C4 | ✗ C4 | ✗ | ✗ |
| 18 | Cancel never-approved pending expense | ✗ | ✗ | ✗ | ✗ | ✗ C4 | ✓ C10 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 19 | Request cancellation of approved expense | ✗ | ✗ | ✗ | ✗ | ✗ C4 | C10 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 20 | Approve / reject cancellation | ✗ | ✗ | ✗ | ✗ | ✗ C4 | ✗ (never) | C11 | C11 | ✗ C4 | ✗ C4 | ✗ | ✗ |
| 21 | Upload / replace / remove receipts | ✗ | ✗ | ✗ | ✗ | ✗ C4 | ✓ (within create/edit, C8) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 22 | Download receipt | ✗ | ✗ | ✗ (404) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C3 | ✓ |
| 23 | Manage custom categories | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ | ✗ |
| 24 | View balances and settlement plan | ✗ | ✗ | ✗ (404) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C12 | ✓ |
| 25 | Record settlement payment | ✗ | ✗ | ✗ | ✗ | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | C13 | ✗ (D39) | ✗ | ✗ |
| 26 | Edit / delete / reverse a payment | ✗ | ✗ | ✗ | ✗ | ✗ (D40) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 27 | Generate reports (group) | ✗ | ✗ | ✗ (404) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C3 | ✓ |
| 28 | Cross-group overview | ✗ | ✗ | ✓ (own groups only; empty) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C3 | ✓ |
| 29 | Archive group | ✗ | ✗ | ✗ | ✗ | C14 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ C4 | ✗ | ✗ (already archived) |
| 30 | View / mark own notifications | ✗ | ✗ | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) | ✓ (own) |
| 31 | View audit trail of a group's records | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C3 | ✓ |

**Conditions**

- **C1** The holder of a valid, unexpired, unused token. Token possession is the credential. Tokens are single-use.
- **C2** Generic response always (no disclosure). Rate-limited (BR-AUTH-08).
- **C3** Inactive members may read only records they were involved in (creator, payer, participant, or approver of any version; cancellation approver; debtor or creditor). Their own net balance (always 0.00) is visible. Other members' balances are not (DA-31).
- **C4** Denied unless the person also holds the role that grants it (e.g., the owner may act as a required approver only because they are in the approver set, never because they are the owner: D17).
- **C5** The account is `ACTIVE`, its normalized email equals the invited email, the invitation is `PENDING` and unexpired, and the group is `ACTIVE` (BR-INV-04).
- **C6** The target is another `ACTIVE` member. The group is `ACTIVE`.
- **C7** Net balance 0.00 and no unresolved responsibilities (BR-GRP-05/06). The target is not the owner.
- **C8** The actor is the creator; the expense is `PENDING_APPROVAL` or `APPROVED`; there is no `OPEN` cancellation request; no inactive involved members for `APPROVED` (BR-VER-01/08/09).
- **C9** The actor is in the frozen approver set of the **current `PENDING`** version and has not decided. A payer who is also the creator is excluded.
- **C10** The actor is the creator. Row 18: the expense was never approved (BR-CAN-01). Row 19: the expense is `APPROVED`, no `OPEN` request exists, and no inactive involved members (BR-CAN-03/10).
- **C11** The actor is in the frozen cancellation-approver set of the `OPEN` request and has not decided.
- **C12** Own balance only.
- **C13** The actor is the debtor of a transfer to that creditor in the **current** plan, recomputed under lock (BR-PAY-01/02).
- **C14** All balances 0.00, no `PENDING_APPROVAL` expenses, no `OPEN` cancellation requests (BR-ARC-02).

## 5. Object-level authorization and cross-group isolation

| Threat | Control |
| --- | --- |
| IDOR on group-scoped objects (expense, receipt, payment, invitation, category) | Every service loads the object, derives `groupId` from it, and calls `AuthorizationService`. Repository finder methods are group-scoped (`findByIdAndGroupId`). A mismatch returns 404. |
| Cross-group participants or payer | `ExpenseService` verifies that every participant and the payer hold an `ACTIVE` membership in **the expense's group** (BR-EXP-04/05). |
| Cross-group category | The category must be predefined (`group_id IS NULL`) or `category.group_id == expense.group_id`, and active. |
| Cross-group settlement | `PaymentService` computes the plan for the group only. The creditor must be a member of the same group. The DB composite FKs `(group_id, debtor_user_id)` and `(group_id, creditor_user_id)` reference `group_memberships(group_id, user_id)`. |
| Receipt download for another group | `receipts.group_id` is checked against the expense's group and the actor's access. The receipt must be linked to a version of an expense the actor can read. |
| Notification of another user | The `recipient_user_id = actor` predicate is in every query. Mark-read on someone else's notification returns 404. |
| Over-posting / mass assignment | Form objects contain only editable fields. Commands are constructed explicitly. Entities are never bound. |
| Report data leakage | `ReportService` restricts scope to groups returned by `requireReadAccess` and applies the involvement filter for inactive members. The cross-group overview never nets across groups (D21). |

## 6. Secrets and configuration

| Secret | Storage | Access |
| --- | --- | --- |
| RDS master credentials | AWS Secrets Manager (managed rotation) | Ops only; not used by the app |
| App DB credentials (`splitsmart_app` role) | Secrets Manager | The EC2 instance role reads `secretsmanager:GetSecretValue` on that ARN only |
| SES sending | No static keys. The EC2 instance role has `ses:SendEmail` and `ses:SendRawEmail`, with conditions on `ses:FromAddress` and the identity ARN. | |
| Application configuration | `application-prod.yml` contains no secrets. Environment variables / Spring Cloud AWS parameter import at startup. | |
| Local dev | `MockEmailService`, Testcontainers / local PostgreSQL. `.env` files are git-ignored. | |

## 7. Logging and monitoring

- Use structured logs. **Never** log passwords, raw tokens, session IDs, receipt bytes, or full emails in reset or resend paths (log an email hash instead).
- Security events to log (and audit where listed in BR-AUD-02): login success and failure, lockout, reset requested and completed, verification, invitation acceptance attempts by the wrong account, 403 and 404 bursts per user.
- Ship logs to CloudWatch Logs, with alarms on 5xx rate, SES send failures, and login-failure spikes.

## 8. Threat summary (STRIDE)

| STRIDE | Threat | Mitigation |
| --- | --- | --- |
| Spoofing | Credential stuffing | BCrypt, lockout, rate limits, generic errors |
| Spoofing | Invitation forwarded to someone else | Bound to email + verified account (D37) |
| Tampering | Changing the amount of a settlement | The server recomputes the amount (BR-PAY-02). The form amount is informational only. |
| Tampering | Editing financial history | Immutable versions and payments. DB triggers plus app-role grants (no UPDATE/DELETE on `payments`, `audit_events`, or version content) |
| Repudiation | "I never approved that" | Decisions with actor + timestamp in `expense_approvals` + `audit_events` |
| Information disclosure | Email enumeration | Generic reset/resend responses; 404 for other groups' objects |
| Information disclosure | Malicious receipt (stored XSS) | Magic-byte validation, attachment disposition, `nosniff`, CSP |
| Denial of service | Large uploads | Multipart limits; per-file 10 MiB; ≤ 10 files |
| Elevation of privilege | Owner overriding approvals or payments | No owner override anywhere (D17, D40). Authorization tests SEC-* |
