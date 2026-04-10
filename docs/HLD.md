# High-Level Design

## 1. Purpose

This document defines the Phase 1 high-level design for `lazyTodo` based on the product scope in [docs/PRD.md](/home/nhtony318/.worktrees/lazytodo/laz-2/docs/PRD.md).

The goal of this phase is to establish implementation-ready architecture boundaries and behavioral contracts for a minimal personal task application. This is a design artifact only and does not introduce production code.

## 2. Design principles

- Keep the system optimized for a single-user personal task flow.
- Preserve a clean separation between UI, API, domain logic, and persistence.
- Make API behavior explicit enough for parallel frontend and backend work.
- Use a normalized error envelope from the start to reduce future contract churn.
- Choose an auth model that supports initial single-user operation and future account-based expansion.

## 3. Scope alignment

This HLD covers:

- component boundaries
- domain model
- authentication and authorization assumptions
- error model
- API surface needed for create, list, update completion state, and delete

This HLD does not cover:

- deployment-specific infrastructure
- analytics pipeline implementation
- team collaboration features
- reminders, recurring tasks, tags, or priorities

## 4. System context

Phase 1 assumes a web application with a browser-based client talking to an HTTP JSON API backed by persistent storage.

Primary user journey:

1. User opens the app.
2. Client resolves the current user session.
3. Client fetches tasks for the signed-in user.
4. User creates, completes, restores, and deletes tasks.
5. API persists changes and returns normalized responses.

## 5. Proposed architecture

### 5.1 Logical components

1. Web client
   - Renders the task list and form interactions.
   - Calls the task API over HTTPS.
   - Maps API validation and server errors to user-facing messages.

2. API service
   - Owns request validation, authentication checks, authorization decisions, and response formatting.
   - Exposes versioned REST endpoints under `/api/v1`.

3. Task domain module
   - Encapsulates task lifecycle rules.
   - Enforces invariants such as non-empty title and user ownership.

4. Persistence module
   - Stores users, sessions, and tasks.
   - Supports filtering by owner and completion status.

5. Observability layer
   - Emits request logs, request identifiers, and product events aligned with [docs/PRODUCT_METRICS.md](/home/nhtony318/.worktrees/lazytodo/laz-2/docs/PRODUCT_METRICS.md).

### 5.2 Component boundaries

#### Web client boundary

- Responsible for presentation state only.
- Must not own business rules beyond basic form constraints.
- Treats API responses as the source of truth for persisted task state.

#### API boundary

- Accepts authenticated HTTP requests.
- Performs schema validation before invoking domain logic.
- Returns normalized success and error envelopes.

#### Domain boundary

- Accepts validated commands such as `CreateTask`, `ListTasks`, `UpdateTaskCompletion`, and `DeleteTask`.
- Rejects state transitions that violate invariants.
- Remains independent from transport and UI concerns.

#### Persistence boundary

- Persists canonical task records.
- Does not embed presentation-specific decisions.
- Supports optimistic implementation choices later, but the contract should not depend on them.

## 6. Runtime flow

### 6.1 Read flow

1. Client calls `GET /api/v1/tasks`.
2. API authenticates the request and resolves `userId`.
3. API queries tasks owned by the user.
4. API returns active tasks first, then completed tasks, ordered by `createdAt` descending within each group.

### 6.2 Create flow

1. Client submits title to `POST /api/v1/tasks`.
2. API validates the payload.
3. Domain creates a new active task for the authenticated user.
4. Persistence stores the record.
5. API returns `201 Created` with the stored task.
6. Product event `todo_created` is emitted.

### 6.3 Toggle completion flow

1. Client sends `PATCH /api/v1/tasks/{taskId}` with `completed`.
2. API validates the path and payload.
3. Domain verifies task ownership and updates completion state.
4. Persistence saves `completed` and `completedAt`.
5. API returns the updated task.
6. Product event `todo_toggled` is emitted.

### 6.4 Delete flow

1. Client sends `DELETE /api/v1/tasks/{taskId}`.
2. API verifies ownership.
3. Persistence deletes the task.
4. API returns `204 No Content`.
5. Product event `todo_deleted` is emitted.

## 7. Data model

### 7.1 Entities

#### User

Represents the account that owns tasks.

Core fields:

