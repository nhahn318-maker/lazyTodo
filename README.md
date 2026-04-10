# lazyTodo

Phase 2 adds a minimal Node.js backend that implements the approved task API contract.

## Backend

The backend exposes these endpoints under `/api/v1`:

- `GET /api/v1/session`
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `PATCH /api/v1/tasks/:taskId`
- `DELETE /api/v1/tasks/:taskId`

The current implementation uses:

- a small built-in Node HTTP server
- an in-memory task repository
- a seeded session cookie for local development

## Run

Requirements:

- Node.js 20+

Start the server:

```bash
npm start
```

The server listens on `http://0.0.0.0:3000` by default.

Authenticated task endpoints require this development cookie:

```text
sid=sid_demo_user
```

Example requests:

```bash
curl http://localhost:3000/api/v1/session
curl --cookie "sid=sid_demo_user" http://localhost:3000/api/v1/tasks
curl --cookie "sid=sid_demo_user" \
  -H "content-type: application/json" \
  -d '{"title":"Buy milk"}' \
  http://localhost:3000/api/v1/tasks
```

## Test

Run the backend tests with:

```bash
npm test
```
