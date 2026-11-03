<!--
Sync Impact Report
- Version change: unversioned template -> 1.0.0
- Modified principles: none (initial project constitution)
- Added sections: SplitSmart Customer Requirements; Implementation Constraints; Development Workflow
- Removed sections: none
- Follow-up TODOs: Ratification date is not recorded and remains TODO(ratification-date).
-->

# SplitSmart Constitution

## Core Principles

### I. Customer Requirements Are the Source of Product Intent

The customer-facing SplitSmart scope recorded in `UserRequirement.md` MUST remain the authoritative
source for product intent. It includes accounts, group management, expenses, notifications,
approvals, balance and payment tracking, reporting, and primary OS support. Implementation
approaches MUST NOT silently redefine, remove, or expand those requirements. This separation keeps
requested behavior distinct from the technical choices used to realize it.

### II. Java 21 and Maven Are Mandatory Platform Choices

The implementation MUST compile and run on Java 21. Maven MUST be the authoritative build,
dependency-management, packaging, and test execution tool for the project. Source and build
configuration MUST not depend on a newer Java release or an unapproved build system, so the
project remains reproducible in the course environment.

### III. Swing Provides the Human Interface

The desktop user interface MUST be implemented with Java Swing. GUI components, layout,
interaction handlers, and presentation state MUST remain focused on presenting application
behavior and collecting user input. Implementation of the SplitSmart desktop UI does not change
the customer requirements recorded separately in `UserRequirement.md`.

### IV. Object-Oriented Design Separates GUI from Business Logic

The design MUST use cohesive object-oriented domain, application, and presentation boundaries.
Business rules MUST reside outside Swing classes and MUST not depend on UI widgets or Swing
dialogs. The GUI MUST invoke application services through explicit interfaces or classes and
communicate through domain objects or data-transfer objects. This separation enables focused
reasoning, independent testing, and replacement of presentation code without reimplementing rules.

### V. Monetary Values Use BigDecimal

Every monetary amount, balance, payment, percentage-derived allocation, and aggregate that must
preserve exact decimal arithmetic MUST use `java.math.BigDecimal` rather than binary floating
point types. Calculations MUST define and consistently apply rounding mode and scale where
rounding is required. Currency precision MUST be validated by tests, especially when expenses are
split by percentage or otherwise distributed.

### VI. Verification Uses JUnit 5

All non-trivial business behavior and calculation rules MUST have automated JUnit 5 tests. Tests
MUST cover normal behavior and relevant boundary and failure cases, and MUST be executable with
Maven. Swing interaction tests are required when GUI behavior itself is a product requirement;
pure presentation composition MUST not be used as a substitute for domain-rule tests.

### VII. PlantUML Documents the Architecture

PlantUML MUST be used to communicate architecture, key domain relationships, and important
interactions. Diagrams MUST remain consistent with the implemented design and MUST identify
boundaries between GUI, application services, and business/domain classes. Generated documents
are explanatory artifacts, not a substitute for executable tests.

### VIII. Requirements and Design Artifacts Are Traceable

Every material product requirement MUST have a stable identifier in the specification artifacts.
Implementation tasks, domain behavior, tests, PlantUML elements, and acceptance evidence MUST
identify the requirement IDs they satisfy. Untraced implementation work MUST NOT be introduced
silently; it MUST be justified as an implementation decision or removed from scope. Traceability
records MUST be updated when requirements or acceptance criteria change.

### IX. AI Output Requires Human Review

AI-generated specifications, code, tests, diagrams, and review findings MUST be treated as drafts.
A human reviewer MUST verify correctness, completeness, scope compliance, security implications,
and whether claims are supported by repository evidence before work is accepted or committed.
Autonomous generation does not transfer accountability for project decisions to the AI system.

## Customer Requirements and Implementation Decisions

### Customer Requirements

Customer requirements are observable capabilities, constraints, or acceptance expectations
requested by the customer. The applicable baseline is maintained in `UserRequirement.md`; edits
to that file MUST not be made through this constitution. Requirements govern outcomes and MUST
remain independent of Java, Swing, Maven, or other implementation choices.

### Implementation Decisions

Implementation decisions select how the project fulfills customer requirements. Java 21, Maven,
JUnit 5, Java Swing, PlantUML, object-oriented separation, and exact monetary arithmetic are
project commitments. They are implementation constraints, not additions to the customer's feature
scope. Conflicts between these decisions and customer requirements MUST be recorded and resolved
through documented human review rather than silently overriding either side.

## Technology Constraints

- The project uses Java 21 and Maven as its build, dependency, and verification platform.
- The GUI uses Java Swing and MUST keep presentation concerns separate from business logic.
- Tests use JUnit 5.
- Architecture and interaction documentation uses PlantUML source files.
- Money calculations use `java.math.BigDecimal` with explicit scale and rounding policy.
- Requirements originate from `UserRequirement.md` and are tracked into later specifications and tasks.

## Development Workflow and Quality Gates

- Changes MUST begin with a stable requirement or implementation-decision rationale that identifies
  customer requirements and affected traceability IDs.
- Business rules MUST be specified and tested before implementation is considered complete;
  every behavior-affecting change MUST have relevant JUnit 5 coverage.
- PlantUML diagrams MUST be updated when architecture or message flow changes.
- Maven verification MUST pass before a change is accepted.
- A human MUST review AI-generated output against the constitution, requirements, tests, and
  repository evidence before acceptance or commit.

## Governance

This constitution supersedes informal project practices. Amendments require a documented proposal,
human approval, semantic-version update, and a synchronized update to impacted requirements,
templates, or workflow guidance. The ratification date MUST be supplied before the constitution
is approved as the governing project document.

The constitution uses semantic versioning: MAJOR for incompatible governance or principle
removal/redefinition, MINOR for a new principle or materially expanded section, and PATCH for
clarification, wording, or non-semantic refinement. Compliance review MUST occur before feature
acceptance and at every material architecture, dependency, or customer-requirement change.
Reviewers MUST verify that customer intent is traced, implementation constraints are satisfied,
tests pass through Maven, diagrams match the design, and AI output has received human review.

**Version**: 1.0.0 | **Ratified**: TODO(ratification-date): obtain the project approval date | **Last Amended**: 2026-10-27
