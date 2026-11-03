# Data Model: SplitSmart Core

## User Account

- Stable account identifier
- Authentication identity
- Display name
- Account state

Unique account identifiers are required. Financial views are limited by authorization.

## Group

- Stable group identifier
- Name
- Members
- Approval policy

Membership has active or former state. Former members remain attached to historical expense
records.

## Expense

- Stable expense identifier
- Group
- Creator
- Payer
- Positive amount with at most two decimal places
- Date and description
- Equal or percentage split method
- Explicit participants
- Optional receipt reference
- Review state

The payer may differ from the creator and must belong to the expense participants policy.

## Expense Share

- Expense identifier
- Participant
- Percentage or allocation basis
- Rounded monetary share
- Remainder ownership if applicable

Percentage shares total exactly 100 percent. Equal or percentage allocations round to cents
half-up; any undistributed cent remainder belongs to the payer.

## Approval Decision

- Expense
- Reviewer
- Decision
- Review step
- Timestamp

## Balance

A derived pairwise amount between users for approved effective expenses less recorded payments.
It is not independently authoritative when a source transaction changes.

## Payment

- Stable payment identifier
- Payer
- Recipient
- Amount
- Date
- Optional reference
- Confirmation state

## Notification

- Recipient
- Triggering expense
- Status
- Read state

## Report

- Scope
- Optional date or participant/group filters
- Selected expense, balance, and payment records
- Generated totals
