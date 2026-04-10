const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, DEMO_SESSION_ID } = require('../src/http/app');
const { InMemoryTaskRepository } = require('../src/persistence/inMemoryTaskRepository');

function createTestServer(seedTasks = []) {
  const taskRepository = new InMemoryTaskRepository(seedTasks);
  const emittedEvents = [];
  const app = createApp({
    taskRepository,
    now: () => '2026-04-10T14:30:00Z',
    events: {
      emit(name, payload) {
        emittedEvents.push({ name, payload });
      },
    },
  });

  return { ...app, emittedEvents };
}

async function withServer(app, run) {
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({
      async request(path, options = {}) {
        return fetch(`${baseUrl}${path}`, options);
      },
    });
  } finally {
    await new Promise((resolve, reject) => app.server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('GET /api/v1/session returns unauthenticated without a cookie', async () => {
  const app = createTestServer();
  await withServer(app, async ({ request }) => {
    const response = await request('/api/v1/session');
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      session: {
        authenticated: false,
        user: null,
      },
    });
  });
});

test('authenticated task flow matches the contract', async () => {
  const seedTasks = [
    {
      id: 'tsk_aaaaaaaaaaaa',
      userId: 'usr_123',
      title: 'Completed task',
      completed: true,
      completedAt: '2026-04-09T10:00:00Z',
      createdAt: '2026-04-09T09:00:00Z',
      updatedAt: '2026-04-09T10:00:00Z',
    },
    {
      id: 'tsk_bbbbbbbbbbbb',
      userId: 'usr_123',
      title: 'Active task',
      completed: false,
      completedAt: null,
      createdAt: '2026-04-10T09:00:00Z',
      updatedAt: '2026-04-10T09:00:00Z',
    },
  ];
  const app = createTestServer(seedTasks);
  const authHeaders = { cookie: `sid=${DEMO_SESSION_ID}` };

  await withServer(app, async ({ request }) => {
    const sessionResponse = await request('/api/v1/session', { headers: authHeaders });
    assert.equal(sessionResponse.status, 200);
    assert.deepEqual(await sessionResponse.json(), {
      session: {
        authenticated: true,
        user: { id: 'usr_123' },
      },
    });

    const listResponse = await request('/api/v1/tasks', { headers: authHeaders });
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.tasks.length, 2);
    assert.equal(listed.tasks[0].id, 'tsk_bbbbbbbbbbbb');
    assert.equal(listed.tasks[1].id, 'tsk_aaaaaaaaaaaa');

    const createResponse = await request('/api/v1/tasks', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: '  Buy milk  ' }),
    });
    assert.equal(createResponse.status, 201);
    const createdPayload = await createResponse.json();
    assert.match(createdPayload.task.id, /^tsk_[a-f0-9]{12}$/);
    assert.equal(createdPayload.task.title, 'Buy milk');
    assert.equal(createdPayload.task.completed, false);
    assert.equal(createdPayload.task.completedAt, null);

    const patchResponse = await request(`/api/v1/tasks/${createdPayload.task.id}`, {
      method: 'PATCH',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(patchResponse.status, 200);
    const patchedPayload = await patchResponse.json();
    assert.equal(patchedPayload.task.completed, true);
    assert.equal(patchedPayload.task.completedAt, '2026-04-10T14:30:00Z');

    const deleteResponse = await request(`/api/v1/tasks/${createdPayload.task.id}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    assert.equal(deleteResponse.status, 204);
    assert.equal(await deleteResponse.text(), '');
  });

  assert.deepEqual(app.emittedEvents.map((event) => event.name), [
    'todo_created',
    'todo_toggled',
    'todo_deleted',
  ]);
});

test('task endpoints reject missing authentication', async () => {
  const app = createTestServer();
  await withServer(app, async ({ request }) => {
    const response = await request('/api/v1/tasks');
    const payload = await response.json();

    assert.equal(response.status, 401);
    assert.equal(payload.error.code, 'unauthorized');
    assert.equal(payload.error.message, 'Authentication is required.');
    assert.deepEqual(payload.error.details, []);
    assert.match(payload.error.requestId, /^req_[a-f0-9]{12}$/);
  });
});

test('validation errors are strict for unknown fields and invalid ids', async () => {
  const app = createTestServer();
  const headers = {
    cookie: `sid=${DEMO_SESSION_ID}`,
    'content-type': 'application/json',
  };

  await withServer(app, async ({ request }) => {
    const createResponse = await request('/api/v1/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'Task', extra: true }),
    });
    assert.equal(createResponse.status, 400);
    assert.deepEqual((await createResponse.json()).error.details, [
      { field: 'extra', issue: 'unknown' },
    ]);

    const patchResponse = await request('/api/v1/tasks/not-a-task-id', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ completed: true }),
    });
    assert.equal(patchResponse.status, 400);
    assert.deepEqual((await patchResponse.json()).error.details, [
      { field: 'taskId', issue: 'invalid' },
    ]);
  });
});

test('cross-user access returns not found', async () => {
  const app = createTestServer([
    {
      id: 'tsk_cccccccccccc',
      userId: 'usr_other',
      title: 'Private task',
      completed: false,
      completedAt: null,
      createdAt: '2026-04-10T09:00:00Z',
      updatedAt: '2026-04-10T09:00:00Z',
    },
  ]);

  await withServer(app, async ({ request }) => {
    const response = await request('/api/v1/tasks/tsk_cccccccccccc', {
      method: 'DELETE',
      headers: { cookie: `sid=${DEMO_SESSION_ID}` },
    });
    const payload = await response.json();

    assert.equal(response.status, 404);
    assert.equal(payload.error.code, 'not_found');
    assert.equal(payload.error.message, 'Task not found.');
    assert.deepEqual(payload.error.details, []);
  });
});
