# lazyTodo

`lazyTodo` is a minimal task manager built around a simple authenticated task loop:
check session, list tasks, create, toggle, and delete.

Phase 2 currently includes:

- a minimal Node.js backend that implements the approved task API contract
- a React frontend that consumes that contract from the browser

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

### Run backend

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

Run the backend tests with:

```bash
npm test
```

## Frontend

The Phase 2 frontend lives in `frontend/` and expects the Phase 1 API contract under `/api/v1`.

### Run frontend

```bash
cd frontend
npm install
npm run dev
```

Optional environment variables:

- `VITE_API_BASE_URL`: absolute origin for the backend API, for example `http://localhost:3000`

### Frontend quality checks

```bash
cd frontend
npm run lint
npm run typecheck
npm run test
npm run build
```

Repository-level gate:

```bash
bash ./.ao-tools/quality-gate.sh --skip-install
```
