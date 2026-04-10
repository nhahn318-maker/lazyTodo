# Definition of Done

Use this checklist for every issue/PR before marking work complete.

## 1. Product correctness

- Feature behavior matches issue acceptance criteria.
- Edge cases and error states are handled with user-friendly messaging.
- No known regressions in critical user flows.

## 2. Engineering quality

- API contract remains consistent (`docs/openapi.yaml` updated when needed).
- Error responses use normalized JSON envelope (`error.code/message/details/requestId`).
- Code is type-safe and follows project conventions.

## 3. Test completeness

- Unit/integration tests cover new behavior.
- Critical-path validations pass:
  - backend: contract + tests + build
  - frontend: lint + typecheck + tests + build
  - runtime smoke: backend health + key API checks
- Browser e2e coverage is run for release-sensitive changes.

## 4. Evidence and documentation

- PR description includes:
  - acceptance criteria mapping
  - test evidence
  - UI screenshot/video for UI changes
  - risk + rollback plan
- Human checkpoints in `docs/APPROVALS.md` are updated (PRD/HLD/TEST_PLAN as applicable).
- README/docs updated for new setup or behavior changes.

## 5. Operational readiness

- Deployment impact is understood (env vars, ports, migrations).
- Observability/logging remains useful for incident triage.
- Rollback plan is explicit and actionable.
