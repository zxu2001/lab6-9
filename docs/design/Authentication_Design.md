# Authentication Design (registration, verification, login, password reset, email)

| Decisions | D11, D30, D31, D04 |
| --- | --- |
| Requirements | FR-001, FR-002, FR-029–FR-031, NFR-002, NFR-015, NFR-019 |
| Rules | BR-AUTH-01–10 |
| Assumptions | DA-07, DA-08, DA-09, DA-29, DA-30 |
| UML | [17_Account_Verification_State_Machine](../uml/17_Account_Verification_State_Machine.puml), [25_Sequence_Register_Verify_Email](../uml/25_Sequence_Register_Verify_Email.puml), [26_Sequence_Password_Reset](../uml/26_Sequence_Password_Reset.puml) |
| Tests | UT-AUTH-01–12, IT-MVC-01/02, IT-EMAIL-01/02, IT-TX-04, SEC-01–SEC-10, AT-D11, AT-D30, AT-D31 |

## 1. Interfaces

```
AccountService
  RegistrationResult register(RegisterAccountCommand cmd, ClientInfo client)     // TX(RW)
  void resendVerification(String email, ClientInfo client)                       // TX(RW); generic outcome
  AccountView getMyAccount(long actor)                                           // TX(RO)
AccountVerificationService
  VerificationResult verifyEmail(String rawToken)                                // TX(RW)
PasswordResetService
  void requestReset(String email, ClientInfo client)                             // TX(RW); always generic
  ResetTokenState checkToken(String rawToken)                                    // TX(RO): VALID | INVALID
  void resetPassword(String rawToken, String newPassword, String confirmPassword) // TX(RW)
LoginAttemptService (infrastructure.security; called by Spring Security event listeners)
  void onFailure(String email, Instant now) ; void onSuccess(long userId)

TokenService (application.integration)
  GeneratedToken generate()                      // raw (base64url of 32 SecureRandom bytes) + sha256Hex
  String sha256Hex(String raw)
EmailService (application.integration)
  void sendVerificationEmail(EmailAddress to, String displayName, URI verificationLink, Instant expiresAt)
  void sendPasswordResetEmail(EmailAddress to, String displayName, URI resetLink, Instant expiresAt)
  // implementations: SesEmailService (prod), MockEmailService (dev/test) — no other email methods exist (D31)

RegisterAccountCommand(String email, String displayName, String password, String confirmPassword)
RegistrationResult(long userId, UserStatus status)           // always PENDING_VERIFICATION
VerificationResult = VERIFIED | ALREADY_VERIFIED | INVALID_OR_EXPIRED
ClientInfo(String ipAddress, String userAgentHash)
```

## 2. Registration and verification

**Register (TX RW)**

1. Validate: email syntax, normalized; display name 1–100; password 12–128 chars, ≠ email, equals confirm (BR-AUTH-01/03).
2. If the email already exists: if the account is `PENDING_VERIFICATION`, treat it as a resend (rate-limited). Otherwise return the field error "An account with this email already exists." Registration is the one place where existence is revealed. This is accepted (common practice; reset and resend never reveal it). The response delay is equalized (±50 ms jitter) to limit timing differences.
3. Insert a `users` row (`PENDING_VERIFICATION`, BCrypt hash).
4. `token = tokenService.generate()`. Insert `email_verification_tokens` (hash, `expires_at = now + 24h`).
5. Publish `VerificationEmailRequested(userId, rawToken, expiresAt)` as an application event. Audit `USER_REGISTERED`.
6. **After commit**: a listener builds `${base-url}/verify/{rawToken}` and calls `emailService.sendVerificationEmail`. An SES exception is logged (with no token) and the outcome page offers "Resend email" (AD-07, IT-TX-04).

**Verify (TX RW)**: hash the raw token → find it. It must be unused, not invalidated, and unexpired. If so: `user.verifyEmail(now)` and `token.markUsed(now)`. Audit `EMAIL_VERIFIED`. Otherwise `INVALID_OR_EXPIRED` (a generic page with a resend form). Already `ACTIVE` → `ALREADY_VERIFIED`.

**Resend (TX RW)**: rate-limited (3 per email per hour, 20 per IP per hour). If an account exists and is `PENDING_VERIFICATION`: invalidate open tokens and issue a new one (after-commit email). The response is **always** "If an unverified account exists for this email, we sent a new link."

