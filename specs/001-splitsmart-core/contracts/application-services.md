# SplitSmart Application Service Contracts

These are internal application contracts, not external API definitions. They define capability
boundaries without prescribing class-level implementation.

## AccountService

- Register, authenticate, and return authorized account information.
- Inputs and outcomes must protect account uniqueness and unauthorized access.

## GroupService

- Create groups, manage active membership, and preserve former-member relationships.
- Only group participants permitted by policy may be selected for new expenses.

## ExpenseService

- Validate amounts, payer, participants, equal shares, and percentage shares.
- Submit pending expenses; return approval-required status without changing balances.
- Approve or reject expenses only for authorized reviewers.

## BalanceService

- Calculate pairwise balances from approved expenses and accepted recorded payments.
- Never expose a balance derived from unauthorized or failed records.

## PaymentService

- Record payer, recipient, date, amount, and optional reference.
- Apply confirmation policy before changing balances; prevent duplicate or over-payment handling
  until the unresolved settlement decision is confirmed.

## NotificationService

- Create notifications for applicable expense creation events without exposing unauthorized data.
- Record read state and link to the authorized expense.

## ReportService

- Build consistent expense, balance, and payment summaries for authorized scope.
- Apply supported date, group, and participant filters.
