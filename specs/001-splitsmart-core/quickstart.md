# Quickstart Validation: SplitSmart Core (v2, 2026-11-03)

> v2 replaces the v1 desktop quickstart. The application is **not implemented yet**. This file defines how the finished implementation will be validated.

## Prerequisites (future implementation)

- Java 21 (Amazon Corretto or Temurin), Maven 3.9+
- Docker (for Testcontainers PostgreSQL 16)
- No AWS account is needed for local runs: `splitsmart.email.provider=mock`

## Build and test

```text
mvn clean verify          # unit (Surefire) + integration with Testcontainers (Failsafe)
mvn spring-boot:run -Dspring-boot.run.profiles=dev   # local run against a local/containers PostgreSQL
```

## Validation scenarios (map to [Acceptance_Test_Matrix](../../docs/testing/Acceptance_Test_Matrix.md))

1. Register → open the verification link from the mock mailbox → sign in. Request a reset for unknown and known emails and get identical responses (AT-D30).
2. Create a group, issue an invitation, and accept it with the matching verified account. A wrong account is refused and the invitation stays pending (AT-D08, AT-D37).
3. Create a $100.00 equal expense over three members. Shares are 33.34/33.33/33.33, and only the payer and participants other than the creator must approve (AT-D09, AT-D35).
4. Create $0.02 / 3 and a percentage split at 99.99%. The first gives 0.01/0.01/0.00. The second is rejected (AT-D09).
5. Alice pays $90 for Bob and Carol. Bob and Carol owe $45 each, and Alice owes $0 (AT-D20).
6. Reject a pending expense. It is final and cannot be edited (AT-D02, AT-D28).
7. Edit an approved expense. Balances exclude it until re-approval (AT-D10).
8. Request cancellation of an approved expense. It is still effective while pending and cancelled after unanimous approval. Earlier payments are not reversed (AT-D14).
9. View balances and the plan. Record a settlement from a stale page: the current amount is used and the adjustment is shown. Submitting twice creates one payment (AT-D23, AT-D24).
10. Try to record a payment as the creditor, and try to edit a payment. Both are impossible (AT-D39, AT-D40).
11. Generate filtered reports (date, member, category, payment status). `EFFECTIVE` totals equal the balances (AT-D05).
12. Archive a settled group. It becomes read-only, with no reopening (AT-D29, AT-D36).
