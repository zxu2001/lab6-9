# Security Test Cases (SEC-01–SEC-25)

Executed as MockMvc integration tests with Spring Security (`spring-security-test`) against Testcontainers PostgreSQL, unless marked (U) = unit. Authorization expectations follow the [matrix in Security_Architecture §4](../architecture/Security_Architecture.md#4-authorization-matrix). Not implemented in this phase.

| ID | Area | Setup | Action | Expected | Req |
| --- | --- | --- | --- | --- | --- |
| SEC-01 | Password storage | Register | Inspect `users.password_hash` | Starts with `{bcrypt}$2`; cost ≥ 12; not the plaintext | D11 |
| SEC-02 | Unverified login | `PENDING_VERIFICATION` user | `POST /login` with a correct password | No session established; verify-email message | D30 |
| SEC-03 | Session fixation | Anonymous session ID S1 | Login | The new session ID ≠ S1 | D11 |
| SEC-04 | Cookie flags | Login over HTTPS (`secure` request) | Inspect `Set-Cookie` | `Secure; HttpOnly; SameSite=Lax` | DA-09 |
| SEC-05 | Lockout | 5 wrong passwords | 6th attempt with the correct password | Refused while locked; succeeds after 15 min (clock) | BR-AUTH-08 |
| SEC-06 | Reset non-disclosure | Known and unknown emails | `POST /password-reset` | Identical status, body text, and redirect; mock email captures only the known one | D30 |
| SEC-07 | Reset token single use | Use the reset link twice | Second use | "Link invalid or expired" | D30 |
| SEC-08 | Rate limit | 4 reset requests for one email within an hour | 4th | Generic response, no 4th email | DA-29 |
| SEC-09 | Token storage (U) | Issue verification, reset, and invitation tokens | Inspect the DB and logs | Only 64-char hex hashes; the raw token never appears in logs (log-capture appender) | DA-08, NFR-019 |
| SEC-10 | Session invalidation on reset | Bob logged in on two clients | Reset the password | Both old sessions are rejected on the next request | BR-AUTH-07 |
| SEC-11 | Invitation wrong account | Invitation for `bob@x.com` | Carol accepts the link | Refused generically; invitation still `PENDING`; audit `INVITATION_WRONG_ACCOUNT` | D37 |
| SEC-12 | Invitation preview leakage | Anonymous request for a revoked or expired token | `GET /invitations/accept/{t}` | Generic "not available" page; no group member data; no reason disclosed | D37 |
| SEC-13 | Invitation by non-owner | Bob (member) | `POST /groups/G1/invitations` | 403 | D37 |
| SEC-14 | Invitation token brute force | 21 previews from one IP within an hour | 21st | Rate-limited response | DA-29 |
| SEC-15 | Receipt content spoofing | HTML file renamed `x.png` with `Content-Type: image/png` | Upload in the expense form | Rejected `RECEIPT_TYPE_NOT_ALLOWED` | D13 |
| SEC-16 | Receipt size DoS | 11 MiB file; a request with 11 files | Upload | 413 / form error; no rows | NFR-014 |
| SEC-17 | Receipt download headers | Valid PDF | Download | `attachment`; `nosniff`; CSP `default-src 'none'`; no inline rendering for PDF | DA-10 |
| SEC-18 | Payment by creditor / other | Plan B→A | A posts `/groups/G1/settle/2`; C posts the same; A posts a forged `debtorId=2` field | No payment created for any; the forged field is ignored (not bound) | D39 |
| SEC-19 | Payment tampering | B posts `displayedAmount=0.01` and `amount=0.01` fields | Settle | Recorded amount = server-computed obligation (48.33); adjusted flag set | D23, D24 |
| SEC-20 | Owner override attempts | The owner is not an approver | Approve, reject, cancel-approve someone's expense; edit or delete a payment (no endpoint) | 403; no route exists for payment edit or delete (404/405) | D17, D40 |
| SEC-21 | Notification IDOR | Bob's notification N | Carol `POST /notifications/N/open` | 404 | D26 |
| SEC-22 | Report scope | Erin is not in G1 | `GET /groups/G1/reports`; overview | 404; the overview lists only Erin's groups | D21, FR-024 |
| SEC-23 | CSRF on every state-changing endpoint | Enumerate all POST mappings (from `RequestMappingHandlerMapping`) | POST without `_csrf` | 403 for each | DA-09 |
| SEC-24 | Log hygiene | Run the auth and payment flows with a log-capture appender | Inspect logs | No passwords, raw tokens, session IDs, or receipt bytes | NFR-019 |
| SEC-25 | Security headers | Any authenticated page | Inspect the response | HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` (`no-referrer` on token pages) | NFR-002 |
