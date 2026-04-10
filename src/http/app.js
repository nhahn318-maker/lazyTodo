const http = require('http');
const { TaskService } = require('../domain/taskService');
const { AppError, UnauthorizedError, ValidationError } = require('../lib/errors');
const { parseCookies, parseJsonBody, sendJson, sendNoContent } = require('../lib/http');
const { createRequestId } = require('../lib/ids');
const { InMemoryTaskRepository } = require('../persistence/inMemoryTaskRepository');

const DEMO_USER_ID = 'usr_123';
const DEMO_SESSION_ID = 'sid_demo_user';

function createAuthStore() {
  return new Map([[DEMO_SESSION_ID, { userId: DEMO_USER_ID }]]);
}

function createEventRecorder() {
  return {
    emit() {},
  };
}

function createApp(options = {}) {
  const taskService = options.taskService || new TaskService({
    taskRepository: options.taskRepository || new InMemoryTaskRepository(options.seedTasks),
    now: options.now,
  });
  const authStore = options.authStore || createAuthStore();
  const events = options.events || createEventRecorder();

  async function handler(req, res) {
    const requestId = createRequestId();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    try {
      if (req.method === 'GET' && url.pathname === '/api/v1/session') {
        const session = getSession(req, authStore);
        sendJson(res, 200, {
          session: session
            ? { authenticated: true, user: { id: session.userId } }
            : { authenticated: false, user: null },
        }, requestId);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/v1/tasks') {
        const session = requireSession(req, authStore);
        const tasks = taskService.listTasks(session.userId);
        sendJson(res, 200, { tasks }, requestId);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/v1/tasks') {
        const session = requireSession(req, authStore);
        const payload = await parseJsonBody(req);
        const task = taskService.createTask(session.userId, payload);
        events.emit('todo_created', { taskId: task.id, userId: session.userId });
        sendJson(res, 201, { task }, requestId);
        return;
      }

      const taskMatch = url.pathname.match(/^\/api\/v1\/tasks\/([^/]+)$/);
      if (taskMatch && req.method === 'PATCH') {
        const session = requireSession(req, authStore);
        const payload = await parseJsonBody(req);
        const task = taskService.updateTask(session.userId, taskMatch[1], payload);
        events.emit('todo_toggled', { taskId: task.id, userId: session.userId });
        sendJson(res, 200, { task }, requestId);
        return;
      }

      if (taskMatch && req.method === 'DELETE') {
        const session = requireSession(req, authStore);
        taskService.deleteTask(session.userId, taskMatch[1]);
        events.emit('todo_deleted', { taskId: taskMatch[1], userId: session.userId });
        sendNoContent(res, requestId);
        return;
      }

      throw new AppError(404, 'not_found', 'Route not found.', []);
    } catch (error) {
      handleError(res, requestId, error);
    }
  }

  return {
    handler,
    server: http.createServer(handler),
    auth: {
      demoSessionId: DEMO_SESSION_ID,
      demoUserId: DEMO_USER_ID,
    },
  };
}

function getSession(req, authStore) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.sid;
  if (!sessionId) {
    return null;
  }

  return authStore.get(sessionId) || null;
}

function requireSession(req, authStore) {
  const session = getSession(req, authStore);
  if (!session) {
    throw new UnauthorizedError();
  }

  return session;
}

function handleError(res, requestId, error) {
  if (error instanceof SyntaxError || error.message === 'Invalid JSON.') {
    sendJson(res, 400, {
      error: {
        code: 'validation_error',
        message: 'Request validation failed.',
        details: [{ field: 'body', issue: 'invalid_json' }],
        requestId,
      },
    }, requestId);
    return;
  }

  if (error instanceof AppError) {
    sendJson(res, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId,
      },
    }, requestId);
    return;
  }

  sendJson(res, 500, {
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred.',
      details: [],
      requestId,
    },
  }, requestId);
}

module.exports = {
  createApp,
  DEMO_SESSION_ID,
  DEMO_USER_ID,
  handleError,
};
