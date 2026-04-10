# lazyTodo frontend

This app implements the Phase 2 frontend for the approved task-management contract.

## Available scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run quality:gate
```

## API configuration

The client sends cookie-authenticated requests to `/api/v1` by default.

Set `VITE_API_BASE_URL` when the frontend and backend run on different origins:

```bash
VITE_API_BASE_URL=http://localhost:4000 npm run dev
```

## Test coverage

- API client request and error-envelope handling
- session-required state
- create, complete or restore, and delete task flows
