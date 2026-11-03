# Research: SplitSmart Architecture

## Decision: Layered desktop architecture with MVC presentation

**Rationale**: It satisfies GUI/business separation, supports independent JUnit 5 testing, and
limits coupling between presentation and domain rules without adding unneeded distributed-system
layers.

**Alternatives considered**: Tightly coupled desktop application; MVC alone.

## Decision: Desktop-local persistence behind repositories

**Rationale**: The MVP must operate without unresolved authentication or hosting decisions, and
repository boundaries protect domain rules from a storage choice while enabling integration tests.

**Alternatives considered**: UI-directed file access; direct database access from controllers.
Both would violate separation and make domain behavior difficult to verify.

## Decision: BigDecimal for money and percentages

**Rationale**: Exact decimal arithmetic is required by the constitution. Amount input accepts at
most two decimal places; computed shares are rounded to cents with half-up rounding; the
undistributed remainder is assigned to the payer.

**Alternatives considered**: Binary floating point, integer minor units. Integer minor units are
a possible representation but BigDecimal is explicitly required and can represent percentages
without binary rounding.

## Decision: Pending expense decisions and payment confirmation remain policy-sensitive

**Rationale**: The specification records unresolved questions for multi-step approval, payment
confirmation, authentication method, and notification delivery. The architecture keeps these as
configured application policies rather than hard-coded UI behavior.

**Alternatives considered**: Hard-coding one-review and immediate-payment behavior. This would
silently invent answers and is therefore deferred.
