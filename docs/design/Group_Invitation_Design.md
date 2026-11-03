# Group Invitation Design

| Decisions | D08, D29, D31, D36, D37 |
| --- | --- |
| Requirements | FR-032, FR-033 |
| Rules | BR-INV-01–09, BR-GRP-10 |
| Assumptions | DA-07, DA-08, DA-23, DA-36 |
| UML | [16_Invitation_State_Machine](../uml/16_Invitation_State_Machine.puml), [27_Sequence_Create_Group_Invitation](../uml/27_Sequence_Create_Group_Invitation.puml), [28_Sequence_Accept_Invitation](../uml/28_Sequence_Accept_Invitation.puml) |
| Tests | UT-INV-01–10, SEC-11–SEC-14, CON-11, AT-D08, AT-D37 |

## 1. Interfaces

```
InvitationService
  IssuedInvitation issueInvitation(long actor, long groupId, String email)               // TX(RW, lock=group)
  void revokeInvitation(long actor, long groupId, long invitationId, long expectedVersion) // TX(RW)
  InvitationPreview previewByToken(String rawToken, Long actorOrNull)                    // TX(RW): lazy expiry
  long acceptByToken(long actor, String rawToken)                                        // TX(RW, lock=group)
  long acceptById(long actor, long invitationId)                                         // TX(RW, lock=group)
  List<PendingInvitationView> listInvitationsForMe(long actor)                           // TX(RO)
  List<InvitationView> listGroupInvitations(long actor, long groupId)                    // TX(RO), owner only
IssuedInvitation(long invitationId, String acceptUrl /* contains the raw token; shown ONCE */, Instant expiresAt)
InvitationPreview(String groupName, String inviterDisplayName, Instant expiresAt, PreviewState state)
  // state: ACCEPTABLE | SIGN_IN_REQUIRED | NOT_ACCEPTABLE   (no reason disclosed to an anonymous caller)
```

## 2. Issue

**TX(RW, lock = group)**

1. The actor is the owner (BR-INV-01). The group is `ACTIVE` (D37: archived groups cannot issue).
2. `email = EmailAddress.of(raw)`. If a user with that email is an `ACTIVE` member → `ALREADY_MEMBER`.
3. Expire due pending invitations for (group, email) (`expireIfDue`). If one is still `PENDING`, refuse with `PENDING_INVITATION_EXISTS` (the owner may revoke and reissue) (BR-INV-03).
4. `raw = tokenService.generate()` (32 random bytes, base64url, 43 chars). `hash = tokenService.sha256Hex(raw)`.
5. Insert `group_invitations` (`PENDING`, `expires_at = now + 7 days`, `token_hash = hash`). The raw token is **never** stored or logged.
6. Audit `INVITATION_ISSUED` (details: email hash, expiry). Return `IssuedInvitation`. The acceptance URL is `${splitsmart.base-url}/invitations/accept/{raw}` and is shown to the owner **once** with a copy button (DA-23: no invitation email).

## 3. Delivery (DA-23)

- The owner shares the link through their own channels.
- A verified user whose email matches a `PENDING`, unexpired invitation sees it under "Invitations for you" on the dashboard (`listInvitationsForMe`), and can accept with `acceptById` (no token needed, because the binding is the verified email). This is part of the invitation workflow, **not** a notification (D26).

## 4. Accept

**TX(RW, lock = group)**. The group lock serializes acceptance with archiving and with concurrent acceptances (CON-11).

1. Resolve the invitation by `sha256(rawToken)` (`acceptByToken`) or by ID (`acceptById`). Not found → generic `INVITATION_INVALID`.
2. `expireIfDue(now)`. If it is now `EXPIRED`, persist that transition and audit `INVITATION_EXPIRED`.
3. `InvitationAcceptancePolicy.check` in this order:

| Condition | Outcome | Invitation state after | User message |
| --- | --- | --- | --- |
| Status `REVOKED` | refuse | unchanged | "This invitation is no longer valid." |
| Status `EXPIRED` (or just expired) | refuse | `EXPIRED` | "This invitation has expired. Ask the group owner for a new one." |
| Status `ACCEPTED` | refuse (single use) | unchanged | "This invitation has already been used." |
| Group `ARCHIVED` | refuse | Normally already `REVOKED` (archive revokes pending invitations); otherwise unchanged | "This group is archived." |
| Account not `ACTIVE` | refuse | unchanged | "Verify your email first." (unverified users cannot sign in, so this is defensive) |
| `acceptor.email ≠ invitedEmail` | refuse, **not consumed** (BR-INV-08), audit `INVITATION_WRONG_ACCOUNT` | unchanged (`PENDING`) | Generic: "This invitation was sent to a different email address. Sign in with that account." (No disclosure of the invited address.) |
| Already an `ACTIVE` member | refuse | unchanged | "You are already a member." |
| All pass | accept | `ACCEPTED` | Redirect to the group |

4. On acceptance: the invitation becomes `ACCEPTED` (`accepted_by`, `accepted_at`). The membership is created (`ACTIVE`, `joined_via_invitation_id`), or an existing `INACTIVE` row is reactivated (DA-36). Audit `INVITATION_ACCEPTED` (and `MEMBER_REACTIVATED` if applicable).
5. The invitation `@Version` plus the `PENDING → ACCEPTED` trigger guard prevent double use under races.

**Anonymous visit of an accept link**: `previewByToken` shows the group name and a "Sign in to accept" button. After login, Spring Security's saved request returns the user to the link. The preview never discloses *why* an invitation is not acceptable to an anonymous caller (SEC-12).

## 5. Revoke

Owner only; the invitation is `PENDING`; `@Version` matches. → `REVOKED` (`OWNER_REVOKED`). Audit `INVITATION_REVOKED`. Archiving revokes all `PENDING` invitations with `GROUP_ARCHIVED` in the archive transaction.

## 6. Expiry

- `expires_at = created_at + 7 days` (DB check). There is no scheduler dependency: transitions to `EXPIRED` happen lazily on preview, accept, issue (for the same email), and when listing.
- An optional daily sweep (`InvitationExpiryJob`, `@Scheduled`) may bulk-expire due invitations for tidy listings. Correctness never depends on it.

## 7. Security

| Property | Mechanism |
| --- | --- |
| Single-use | `ACCEPTED` is terminal; `@Version`; trigger |
| Email-bound | Normalized email comparison with the verified account's email |
| 7-day validity | `expires_at` check plus a lazy transition |
| Revocable | Owner-only `revoke` while `PENDING` |
| Token secrecy | 256-bit random. Only the SHA-256 hash is stored. The raw token is in the URL path only and never logged (access-log masking). `Referrer-Policy: no-referrer` on the accept page. |
| Archived groups | Cannot issue (group `ACTIVE` check) or accept (policy + archive revocation) |
| Enumeration | Generic messages for invalid tokens; rate limit of 20 previews per IP per hour (DA-29) |
