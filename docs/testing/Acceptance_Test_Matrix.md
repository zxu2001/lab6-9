# Acceptance Test Matrix (AT-D01–AT-D41)

One acceptance scenario per customer decision. Each is verified by the automated tests listed (all run by `mvn verify`), except items marked **(review)**, which are verified by document or configuration review because they concern deployment or process. Full traceability: [Requirements_Traceability_Matrix](../requirements/Requirements_Traceability_Matrix.md).

| AT ID | Decision | Given / When / Then | Verified by |
| --- | --- | --- | --- |
| AT-D01 | Web delivery | Given the application, when a browser requests `/`, `/login`, or `/groups/{g}`, then server-rendered Thymeleaf HTML is returned over HTTP(S); no Swing classes exist. | IT-MVC-01–08, UT-ARCH-01; (review) no `javax.swing` dependency |
| AT-D02 | Unanimous approval | Given approvers {Bob, Carol}, when only Bob approves, then the expense stays pending with no balance effect. When Carol rejects, it is `REJECTED`. The creator can never approve. | UT-APR-06, UT-APR-09, UT-APR-10, CON-06, FIN-01 |
| AT-D03 | Payment COMPLETED | When a debtor records a valid settlement, then its status is `COMPLETED` immediately, and there is no confirmation step for the creditor. | UT-PAY-01, IT-DB-03 (status check) |
| AT-D04 | In-app notifications only | When approval requests occur, then persisted notifications with read/unread exist, and no email or push is produced. | UT-NOT-01, UT-NOT-06, IT-EMAIL-01, SEC-21 |
| AT-D05 | Filtered reports | When reports are filtered by date range, member, category, and payment status, then only matching records appear with correct totals; no CSV endpoint exists. | UT-RPT-01–06, IT-MVC-07, IT-RPT-01 |
| AT-D06 | Cloud DB | Given the prod profile, then the data source points to RDS PostgreSQL over TLS. Integration tests run on PostgreSQL 16. | IT-DB-01; (review) AWS_Deployment_Design §5 |
| AT-D07 | Technology | The build uses Spring Boot, MVC, Thymeleaf, Data JPA/Hibernate, PostgreSQL, Maven, and JUnit 5. | IT-DB-02, UT-ARCH-01/02; (review) `pom.xml` at implementation |
| AT-D08 | Invitation-only | Given a verified non-member, when they try to join without a valid invitation, then it is impossible. With an invitation, they join. Any verified user can create a group. | UT-INV-01, UT-GRP-13, SEC-13 |
| AT-D09 | Precision | $100.00 / 3 → 33.34/33.33/33.33. $0.02 / 3 → 0.01/0.01/0.00. Percentages must total 100.00. Σ shares = amount. | UT-SPL-01–11, FIN-01–FIN-05, IT-DB-03, IT-DB-12 |
| AT-D10 | Editing | When the creator edits an approved expense, then a new immutable version is pending, prior approvals no longer count, and the expense contributes nothing until the new version is approved. Old versions stay viewable. | UT-VER-01–08, FIN-12, IT-DB-07, CON-07, CON-09 |
| AT-D11 | Authentication | Email/password login via Spring Security; BCrypt; server-side session; group authorization enforced on the server. | SEC-01–SEC-05, IT-AUTHZ-01–06 |
| AT-D12 | AWS deployment | EC2 + RDS + HTTPS + secrets design documented; nothing provisioned. | (review) AWS_Deployment_Design, 12_AWS_Deployment_Diagram; IT-EMAIL-02 (base URL config) |
| AT-D13 | Receipts in PostgreSQL | When a receipt is uploaded, then the bytes are in `receipt_contents` (`BYTEA`) with metadata. Type and size are validated. Download requires authorization. | UT-RCP-01–05, IT-DB-10, IT-AUTHZ-03, SEC-15–SEC-17 |
| AT-D14 | Cancellation | A pending never-approved expense is cancelled directly by the creator. An approved one needs unanimous cancellation approval, stays effective while pending, stays approved on rejection, and payments are not reversed. | UT-CAN-01–10, FIN-13, FIN-14, CON-08 |
| AT-D15 | Auto-approval | When the creator is the sole financially involved member, then the expense is approved automatically and audited. | UT-APR-05, UT-CAN-08, FIN-10 |
| AT-D16 | Membership restrictions | When a member with a non-zero balance or unresolved responsibility leaves or is removed, then it is refused. Otherwise their status becomes `INACTIVE` and history is preserved. | UT-GRP-01–04, CON-12, IT-AUTHZ-04 |
| AT-D17 | Ownership | One owner. Transfer to an active member only. The owner must transfer before leaving. No approval override. | UT-GRP-05–07, UT-APR-07, SEC-20, CON-10 |
| AT-D18 | USD only | Any non-USD currency is impossible (no input field; DB check). | UT-MON-01, IT-DB-03 |
| AT-D19 | Audit and concurrency | Version history, decisions, cancellations, and payments are audited. Failures roll back fully. `@Version` conflicts produce a 409. | UT-AUD-01, IT-TX-01–05, CON-01–CON-12 |
| AT-D20 | Payer excluded | Alice pays $90 for Bob and Carol, so Bob owes 45, Carol owes 45, and Alice owes 0. | UT-BAL-02, UT-APR-03, FIN-06, FIN-07 |
| AT-D21 | Group isolation | Balances and settlements are per group. The overview never nets across groups. | FIN-20, UT-RPT-08, IT-AUTHZ-02, IT-DB-11 |
| AT-D22 | Categories | Predefined plus owner-managed custom categories. Rename and deactivate keep history valid. | UT-CAT-01–06, IT-DB-13 |
| AT-D23 | Full settlement only | A recorded payment always equals the full current obligation of the pair. The client cannot set the amount. | UT-PAY-01, UT-PAY-04, FIN-17, SEC-19 |
| AT-D24 | Stale adjustment | A stale displayed amount is replaced by the current one (higher or lower), displayed and audited. Zero → no payment. Safe under concurrency. | UT-PAY-03/04, FIN-11, FIN-15, FIN-19, CON-01–CON-03, IT-MVC-06 |
| AT-D25 | Frozen participants | The participant list is frozen per version. New members are not added. Changes create a new version. | UT-VER-01, CON-12, IT-DB-12 (allocations immutable) |
| AT-D26 | Notification scope | Notifications only for the 3 approval-request types; none for payments, reports, or others. | UT-NOT-01–06, IT-DB-15 |
| AT-D27 | Multiple receipts | 0–10 JPEG/PNG/PDF per version. Receipt changes create a new version and restart approvals. History is kept. | UT-VER-07, UT-RCP-04, IT-DB-10 |
| AT-D28 | Rejected is final | A rejected expense cannot be edited, reopened, or resubmitted, and it is retained with its reason. | UT-APR-09, UT-VER-04, FIN-18, IT-DB-09 |
| AT-D29 | Archiving | Only the owner, only when settled with no unresolved workflows. Then read-only, with history retained. | UT-GRP-08–12, CON-04, CON-05, IT-AUTHZ-05 |
| AT-D30 | Verification and reset | Single-use, expiring tokens. Reset responses are non-disclosing. | UT-AUTH-05–10, SEC-06–SEC-10 |
| AT-D31 | Amazon SES | `EmailService` with SES and mock implementations; only verification and reset emails. | IT-EMAIL-01/02, IT-TX-04; (review) IAM policy |
| AT-D32 | Flyway | Versioned migrations; `ddl-auto=validate`; migration plan documented; no executable migrations yet. | IT-DB-01/02 (at implementation); (review) Flyway_Migration_Plan |
| AT-D33 | Testing | The required unit and integration coverage areas are specified; no browser E2E. | (review) Test_Strategy §3 |
| AT-D34 | Simplified settlement | A deterministic plan per group with ≤ k−1 transfers; history unchanged; algorithm documented with complexity. | UT-SET-01–10, UT-BAL-03, FIN-08, FIN-09 |
| AT-D35 | Payer approval | Alice creates, Bob pays, Carol and David share, so the approvers are {Bob, Carol, David}, frozen per version. | UT-APR-01–04, FIN-07 |
| AT-D36 | Permanent archive | No path from `ARCHIVED` to `ACTIVE` (no API; DB trigger). | UT-GRP-12, IT-DB-09 (trigger family) |
| AT-D37 | Secure invitations | Single-use, email-bound, 7 days, verified matching account, revocable, hash stored, not for archived groups. | UT-INV-01–10, SEC-09, SEC-11–SEC-14, CON-11 |
| AT-D38 | Creation permissions | Any active member of an active group can create and choose another member as payer. Inactive members and archived groups cannot. | FIN-07, IT-AUTHZ-05, UT-GRP-12 |
| AT-D39 | Debtor-only payment | Only the debtor can record; the creditor and others cannot. | UT-PAY-02, SEC-18 |
| AT-D40 | Payments final | No edit, delete, cancel, or reverse by anyone; a warning is shown before recording. | UT-PAY-06, IT-DB-08, IT-DB-14, IT-MVC-05, SEC-20 |
| AT-D41 | No approval deadline | Pending approvals and cancellation requests never expire automatically. | UT-APR-13, UT-CAN-11 |