- `id`: stable unique identifier
- `email`: unique login identifier when account auth is enabled
- `createdAt`: timestamp

#### Session

Represents an authenticated browser session.

Core fields:

- `id`: stable unique identifier
- `userId`: owning user identifier
- `expiresAt`: timestamp
- `createdAt`: timestamp

#### Task

Represents a single personal to-do item.

Core fields:

- `id`: stable unique identifier
- `userId`: owner identifier
- `title`: trimmed non-empty string, max 200 characters
- `completed`: boolean
- `completedAt`: nullable timestamp
- `createdAt`: timestamp
- `updatedAt`: timestamp

### 7.2 Invariants

- A task belongs to exactly one user.
- A task title must be non-empty after trimming whitespace.
- `completedAt` must be non-null when `completed = true`.
- `completedAt` must be null when `completed = false`.
- Users can read and mutate only their own tasks.

### 7.3 Storage notes

- Primary query pattern is list-by-user.
- Recommended indexes for later implementation:
  - tasks by `userId`
  - tasks by `userId, completed, createdAt`
- Soft delete is not required in the first release; hard delete is acceptable.

## 8. Authentication and authorization

### 8.1 Decision

Phase 1 assumes authenticated single-user operation for the API contract, even though the PRD leaves room for anonymous local-first exploration. This is the better long-term contract because it prevents a later breaking shift in ownership semantics.

### 8.2 Auth model

- Session-based authentication using secure HTTP-only cookies.
- Session resolution occurs before task handlers execute.
- Anonymous requests to task endpoints are rejected with `401 Unauthorized`.

### 8.3 Authorization model

- No multi-role model is required.
- All task access is owner-only.
- Any attempt to access another user's task returns `404 Not Found` to avoid leaking resource existence.

### 8.4 Future compatibility

This design still supports a development-mode stub session or seeded demo account without changing endpoint shapes.

## 9. Error model

### 9.1 Normalized error envelope

All non-2xx responses must use:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "title",
        "issue": "required"
      }
    ],
    "requestId": "req_123"
  }
}
```

### 9.2 Error categories

- `validation_error`: malformed or semantically invalid input
- `unauthorized`: no valid session
- `not_found`: task or route not found, including cross-user access attempts
- `conflict`: reserved for future concurrent update semantics
- `rate_limited`: reserved for future abuse controls
- `internal_error`: unexpected failure

### 9.3 Error handling rules

- Include a stable `code` for machine handling.
- Keep `message` safe for user display or simple UI mapping.
- Include `details` only when it adds actionable context.
- Always include `requestId` for traceability.

## 10. Non-functional design decisions

### 10.1 Performance

- The initial target is personal-list scale, not bulk task management.
- Single-request fetch for the task list is sufficient in Phase 1.
- No pagination is required initially.

### 10.2 Accessibility

- The client should expose semantic controls for task creation and completion.
- Validation feedback should map directly to invalid input fields.

### 10.3 Observability

- Every API response should include or be traceable by `requestId`.
- Task lifecycle endpoints should emit the event names already defined in [docs/PRODUCT_METRICS.md](/home/nhtony318/.worktrees/lazytodo/laz-2/docs/PRODUCT_METRICS.md).

### 10.4 Security

- Session cookies should be HTTP-only and secure in production.
- Input validation must run server-side even if the client performs local checks.
- Task identifiers must be unguessable enough to avoid trivial enumeration.

## 11. API surface summary

Phase 1 requires the following endpoint set:

- `GET /api/v1/session`
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `PATCH /api/v1/tasks/{taskId}`
- `DELETE /api/v1/tasks/{taskId}`

Detailed request and response contracts are defined in [docs/API_CONTRACT.md](/home/nhtony318/.worktrees/lazytodo/laz-2/docs/API_CONTRACT.md).

## 12. Acceptance criteria

- `docs/HLD.md` exists and is consistent with the product scope in [docs/PRD.md](/home/nhtony318/.worktrees/lazytodo/laz-2/docs/PRD.md).
- Component boundaries are explicit enough for separate frontend and backend implementation.
- The domain model defines task ownership, lifecycle fields, and validation invariants.
- The auth and authorization model is documented, including anonymous request handling.
- The error model defines a normalized JSON envelope and status category mapping.
- The documented API surface is sufficient for create, list, complete, restore, and delete flows.
