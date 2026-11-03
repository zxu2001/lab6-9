# Quickstart Validation: SplitSmart Core

## Primitives

- Java 21
- Maven
- JUnit 5

## Build and Test

```text
mvn clean verify
```

## Validation Scenarios

1. Create an account and group, then sign in and verify only permitted information is displayed.
2. Create an expense with a different payer, current active participants, two-decimal maximum,
   and equal shares; verify approval is required before balances change.
3. Create a percentage split totaling exactly 100 percent; verify the expense total equals the
   sum of all participant shares.
4. Verify half-up cent rounding assigns the undistributed remainder to the payer.
5. Reject zero, negative, malformed, and more-than-two-decimal-place expense amounts.
6. Remove a participant from a group and verify historical expense and balance records remain.
7. Record a payment and verify the applicable pairwise balance decreases exactly once.
8. Generate expense, balance, and payment summaries and compare them with independent totals.
9. Run notifications or delivery behavior only after the unresolved policy decisions are confirmed.
