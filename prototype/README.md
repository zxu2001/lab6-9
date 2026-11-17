# SplitSmart — demo prototype

An interactive Next.js prototype of SplitSmart's core journey: dashboard → group → add expense →
approve/reject → settle up → report. Data persists to SQLite through Prisma.

> **This is a demo, not the production system.** The production design (Spring Boot, PostgreSQL,
> Spring Security, SES) is in [`docs/architecture`](../docs/architecture/Architecture_Overview.md).
> In this prototype:
>
> - **Authentication is simulated.** Pick the acting user from the header menu; it is just a cookie.
> - **Notifications are in-app only** (approval requests). No email or push is sent.
> - **Payments are records only.** No money moves and no payment provider is involved.

## Quick start

```bash
cd prototype
npm install          # also runs `prisma generate`
npm run db:setup     # generate client, apply migrations, seed demo data (safe to re-run)
npm run dev          # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run db:migrate` | `prisma migrate deploy`: applies pending migrations. Never resets data. |
| `npm run db:seed` | Idempotent demo seed. It only inserts missing demo rows and never overwrites or deletes. |
| `npm run db:setup` | generate + migrate + seed |
| `npm run lint` / `npm run build` / `npm test` | ESLint / production build / Vitest unit tests for the money logic |

The database is `prisma/dev.db` by default. Set `DATABASE_URL="file:./path/to.db"` (e.g. in `.env`) to
use another file. Both `prisma.config.ts` (Prisma 7 config) and the app read it.

## Demo script

1. **Dashboard** (`/`): you are Alice. See per-group balances, recent activity, and 2 pending approvals.
2. **Groups → Maple Street Apartment**: switch between the Expenses, Balances, Members, and Payments tabs.
3. **+ Add expense**: equal or percentage split, with a live share preview. Required approvers are
   (participants ∪ payer) − you. If only you are involved, it is approved automatically.
4. **Approvals**: approve, or reject with a reason. An expense affects balances only after
   *every* required approver approves. Switch users (e.g. to Bob) to approve as them.
5. **Settle up**: the debtor records a full settlement of what they currently owe. On the
   settle page, "Act as …" switches to a member who owes money. Balances update immediately.
6. **Reports**: filter by date range, group, type, and expense status. Per-group totals are shown
   side by side and are never netted across groups.

## Implementation notes

- **Money is integer cents** (`Int` columns), and percentages are integer basis points. Input is
  parsed from strings without floating point ([`src/lib/money.ts`](src/lib/money.ts)).
- **Splits** follow BR-SPL-02/03: leftover cents are allocated deterministically, so shares always
  add up to the amount ([`src/lib/split.ts`](src/lib/split.ts)).
- **Balances are derived**, never stored. They are recomputed from approved expenses and payments,
  and a greedy plan suggests settlements ([`src/lib/balances.ts`](src/lib/balances.ts)).
- **Server-only data access.** Prisma lives in `src/lib/db.ts` (`import "server-only"`). All mutations
  are Server Actions in [`src/app/actions.ts`](src/app/actions.ts) that re-validate input and
  membership and run in a transaction. Payments recompute the obligation inside the
  transaction, so a stale displayed amount is corrected.
- **Prisma 7**: the `prisma-client` generator outputs to `src/generated/prisma` (git-ignored), and
  the client connects through `@prisma/adapter-better-sqlite3`. Migrations are in
  `prisma/migrations` (`0_init` baselines the pre-existing `EnvironmentCheck` table).
- `next.config.ts` allows the `localhost`/`*.app.github.dev` origins that GitHub Codespaces port
  forwarding produces, so Server Actions work in the devcontainer.
