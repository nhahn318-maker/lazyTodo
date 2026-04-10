import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status: 200,
    ...init,
  })
}

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the session-required state when the API reports an anonymous session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        session: {
          authenticated: false,
          user: null,
        },
      }),
    )

    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', {
        name: /sign in before loading tasks/i,
      }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/session', expect.any(Object))
  })

  it('loads tasks and supports create, toggle, and delete flows', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          session: {
            authenticated: true,
            user: {
              id: 'usr_123',
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          tasks: [
            {
              id: 'tsk_1',
              title: 'Buy milk',
              completed: false,
              completedAt: null,
              createdAt: '2026-04-10T14:30:00Z',
              updatedAt: '2026-04-10T14:30:00Z',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          {
            task: {
              id: 'tsk_2',
              title: 'Call dentist',
              completed: false,
              completedAt: null,
              createdAt: '2026-04-10T15:00:00Z',
              updatedAt: '2026-04-10T15:00:00Z',
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
            completedAt: '2026-04-10T15:10:00Z',
            createdAt: '2026-04-10T14:30:00Z',
            updatedAt: '2026-04-10T15:10:00Z',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Buy milk')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/task title/i), 'Call dentist')
    await user.click(screen.getByRole('button', { name: /add task/i }))

    expect(await screen.findByText('Call dentist')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /complete/i })[0])

    await waitFor(() => {
      expect(screen.getByLabelText(/completed tasks/i)).toHaveTextContent('Buy milk')
    })

    await user.click(screen.getAllByRole('button', { name: /delete/i })[0])

    await waitFor(() => {
      expect(screen.queryByText('Call dentist')).not.toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/v1/tasks',
      expect.objectContaining({
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/v1/tasks/tsk_2',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      '/api/v1/tasks/tsk_1',
      expect.objectContaining({
        method: 'DELETE',
      }),
    )
  })
})
