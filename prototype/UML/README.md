# SplitSmart prototype – UML

PlantUML sources describing the prototype in `../src` and `../prisma`.

| File | Diagram | Shows |
|---|---|---|
| `01-domain-er.puml` | ER / class | Database tables, keys, enums, relations, cascades |
| `02-architecture-components.puml` | Component | Client components → server actions / pages → lib → Prisma → SQLite |
| `03-domain-logic-classes.puml` | Class | Pure logic modules (`split`, `balances`, `money`, `queries`) |
| `04-expense-state.puml` | State | `Expense.status` lifecycle driven by approvals |
| `05-seq-create-expense.puml` | Sequence | `createExpense` validation, split, transaction |
| `06-seq-decide-expense.puml` | Sequence | `decideExpense` approve/reject flow |
| `07-seq-record-payment.puml` | Sequence | `recordPayment` with in-transaction recompute |
| `08-activity-balances.puml` | Activity | Net balance + greedy settlement algorithm |
| `09-use-cases.puml` | Use case | What a demo user / approver can do |

Render: VS Code "PlantUML" extension (Alt+D), or
`java -jar plantuml.jar UML/*.puml` / `plantuml -tsvg UML/*.puml`.
