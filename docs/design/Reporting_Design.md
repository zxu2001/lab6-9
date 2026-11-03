# Reporting Design

| Decisions | D05, D21, D22, D03, D40 |
| --- | --- |
| Requirements | FR-018–FR-021, FR-049, NFR-005 |
| Rules | BR-RPT-01–05 |
| Assumptions | DA-28, DA-31 |
| UML | [40_Sequence_Generate_Report](../uml/40_Sequence_Generate_Report.puml) |
| Tests | UT-RPT-01–08, IT-RPT-01, SEC-22, AT-D05, AT-D21 |

## 1. Report types

| Type | Rows | Totals |
| --- | --- | --- |
| **Expense report** | One row per expense (the version per mode, below): date, description, category, payer, amount, status, version number, the selected member's share (if a member filter is set) | Σ amount; Σ selected member's share; count by status |
| **Balance report** | One row per member: net balance in the group (`EFFECTIVE` mode), total paid as payer, total share, payments sent and received; settlement status `SETTLED` / `OUTSTANDING` | Σ nets (always 0.00), shown as a consistency check |
| **Payment report** | One row per completed payment: date, debtor, creditor, amount, displayed amount, adjusted flag, note | Σ amount; count |
| **Cross-group overview** | Per group the user can read: their own net, owed-to-me, I-owe, pending approvals awaiting me | **No cross-group sum of obligations** (D21). Figures appear side by side, labelled per group. |

All reports are on screen (Thymeleaf tables). There is no CSV or file export (D05).

## 2. Filters (D05)

| Filter | Applies to | Semantics |
| --- | --- | --- |
| Date range (from, to; inclusive; either open) | Expense: the `expense_date` of the reported version. Payment: `payment_date`. Balance: postings whose `business_date` falls in the range (a "movement in period" view); net-to-date is shown separately. | Validated: from ≤ to |
| Group member | Expense: the member is payer or participant of the reported version. Payment: the member is debtor or creditor. Balance: restricts rows to that member. | The member must be (or have been) in the group |
| Expense category | Expense report (and the expense-derived columns of the balance report) | Category ID; includes inactive categories for history |
| Payment status | Payment report: `COMPLETED` (the only status in the MVP: D03/D40). Balance report: member settlement status `SETTLED` (net = 0) / `OUTSTANDING` (net ≠ 0) (DA-28, Q-03). | Enumerated values |
| Mode (`EFFECTIVE` default / `HISTORY`) | Expense report | See §3 |
| Expense status (`HISTORY` mode only) | Expense report | `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED` |

## 3. Effective versus historical records (§6.9)

| Mode | Includes | Version used | Reconciles with balances? |
| --- | --- | --- | --- |
| `EFFECTIVE` | Only expenses in status `APPROVED` (through `effective_version_id`) and all completed payments | Effective version | **Yes**: report totals equal the `BalanceService` figures for the same filters (NFR-005, UT-RPT-07) |
| `HISTORY` | All expenses in every status. Optional "include superseded versions" shows every version row. | Current version (or all versions) | **No**: labelled "Historical view: includes records that do not affect balances" |

Payments are always included in both modes (they are final and always effective).

## 4. Interface

```
ReportService                                                               // TX(RO)
  ReportResult generateReport(long actor, ReportCriteria criteria)
  CrossGroupOverview getOverview(long actor)
ReportCriteria(long groupId, ReportType type, ReportMode mode, LocalDate from, LocalDate to,
               Long memberUserId, Long categoryId, PaymentStatusFilter paymentStatus,
               Set<ExpenseStatus> expenseStatuses, boolean includeSupersededVersions)
ReportResult(ReportType type, ReportCriteria appliedFilters, List<ReportRow> rows,
             ReportTotals totals, boolean empty, Instant generatedAt)
```

## 5. Processing

1. `access = authz.requireReadAccess(actor, groupId)`. If `access.involvementOnly` (an inactive member), an implicit filter restricts rows to records involving the actor (DA-31).
2. Validate the criteria (date order, member/category belong to the group, filter-type compatibility). Errors are `ValidationException` on the filter form.
3. Query through the read repositories (`ReportQueryRepository`, native SQL over `expenses` / `expense_versions` / `expense_allocations` / `payments` / `v_ledger_postings` with group-scoped predicates). Pagination is 100 rows per page, but totals are computed over **all** matching rows.
4. Money totals are summed in SQL `NUMERIC` and mapped to `Money`. Domain cross-check: in `EFFECTIVE` balance reports, Σ nets = 0 is asserted.
5. Return a `ReportResult` that echoes `appliedFilters` (shown above the table, BR-RPT-05). An empty result renders "No records match these filters."

## 6. Performance

Indexes: `ix_version_group_date`, `ix_payment_group_date`, `ix_allocation_participant`, `ix_version_category`. Reports run read-only, with `statement_timeout = 15s`. Expected volumes are within NFR-017.
