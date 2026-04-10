# Product Metrics Plan

Define a small but stable metrics set early so quality and value can be measured across iterations.

## 1. Event taxonomy template

Use event names in past tense, stable over time, and scoped to user intent:

- `auth_register_success`
- `auth_login_success`
- `dashboard_viewed`
- `dashboard_load_failed`
- `todo_created`
- `todo_toggled`
- `todo_deleted`

## 2. Core value metrics

- Activation rate: users reaching first meaningful screen after signup.
- Task creation rate: users who create at least one core entity.
- Task completion rate: ratio of completion actions over creation actions.
- Reliability signal: failures per active user session.

## 3. Sprint goal template (measurable)

- Goal statement:
- Metric target:
- Baseline (current):
- Target date:
- Guardrail metrics:
- Experiment/change hypothesis:
- Owner:

## 4. Operational notes

- Keep event names backward compatible for trend continuity.
- Track metric definitions in docs, not only code.
- For production, send events to durable storage (warehouse/analytics pipeline) instead of in-memory buffers.
