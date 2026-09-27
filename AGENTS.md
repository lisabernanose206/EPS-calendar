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

## Data persistence

Supabase is the only persistent source of business data. Do not store planning, roles or settings in localStorage, sessionStorage, IndexedDB or offline caches. Only authentication session data and its short-lived OAuth flow may use sessionStorage. Working drafts may live in page memory until the server confirms a save.

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

## Mandatory technical debt review before production

A technical debt review is a release prerequisite for every production publication, including urgent fixes. Do not deploy, trigger a publication workflow or declare a release ready before completing this review on the final candidate.

Technical debt means a concrete design, code, dependency or tooling limitation that increases maintenance cost or regression risk. The objective is to correct identified debt before release, not accumulate it in a dedicated TASKS.md backlog.

1. Review the repository's known limitations and the candidate changes, including their affected dependencies. Inspect unused dependencies and code, duplicated logic, circular imports and initialization order, redundant CSS overrides, temporary workarounds, data persistence, server-side security, test coverage, build/deployment configuration and documentation consistency.
2. Record concrete findings with their location, impact and required correction. An intentional CSS variant or justified architectural choice is not automatically debt; explain that conclusion rather than forcing cosmetic rewrites.
3. Resolve identified technical debt before production. Do not silently defer an unresolved finding to a future task, hide it by deleting documentation, or treat passing tests as proof that it is resolved. If a finding cannot be corrected within the authorized scope, report the blocker and keep the release blocked.
4. Validate the final candidate: web and standalone builds, applicable tests and security checks, UTF-8/accents, and desktop/mobile/print comparisons when relevant. Reassess changes made after the review before publication.
5. Keep a concise review result in the existing docs/MEMORY.md: candidate identifier (commit or exact working changes), scope inspected, findings and resolutions, validation evidence and remaining blockers. Keep architecture, design and security decisions in their existing documents. Do not create another Markdown report or a technical debt section in TASKS.md.
6. State whether this release prerequisite is satisfied. Use “no unresolved technical debt identified in the reviewed scope” only when supported by the review; never claim that an absolute absence of debt has been proven. Previously known unresolved debt must remain visible and blocks release until resolved.

This is a working rule for agents, not an automated CI enforcement mechanism. Do not assume that GitHub Pages or branch protection enforces it; verify the actual publication controls separately.

## Definition of Done

Before declaring significant work complete:

- the requested behavior works;
- relevant existing behavior has not been broken;
- applicable tests/build checks have been run;
- applicable security dimensions have been reviewed;
- documentation has been updated when the implementation changes a documented decision;
- remaining limitations or manual checks are clearly identified;
- for a production release, the mandatory technical debt review is completed on the final candidate, its findings are resolved and its validation evidence is recorded.
