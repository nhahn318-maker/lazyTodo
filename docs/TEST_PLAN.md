# Test Plan

## Scope

This plan covers the Phase 2 backend and frontend delivered for `lazyTodo` and defines the minimum CI quality gates required for Phase 3 test hardening.

In scope:

- backend contract and request validation
- frontend task workflow behavior against mocked API responses
- repo-level CI checks that block broken builds from merging

Out of scope for this issue:

- browser automation beyond a documented e2e seed strategy
- performance, load, accessibility, and visual-regression automation
- non-demo authentication backends or persistent storage

## Test Strategy

### Unit

Backend unit scope:

- `src/domain/taskService.js`
  - task creation defaults
  - title validation
  - completion toggle semantics
  - ownership filtering and missing-task behavior

Frontend unit scope:

- `frontend/src/api.ts`
  - request method, headers, credentials, and payload mapping
  - API error normalization

Current status:

- frontend API client coverage exists in [frontend/src/api.test.ts](/home/nhtony318/.worktrees/lazytodo/laz-5/frontend/src/api.test.ts)
- backend behavior is currently covered mostly through API-level integration tests rather than isolated domain unit tests

### Integration

Backend integration scope:

- HTTP contract coverage for `/api/v1/session`
- authenticated create/list/toggle/delete task flow
- unauthorized access handling
- validation envelopes and request ids
- cross-user not-found isolation

Frontend integration scope:

- app boot sequence from session check to task list render
- create, toggle, and delete flows with optimistic UI updates only where implemented
- anonymous-session empty state

Current status:

- backend integration coverage exists in [test/api.test.js](/home/nhtony318/.worktrees/lazytodo/laz-5/test/api.test.js)
- frontend integration coverage exists in [frontend/src/App.test.tsx](/home/nhtony318/.worktrees/lazytodo/laz-5/frontend/src/App.test.tsx)

### E2E

Phase 3 minimum e2e strategy:

1. Start backend on `http://127.0.0.1:3000`.
2. Start frontend against that backend.
3. Seed the authenticated browser session with `sid=sid_demo_user`.
4. Verify the happy path:
   - load tasks
   - create a task
   - toggle a task complete
   - delete a task
5. Verify one negative path:
   - anonymous user sees the sign-in-required state

Current status:

- no Playwright config or `e2e:ci` script exists yet, so CI intentionally skips browser e2e until that harness is introduced
- the workflow already contains an e2e job scaffold and now reports a clean skip instead of assuming a `backend/` directory layout

## CI Quality Gates

Minimum blocking checks for pull requests to `main`:

- PR template structure validation
- backend `npm test`
- frontend `npm run lint`
- frontend `npm run typecheck`
- frontend `npm run test`
- frontend `npm run build`
- backend runtime smoke check via `GET /health`

Local repo gate:

```bash
bash ./.ao-tools/quality-gate.sh --skip-install
```

Strict phase gate:

```bash
bash ./.ao-tools/phase-gate.sh --phase phase:test --issue 5
```

## Risks And Coverage Gaps

- The backend domain service lacks direct unit tests, so failures are currently caught one layer later through HTTP integration tests.
- Browser e2e remains a planned gap until Playwright is added.
- The current repository uses in-memory persistence only, so no persistence-failure coverage exists yet.

## Bug List

Fixed in this issue:

- CI/runtime quality gate expected a `backend/` folder that does not exist in this repository.
- CI smoke checks targeted `http://localhost:4000/health`, but the app runs on port `3000` and had no health endpoint.
- Repo-level quality gate attempted `npm ci` in the root project even when no lockfile or dependencies existed.

No additional bug-routing issues were created because each discovered defect was directly within the scope of issue `#5` and was fixed here.
