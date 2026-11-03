# Test Strategy

| Decisions | D33 (JUnit 5 + Mockito; Spring Boot Test + Testcontainers PostgreSQL; no browser E2E), D19, D09 |
| --- | --- |
| Requirements | NFR-007, NFR-001, NFR-009, Constitution VI |
| Status | Specification only. **No tests are implemented in this phase.** |

## 1. Test levels

| Level | Scope | Tools | Location (planned) | Runs in |
| --- | --- | --- | --- | --- |
| **Unit: domain** | Value objects, allocation, balances, settlement planner, state machines, policies | JUnit 5 (`@ParameterizedTest`, `@Nested`), plain Java | `src/test/java/.../domain` | `mvn test` (Surefire) |
| **Unit: application** | Service orchestration, authorization, audit and notification calls, outcome mapping | JUnit 5 + Mockito (`@ExtendWith(MockitoExtension.class)`); repositories and `EmailService` mocked; fixed `Clock` | `.../application` | `mvn test` |
| **Unit: architecture** | Dependency rules | ArchUnit (if approved) or a jdeps/reflection scan | `.../architecture` | `mvn test` |
| **Slice: MVC controllers** | Request mapping, binding, validation messages, view names, redirects, flash messages, CSRF, security rules | `@WebMvcTest` + `MockMvc` + `@MockitoBean` services + `spring-security-test` | `.../web` | `mvn test` |
| **Integration: persistence** | Flyway migrations, entity mappings (`ddl-auto=validate`), constraints, triggers, ledger view, grants | `@DataJpaTest` (`replace = NONE`) + Testcontainers `PostgreSQLContainer("postgres:16")` | `.../infrastructure` (`*IT`) | `mvn verify` (Failsafe) |
| **Integration: full stack** | Transactions, rollback, authorization end to end, concurrency, after-commit email | `@SpringBootTest` + Testcontainers + `MockMvc` + `MockEmailService` | `.../it` (`*IT`) | `mvn verify` |
| **Acceptance** | Each decision D01–D41 is verified through the scenarios above | Mapped in the [Acceptance_Test_Matrix](Acceptance_Test_Matrix.md) | n/a | `mvn verify` + manual review items |

Browser end-to-end automation (Selenium, Playwright) is **out of scope** (D33). Thymeleaf rendering is verified through MockMvc model and view assertions plus HTML content checks (`content().string(containsString(...))`).

## 2. Test documents

| Document | IDs |
| --- | --- |
| [Unit_Test_Specification](Unit_Test_Specification.md) | UT-MON, UT-SPL, UT-APR, UT-VER, UT-CAN, UT-BAL, UT-SET, UT-PAY, UT-GRP, UT-INV, UT-CAT, UT-RCP, UT-AUTH, UT-NOT, UT-RPT, UT-AUD, UT-TIME, UT-ARCH |
| [Integration_Test_Specification](Integration_Test_Specification.md) | IT-DB, IT-TX, IT-AUTHZ, IT-MVC, IT-EMAIL, IT-RPT |
| [Financial_Edge_Cases](Financial_Edge_Cases.md) | FIN-01–FIN-20 |
| [Security_Test_Cases](Security_Test_Cases.md) | SEC-01–SEC-25 |
| [Concurrency_Test_Cases](Concurrency_Test_Cases.md) | CON-01–CON-12 |
| [Acceptance_Test_Matrix](Acceptance_Test_Matrix.md) | AT-D01–AT-D41 |

## 3. Coverage required by D33

| D33 area | Covered by |
| --- | --- |
| Business rules | UT-APR, UT-VER, UT-CAN, UT-GRP, UT-INV, UT-CAT, UT-NOT |
| Financial precision | UT-MON, UT-SPL, UT-BAL, UT-SET, UT-PAY, FIN-* |
| Approval and cancellation | UT-APR, UT-CAN, CON-06–CON-08 |
| Database mappings and constraints | IT-DB-02–IT-DB-15 |
| Flyway migrations | IT-DB-01, IT-DB-13 |
| Transactions and rollback | IT-TX-01–IT-TX-05 |
| Authorization and group isolation | IT-AUTHZ-*, SEC-* |
| Concurrency and optimistic locking | CON-01–CON-12 |
| MVC controllers | IT-MVC-01–IT-MVC-08 |

## 4. Test data and fixtures

- Standard actors: **Alice = id 1, Bob = 2, Carol = 3, David = 4, Erin = 5** (ascending IDs matter for tie-breaking). In Testcontainers, identity values are forced with `OVERRIDING SYSTEM VALUE` in fixtures, or the tests look IDs up and sort them.
- `TestClock`: a fixed `Instant` of `2026-11-03T15:00:00Z`, advanceable.
- Builders: `ExpenseDraftBuilder`, `GroupFixture`, `LedgerFixture` (creates approved expenses and payments directly through services, so all invariants are exercised).
- Each integration test class gets a fresh schema. Testcontainers reuse is allowed, but tables are truncated by the owner role, because the application role has no `DELETE` grant.

## 5. Quality gates

| Gate | Threshold |
| --- | --- |
| `mvn verify` | All tests green (required before acceptance; Constitution workflow) |
| Line coverage for `domain.finance`, `domain.policy`, `domain.model` | ≥ 95% (JaCoCo) |
| Branch coverage for the application services | ≥ 80% |
| FIN-* and CON-* | 100% pass, no `@Disabled` |
| Mutation testing for `SplitAllocator` and `SettlementPlanner` | Optional (PIT), recommended |

## 6. Determinism and flakiness controls

- No `Thread.sleep` for synchronization. Concurrency tests use `CountDownLatch` / `CyclicBarrier` and two explicit transactions (`TransactionTemplate`) with a "lock acquired" signal.
- Fixed `Clock`. No real network: SES is mocked in all automated tests, and IT-EMAIL-02 uses a mocked `SesV2Client`.
- Property-style tests (UT-SPL-10, UT-BAL-03, UT-SET-08) use seeded `Random(42)` and 1 000 iterations.
