# API Contract

## 1. Purpose

This document defines the Phase 1 HTTP API contract for `lazyTodo`.

It is intentionally limited to the personal task lifecycle defined in [docs/PRD.md](/home/nhtony318/.worktrees/lazytodo/laz-2/docs/PRD.md) and the architecture in [docs/HLD.md](/home/nhtony318/.worktrees/lazytodo/laz-2/docs/HLD.md).

## 2. Contract conventions

### 2.1 Base path

- Base path: `/api/v1`
- Protocol: HTTPS in deployed environments
- Content type: `application/json`

### 2.2 Authentication

- Task endpoints require an authenticated session cookie.
- Unauthorized requests return `401`.
- Session state can be checked through `GET /api/v1/session`.

### 2.3 Resource naming

- Primary resource: `task`
- Collection resource: `tasks`

### 2.4 Timestamps

- All timestamps use ISO 8601 UTC strings.

Example:

```text
2026-04-10T14:30:00Z
```

### 2.5 Success envelope

Success responses use either a resource object or an object containing a resource list.

Single-resource example:

```json
{
  "task": {
    "id": "tsk_123",
    "title": "Buy milk",
    "completed": false,
    "completedAt": null,
    "createdAt": "2026-04-10T14:30:00Z",
    "updatedAt": "2026-04-10T14:30:00Z"
  }
}
```

List example:

```json
{
  "tasks": [
    {
      "id": "tsk_123",
      "title": "Buy milk",
      "completed": false,
      "completedAt": null,
      "createdAt": "2026-04-10T14:30:00Z",
      "updatedAt": "2026-04-10T14:30:00Z"
    }
  ]
}
```

### 2.6 Error envelope

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

### 2.7 Common validation rules

- `title` is required for creation.
- `title` must contain at least one non-whitespace character after trimming.
- `title` length must not exceed 200 characters.
- `taskId` must be a valid task identifier format defined by the implementation.
- Unknown top-level fields should be rejected with `validation_error` to keep the contract strict.

## 3. Schemas

### 3.1 Task

```json
{
  "id": "tsk_123",
  "title": "Buy milk",
  "completed": false,
  "completedAt": null,
  "createdAt": "2026-04-10T14:30:00Z",
  "updatedAt": "2026-04-10T14:30:00Z"
}
```

Field definitions:

- `id`: string
- `title`: string
- `completed`: boolean
- `completedAt`: string or null
- `createdAt`: string
- `updatedAt`: string

### 3.2 Session

```json
{
  "session": {
    "authenticated": true,
    "user": {
      "id": "usr_123"
    }
  }
}
```

When unauthenticated:

```json
{
  "session": {
    "authenticated": false,
    "user": null
  }
}
```

## 4. Endpoint contracts

### 4.1 Get session

`GET /api/v1/session`

Purpose:

- Allows the client to determine whether the current browser session is authenticated before loading task data.

Authentication:

- No authentication required to call the endpoint.

Response `200 OK`:

```json
{
  "session": {
    "authenticated": true,
    "user": {
      "id": "usr_123"
    }
  }
}
```

Notes:

- This endpoint never returns `401`.
- It returns session state explicitly instead.

### 4.2 List tasks

`GET /api/v1/tasks`

Purpose:

- Returns all tasks for the authenticated user.

Authentication:

- Required.

Query parameters:

- None in Phase 1.

Behavior:

- Return active tasks before completed tasks.
- Within each group, order by `createdAt` descending.

Response `200 OK`:

```json
{
  "tasks": [
    {
      "id": "tsk_124",
      "title": "Call dentist",
      "completed": false,
      "completedAt": null,
      "createdAt": "2026-04-10T15:00:00Z",
      "updatedAt": "2026-04-10T15:00:00Z"
    },
    {
      "id": "tsk_123",
      "title": "Buy milk",
      "completed": true,
      "completedAt": "2026-04-10T14:35:00Z",
      "createdAt": "2026-04-10T14:30:00Z",
      "updatedAt": "2026-04-10T14:35:00Z"
    }
  ]
}
```