## 3. Login (Spring Security)

- `UsernamePasswordAuthenticationFilter` on `POST /login` (fields `email`, `password`, `_csrf`).
- `SplitSmartUserDetailsService.loadUserByUsername(email)` maps `users` to `UserDetails`: `enabled = (status == ACTIVE)`, `accountNonLocked = (locked_until == null || locked_until <= now)`.
- On `AuthenticationFailureBadCredentialsEvent` → `LoginAttemptService.onFailure`. After 5 consecutive failures, set `locked_until = now + 15 min` and audit `ACCOUNT_LOCKED`.
- On success: reset the counter, rotate the session ID, and redirect to the saved request (e.g., an invitation link) or `/`.
- Failure messages: bad credentials and locked → "Invalid email or password, or the account is temporarily locked." Disabled because unverified → "Please verify your email first" (+ a resend link). The password was correct in that case, so no enumeration risk arises.
- Logout: `POST /logout` (CSRF), invalidate the session, delete the cookie.

## 4. Password reset (D30)

**Request (TX RW)**: rate-limited. The response is always "If an account exists for this email, we sent a reset link." (BR-AUTH-06). If the account exists and is not `DISABLED`: invalidate open reset tokens, insert a new one (30 min), and send it after commit. Audit `PASSWORD_RESET_REQUESTED` (email hash only). For a non-existent email: no DB write, same response; a dummy BCrypt computation keeps the timing similar.

**Check token (GET)**: valid → show the form. Invalid → a generic "link invalid or expired" page with a request form.

**Reset (TX RW)**: validate the token (unused, unexpired) and the new password (policy; ≠ email). `user.changePassword(bcrypt(new))`, `token.markUsed`, invalidate all other open reset tokens, clear the lockout. Audit `PASSWORD_RESET_COMPLETED`. **After commit**: expire all of the user's sessions through `SessionRegistry` (BR-AUTH-07). Redirect to login with a success message.

If the account was `PENDING_VERIFICATION` and is reset through an emailed link, the email is proven, so the account is also verified (`verifyEmail`). This is design assumption DA-41.

## 5. Token rules (DA-07, DA-08)

| Property | Verification | Reset | Invitation |
| --- | --- | --- | --- |
| Entropy | 256 bits | 256 bits | 256 bits |
| Stored | SHA-256 hex | SHA-256 hex | SHA-256 hex |
| Lifetime | 24 h | 30 min | 7 days |
| Single use | `used_at` | `used_at` | status `ACCEPTED` |
| Invalidation | A newer token invalidates older ones | A newer token or a successful reset invalidates others | Revocation or archive |
| Transport | URL path, HTTPS only, `Referrer-Policy: no-referrer`, masked in access logs | Same | Same |

## 6. Email delivery (D31)

| Item | Design |
| --- | --- |
| Abstraction | `EmailService` (application layer) with exactly two methods (verification, reset) |
| Production adapter | `SesEmailService` uses AWS SDK v2 `SesV2Client.sendEmail` with instance-role credentials and region config. From `no-reply@splitsmart.example`. Plain-text + simple HTML templates (Thymeleaf text templates, no user HTML). Timeout 5 s. |
| Dev/test adapter | `MockEmailService` stores messages in memory (`List<SentEmail>`) and logs a redacted line. Selected by `splitsmart.email.provider=mock`. |
| Failure behavior | Exceptions are caught in the after-commit listener: log `EMAIL_SEND_FAILED` (no token), increment a metric, alarm. The user can resend (verification) or re-request (reset). There is no retry queue in the MVP. |
| Separation | No financial or notification content is ever emailed. Approval requests are in-app only (D04, D26). |
| IAM | `ses:SendEmail` limited to the identity and the from-address ([AWS_Deployment_Design §3](../architecture/AWS_Deployment_Design.md#3-iam-least-privilege)) |

## 7. Account state machine

`[*] → PENDING_VERIFICATION --verify(valid token)--> ACTIVE`;
`PENDING_VERIFICATION --reset completed--> ACTIVE`;
`ACTIVE --lock (5 failures)--> ACTIVE[locked until t]` (a sub-state, not a status);
`ACTIVE --admin disable (out of MVP UI)--> DISABLED`.
Diagram: [17](../uml/17_Account_Verification_State_Machine.puml).
