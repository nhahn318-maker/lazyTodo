import { describe, expect, it, vi } from 'vitest'
import { ApiError, createTask, deleteTask, listTasks, updateTask } from './api'

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
    ...init,
  })
}

describe('api client', () => {
  it('sends JSON requests with credentials to the task endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ tasks: [] }))
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            task: {
              id: 'tsk_1',
              title: 'Buy milk',
              completed: false,
              completedAt: null,
              createdAt: '2026-04-10T14:30:00Z',
              updatedAt: '2026-04-10T14:30:00Z',
            },
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          task: {
            id: 'tsk_1',
            title: 'Buy milk',
            completed: true,
            completedAt: '2026-04-10T14:45:00Z',
            createdAt: '2026-04-10T14:30:00Z',
            updatedAt: '2026-04-10T14:45:00Z',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    vi.stubGlobal('fetch', fetchMock)

    await listTasks()
    await createTask('Buy milk')
    await updateTask('tsk_1', true)
    await deleteTask('tsk_1')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/tasks',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/tasks',
      expect.objectContaining({
        body: JSON.stringify({ title: 'Buy milk' }),
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/tasks/tsk_1',
      expect.objectContaining({
        body: JSON.stringify({ completed: true }),
        credentials: 'include',
        method: 'PATCH',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/v1/tasks/tsk_1',
      expect.objectContaining({
        credentials: 'include',
        method: 'DELETE',
      }),
    )
  })

  it('normalizes API errors from the contract envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        createJsonResponse(
          {
            error: {
              code: 'validation_error',
              message: 'Request validation failed.',
              details: [{ field: 'title', issue: 'blank' }],
              requestId: 'req_123',
            },
          },
          { status: 400 },
        ),
      ),
    )

    await expect(createTask('')).rejects.toMatchObject({
      code: 'validation_error',
      details: [{ field: 'title', issue: 'blank' }],
      requestId: 'req_123',
      status: 400,
    } satisfies Partial<ApiError>)
  })
})
