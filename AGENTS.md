# AGENTS.md — Project Instructions

## Purpose

This file defines how Codex should work on this project.
Project-specific knowledge is stored in `/docs`.

Before making a significant change, inspect the relevant documentation rather than making assumptions.

## Documentation map

- `docs/PRD.md` — product requirements, users, scope and business needs.
- `docs/ARCHITECTURE.md` — technical architecture, components, data flows and deployment.
- `docs/DESIGN.md` — UI/UX principles and interface conventions.
- `docs/TASKS.md` — current priorities, backlog and validation tasks.
- `docs/MEMORY.md` — current project state and important previous decisions.
- `docs/SECURITY.md` — security requirements and project security decisions.

## Working rules

1. Understand the existing implementation before changing it.
2. Prefer simple, maintainable solutions over unnecessary complexity.
3. Do not silently contradict documented product or architecture decisions.
4. Preserve existing working functionality unless the requested change explicitly replaces it.
5. For significant changes, identify affected components and possible regressions.
6. Run available tests and build checks after implementation.
7. Update the relevant documentation when a significant product, architecture, security or implementation decision changes.
8. Keep `TASKS.md` and `MEMORY.md` useful and concise rather than turning them into exhaustive logs.
9. Keep a single project `README.md` at the repository root. Keep exactly the six documented Markdown files in `docs/`; integrate audits, fixes and technical guides into them instead of creating additional documents. Third-party package documentation in `node_modules/` is not project-authored documentation.

## Architecture / repository structure gate

When creating, moving or reorganizing files/directories, read the structure section in `docs/ARCHITECTURE.md`.

- Follow the documented structure when it fits the selected framework.
- Reuse existing directories before inventing new ones.
- Do not perform mass reorganizations only for cosmetic standardization.
- If a structural change is technically justified, assess its impact and document the decision.

## UX / design gate

When a change affects the user interface or user journey, read `docs/DESIGN.md` before implementation.

Review the applicable UX principles defined there, especially:
- Fitts's Law;
- Hick's Law;
- Zeigarnik Effect;
- Jakob's Law;
- Goal-Gradient Effect;
- Von Restorff Effect;
- Miller's Law.

Apply them as context-sensitive heuristics, not as rigid rules. Prioritize the real business workflow and user context.

## Security gate

For every new feature or significant modification, determine whether it affects one or more of the six security dimensions defined in `docs/SECURITY.md`:

1. Authentication
2. Authorization
3. Encryption
4. Logging
5. Testing
6. Data Processing

When security may be affected, read `docs/SECURITY.md` before implementation and verify the applicable dimensions before considering the work complete.

Do not silently bypass a documented security requirement. If a requested implementation conflicts with a security requirement, identify the conflict and propose an implementation that preserves the requirement.

## Definition of Done

Before declaring significant work complete:

- the requested behavior works;
- relevant existing behavior has not been broken;
- applicable tests/build checks have been run;
- applicable security dimensions have been reviewed;
- documentation has been updated when the implementation changes a documented decision;
- remaining limitations or manual checks are clearly identified.