Errors:

- `401 unauthorized`
- `internal_error`

Metrics:

- Client may emit `dashboard_viewed` after a successful render.
- Server may emit `dashboard_load_failed` on unrecoverable list failures.

### 4.3 Create task

`POST /api/v1/tasks`

Purpose:

- Creates a new task owned by the authenticated user.

Authentication:

- Required.

Request body:

```json
{
  "title": "Buy milk"
}
```

Response `201 Created`:

```json
{
  "task": {
    "id": "tsk_123",
    "title": "Buy milk",
    "completed": false,
    "completedAt": null,
    "createdAt": "2026-04-10T14:30:00Z",
    "updatedAt": "2026-04-10T14:30:00Z"
  }
}
```

Errors:

- `400 validation_error` for missing, blank, or too-long title
- `401 unauthorized`
- `internal_error`

Metrics:

- Emit `todo_created` after successful persistence.

### 4.4 Update task

`PATCH /api/v1/tasks/{taskId}`

Purpose:

- Updates mutable task state in Phase 1.
- Phase 1 supports completion toggling only.

Authentication:

- Required.

Request body:

```json
{
  "completed": true
}
```

Rules:

- Only `completed` is mutable in Phase 1.
- Setting `completed` to `true` sets `completedAt` to the current timestamp.
- Setting `completed` to `false` clears `completedAt`.

Response `200 OK`:

```json
{
  "task": {
    "id": "tsk_123",
    "title": "Buy milk",
    "completed": true,
    "completedAt": "2026-04-10T14:35:00Z",
    "createdAt": "2026-04-10T14:30:00Z",
    "updatedAt": "2026-04-10T14:35:00Z"
  }
}
```

Errors:

- `400 validation_error` for invalid `taskId`, missing `completed`, non-boolean `completed`, or unknown fields
- `401 unauthorized`
- `404 not_found` when the task does not exist or is not owned by the caller
- `internal_error`

Metrics:

- Emit `todo_toggled` after successful persistence.

### 4.5 Delete task

`DELETE /api/v1/tasks/{taskId}`

Purpose:

- Permanently removes a task owned by the authenticated user.

Authentication:

- Required.

Response `204 No Content`

Errors:

- `400 validation_error` for invalid `taskId`
- `401 unauthorized`
- `404 not_found` when the task does not exist or is not owned by the caller
- `internal_error`

Metrics:

- Emit `todo_deleted` after successful deletion.

## 5. Status code mapping

- `200 OK`: successful read or update
- `201 Created`: successful creation
- `204 No Content`: successful deletion
- `400 Bad Request`: validation failure
- `401 Unauthorized`: missing or invalid session
- `404 Not Found`: resource absent or inaccessible to the caller
- `500 Internal Server Error`: unexpected failure

## 6. Example validation errors

Blank title:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "title",
        "issue": "blank"
      }
    ],
    "requestId": "req_123"
  }
}
```

Task not found:

```json
{
  "error": {
    "code": "not_found",
    "message": "Task not found.",
    "details": [],
    "requestId": "req_123"
  }
}
```

Unauthorized:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Authentication is required.",
    "details": [],
    "requestId": "req_123"
  }
}
```

## 7. Compatibility notes

- The contract is strict enough for frontend mocking and backend schema validation.
- The session endpoint allows the product to evolve from a seeded single-user mode to full account auth without changing task endpoint shapes.
- Future enhancements such as title editing, filtering, pagination, or due dates should extend the schema additively under `/api/v1` when possible.

## 8. Acceptance criteria

- `docs/API_CONTRACT.md` exists and defines the task API needed for the Phase 1 scope.
- Endpoint contracts cover session lookup, task list, task creation, completion toggle, and deletion.
- Request and response examples use a normalized JSON style consistent with the documented error model.
- Validation, authentication, authorization, and status code behavior are explicit enough for implementation and testing.
