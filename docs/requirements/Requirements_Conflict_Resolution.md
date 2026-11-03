# Requirements Conflict Resolution Report

| Date | 2026-11-03 |
| --- | --- |
| Rule applied | When an original requirement, clarification, or earlier design statement conflicts with a later explicit customer decision (D01–D41), the **decision is authoritative**. The original text is preserved: `UserRequirement.md` is unchanged, and earlier artifacts stay in Git history or are marked historical. |
| Inputs reviewed | `UserRequirement.md`; spec v1 (2026-10-27) incl. clarifications C1–C5; plan v1; research v1; data-model v1; contracts v1; `architecture.puml` v1; quickstart v1; checklist v1; `.specify/memory/constitution.md` v1.0.0; `architecture/Claude_Architecture_Alternatives.md`; `architecture/ChatGPT_Architecture_Review.md`; ADR-001 (Proposed) |

## 1. Conflict log

| # | Topic | Original conflicting statement (source) | Updated customer decision | Resolution | Files affected | Remaining assumptions |
| --: | --- | --- | --- | --- | --- | --- |
| C-01 | Delivery platform | "The desktop MVP is an implementation subset… desktop presentation implemented with Java Swing" (spec v1, Java Swing MVP Subset); "SplitSmart will be delivered as a desktop MVP" (plan v1); "Use … MVC/presenter Swing UI" (ADR-001 Proposed) | D01, D06: web application + cloud DB | Swing MVP retired. FR-022 now requires web delivery. The architecture was redesigned for Spring MVC + Thymeleaf. The customer requirement "OS supported: primary web-based" is now satisfied. | spec.md, plan.md, research.md, ADR-001, architecture.puml, quickstart.md, checklists/requirements.md, all docs/* | None |
| C-02 | Constitution Principle III | "The desktop user interface MUST be implemented with Java Swing" (constitution v1.0.0) | D01, D06, D07 | **Not edited unilaterally**, because the constitution's governance requires a documented proposal plus human ratification. A MAJOR amendment (v2.0.0) is drafted in [Constitution_Amendment_Proposal](Constitution_Amendment_Proposal.md). The plan's Constitution Check records the conflict. | constitution.md (unchanged), Constitution_Amendment_Proposal.md, plan.md | **Open**: human ratification required (Q-05) |
| C-03 | Selected architecture | Claude_Architecture_Alternatives recommended "Hexagonal + MVP"; ChatGPT review recommended "Layered + MVC/presenter with selected hexagonal practices"; plan v1 "layered desktop … MVC presentation" | Course selection: Layered + MVC (instruction §3) | ADR-001 is now **Accepted: Layered + MVC (Spring MVC)**. Hexagonal/MVP stays only as historical analysis, with a superseded banner on both review documents. Dependency inversion is used only for repositories and integrations (not ports-and-adapters). | ADR-001, Architecture_Overview, Layer_Responsibilities, Dependency_Rules, Claude/ChatGPT docs (banner only) | None |
| C-04 | UML dependency direction | `Services --> Repositories` where Repositories = "Repository Adapters" (architecture.puml v1), flagged by the ChatGPT review R-04 | Layered + MVC with DIP | Diagrams 06/07/08/10 show services depending on **repository interfaces in the domain**, implemented by infrastructure adapters (`..|>`). architecture.puml was rewritten the same way. | specs/.../architecture.puml, docs/uml/06–08, 10 | None |
| C-05 | Approval rule | "single-review approval" (spec v1 MVP subset); FR-012 "configured number and arrangement of review steps"; Open Question 1 | D02, D35 | FR-012/FR-013 rewritten: unanimous approval by the frozen set (participants ∪ payer) − creator. Configurable multi-step approval removed. | spec.md, Business_Rules, Expense_Approval_Design, UML 13/19/30/31 | None |
| C-06 | Payer relationship to participants | C1: "payer may be changed to another **participant**" (payer ∈ participants) | D20, D38 | The payer may be any active member and need not be a split participant. The payer is credited the full amount. | spec.md (C1 marked revised), BR-EXP-04–06 | None |
| C-07 | Rounding | C3 and NFR-001 v1: "Round each share half-up… assign the undistributed remainder to the payer" | D09 | Superseded: floor to cents, then leftover cents by largest remainder with ascending `users.id` tie-break (equal split = lowest IDs). The old rule was also impossible when the payer is excluded (D20). | spec.md, NFR-001, research.md R3, Settlement_Algorithm | DA-25 (percent precision), DA-38 (zero shares) |
| C-08 | Balance model | FR-014 v1 "amount owed by each user to every other relevant user" (pairwise, global) | D21, D34 | Per-group net balances + deterministic simplified settlement plan. Never offset across groups. | spec.md, Financial_Ledger_Design, Settlement_Algorithm | DA-16 (obligation definition) |
| C-09 | Payment confirmation | "Payment: … confirmation state" (data-model v1); Open Question 2; contracts v1 "apply confirmation policy" | D03 | Payments are `COMPLETED` on recording. No confirmation state. | data-model.md, contracts, Payment_Processing_Design | None |
| C-10 | Overpayment / partial payment | US-3 scenario 2: "cannot exceed what is owed **without a review exception**"; FR-016 v1 "record … amount" | D23, D24 | Full settlement only. The amount is server-computed. There is no review exception. A stale amount is auto-adjusted. | spec.md US-4, BR-PAY-02–05 | None |
| C-11 | Payment reversal | (silent in v1) | D40 | Payments are final and immutable (app + DB triggers + grants). Errors are resolved outside SplitSmart. | Payment_Processing_Design, Data_Integrity_Constraints | None |
| C-12 | Who records payments | FR-016 v1: "allow users to record payer, recipient…" | D39 | Debtor only. Enforced in the service and by a DB check (`recorded_by = debtor`). | Payment_Processing_Design, schema | None |
| C-13 | Notification scope | FR-010 v1: "notify applicable group members when another member creates an expense"; US-4 v1 "every other intended participant" | D04, D26 | In-app notifications only for the 3 approval-request types, sent to the required approvers only. No email or push. | spec.md, Notification_Design, UML 41 | None |
| C-14 | Notification delivery vs SES | (none in v1) | D31 vs. D08/D37 invitation delivery | SES is limited to verification and reset. Invitations are shared as links by the owner and shown in-app to matching verified users. | Group_Invitation_Design | DA-23, **Q-02** |
| C-15 | Group membership | FR-003 v1 / US-1: owner "add or remove a member" directly | D08, D37 | Joining is invitation-only (email-bound, 7 days, single-use). Direct adding was removed. | spec.md, Group_Invitation_Design | None |
| C-16 | Member removal | "Membership has active or former state" (data-model v1) with no restrictions | D16, D17 | Removal and leaving are blocked by a non-zero balance or unresolved responsibilities. The owner must transfer first. Status `INACTIVE`. | Group_Membership_Design, BR-GRP-05–09 | DA-21, DA-22 |
| C-17 | Expense editing | (none in v1; "superseded record" mentioned only in Edge Cases) | D10, D25, D27 | Immutable versions. Approval restarts on edit. An approved expense's ledger effect is suspended during re-approval. | Expense_Versioning_Design, schema | DA-18 (**Q-01**), DA-32, DA-39 |
| C-18 | Rejection | Spec v1 US-2 scenario 4: "the submitter is informed" (implies further action possible) | D28 | Rejection is final. A retry needs a new expense. No rejection notification (D26 limits notifications to approval requests); the creator sees the status in the expense list. | Expense_Approval_Design | None |
| C-19 | Cancellation | (none in v1) | D14 | Direct cancel for never-approved pending expenses. Unanimous cancellation approval for approved ones. | Expense_Cancellation_Design | DA-17 (**Q-04**), DA-19, DA-20 |
| C-20 | Receipt storage | "single optional receipt image" (FR-009 v1); "local file receipt storage" (plan v1); Claude alternatives "copy into app data folder" | D13, D27 | Multiple (0–10) JPEG/PNG/PDF receipts in PostgreSQL `BYTEA`, versioned with expense versions. No S3 and no filesystem. | Receipt_Storage_Design, schema | DA-24 |
| C-21 | Reporting | FR-021 "custom reports" deferred from the MVP (spec v1); plan v1 "defined reports" | D05 | Filtered reports (date range, member, category, payment status) are in scope. No CSV. | Reporting_Design | DA-28 (**Q-03**) |
| C-22 | Financial concurrency | (not addressed in v1; ChatGPT R-07 "specify atomicity") | D19, D24 | One transaction per use case. Per-group pessimistic ledger lock. `@Version`. Idempotency key. Rollback semantics. | Transaction_Concurrency_Design | None |
| C-23 | Database and deployment | "Desktop-local persistence" (research v1); "single-machine?" (ADR open question 4) | D06, D12, D32 | PostgreSQL on RDS, Flyway, EC2, HTTPS, Secrets Manager. Single instance (DA-30). | AWS_Deployment_Design, Flyway_Migration_Plan | DA-30 |
| C-24 | Authentication | "exact authentication technology is outside this requirements document" (spec v1 Assumptions) | D11, D30 | Spring Security form login, BCrypt, server sessions, email verification, password reset. | Authentication_Design | DA-29, DA-41 |
| C-25 | Testing | NFR-007 v1 "display-critical workflows" (Swing GUI tests) | D33 | JUnit 5 + Mockito, Spring Boot Test + Testcontainers, MVC slice tests. No browser E2E. | Test_Strategy and all test docs | None |
| C-26 | Currency | (implicit) | D18 | USD only (DB checks). | schema, BR-EXP-03 | None |
| C-27 | Approval deadlines | (none) | D41 | No expiry or reminders. | Expense_Approval_Design | DA-01, DA-02 |
| C-28 | Former members as participants | C2: "only current active members may be selected" | D25 (compatible, stricter) | Retained and strengthened: the participant snapshot is frozen per version. | spec.md (C2 retained) | None |
| C-29 | Spec v1 open questions 1–3 | Approver roles; payment confirmation; desktop vs. web | D02/D35, D03, D01/D06 | Marked resolved in spec v2. | spec.md | None |

## 2. Consistency checks performed (2026-11-03)

| Check | Result |
| --- | --- |
| No current artifact describes Swing as the selected UI | **Pass**, with one documented exception: the constitution v1.0.0 (C-02), pending ratification. The historical review documents mention Swing as historical context under a superseded banner. |
| No current artifact describes Hexagonal as selected | Pass (ADR-001 Accepted = Layered + MVC; the historical documents are bannered) |
| Approval definition identical in spec, BR, design, schema, UML, tests | Pass: (participants ∪ payer) − creator, unanimous, frozen per version |
| Payment definition identical | Pass: debtor-only, full current obligation, `COMPLETED`, immutable, idempotent |
| Expense versioning identical | Pass: immutable versions, `effective_version_id`, `ux_version_one_live` |
| Group lifecycle identical | Pass: `ACTIVE → ARCHIVED` only; the archive preconditions match in BR-ARC-02, the design, UML 15/24/39, and the tests |
| All 41 decisions traced | Pass (see the [RTM](Requirements_Traceability_Matrix.md)) |

## 3. Open items for the customer or instructor

Q-01 to Q-05 are listed in the [Customer Decision Register Part C](Customer_Decision_Register.md#part-c-items-requiring-customer-confirmation).
