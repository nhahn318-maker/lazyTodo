import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import {
  ApiError,
  createTask,
  deleteTask,
  getSession,
  listTasks,
  updateTask,
} from './api'
import type { Task } from './api'

const TASK_TITLE_LIMIT = 200

type ViewState = 'loading' | 'session-required' | 'ready' | 'error'

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    if (left.completed !== right.completed) {
      return Number(left.completed) - Number(right.completed)
    }

    return right.createdAt.localeCompare(left.createdAt)
  })
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'unauthorized') {
      return 'Your session expired. Sign in again to manage tasks.'
    }

    if (error.code === 'validation_error' && error.details.length > 0) {
      const issue = error.details[0]
      if (issue.field === 'title') {
        if (issue.issue === 'blank' || issue.issue === 'required') {
          return 'Task title is required.'
        }

        if (issue.issue === 'too_long') {
          return `Task title must be ${TASK_TITLE_LIMIT} characters or fewer.`
        }
      }
    }

    return error.message
  }

  return 'Something went wrong while contacting the task API.'
}

function formatSyncTime(timestamp: string | null) {
  if (!timestamp) {
    return 'Not synced yet'
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp))
}

function DashboardPage() {
  const [viewState, setViewState] = useState<ViewState>('loading')
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [screenError, setScreenError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  async function hydrate() {
    setScreenError(null)
    setViewState('loading')

    try {
      const sessionResponse = await getSession()

      if (!sessionResponse.session.authenticated || !sessionResponse.session.user) {
        setUserId(null)
        setTasks([])
        setViewState('session-required')
        return
      }

      setUserId(sessionResponse.session.user.id)
      const taskResponse = await listTasks()
      setTasks(sortTasks(taskResponse.tasks))
      setLastSyncedAt(new Date().toISOString())
      setViewState('ready')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthorized') {
        setUserId(null)
        setTasks([])
        setViewState('session-required')
        return
      }

      setScreenError(getErrorMessage(error))
      setViewState('error')
    }
  }

  useEffect(() => {
    void hydrate()
  }, [])

  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.completed),
    [tasks],
  )
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.completed),
    [tasks],
  )

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setFormError('Task title is required.')
      return
    }

    if (trimmedTitle.length > TASK_TITLE_LIMIT) {
      setFormError(`Task title must be ${TASK_TITLE_LIMIT} characters or fewer.`)
      return
    }

    setFormError(null)
    setScreenError(null)
    setIsSaving(true)

    try {
      const response = await createTask(trimmedTitle)
      setTasks((currentTasks) => sortTasks([response.task, ...currentTasks]))
      setTitle('')
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthorized') {
        setViewState('session-required')
        return
      }

      setFormError(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleTask(task: Task) {
    setScreenError(null)
    setActiveTaskId(task.id)

    try {
      const response = await updateTask(task.id, !task.completed)
      setTasks((currentTasks) =>
        sortTasks(
          currentTasks.map((currentTask) =>
            currentTask.id === task.id ? response.task : currentTask,
          ),
        ),
      )
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthorized') {
        setViewState('session-required')
        return
      }

      setScreenError(getErrorMessage(error))
    } finally {
      setActiveTaskId(null)
    }
  }

  async function handleDeleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}" permanently?`)) {
      return
    }

    setScreenError(null)
    setActiveTaskId(task.id)

    try {
      await deleteTask(task.id)
      setTasks((currentTasks) =>
        currentTasks.filter((currentTask) => currentTask.id !== task.id),
      )
      setLastSyncedAt(new Date().toISOString())
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthorized') {
        setViewState('session-required')
        return
      }

      setScreenError(getErrorMessage(error))
    } finally {
      setActiveTaskId(null)
    }
  }

  return (
    <main className="shell">
      <section className="hero-panel">
        <p className="eyebrow">Phase 2 frontend</p>
        <h1>Keep the task loop brutally short.</h1>
        <p className="hero-copy">
          The client checks session state first, then keeps the task list in sync
          with the Phase 1 `/api/v1` contract.
        </p>
        <div className="hero-meta">
          <div className="meta-card">
            <span className="meta-label">Session</span>
            <strong>{userId ?? 'Unauthenticated'}</strong>
          </div>
          <div className="meta-card">
            <span className="meta-label">Last sync</span>
            <strong>{formatSyncTime(lastSyncedAt)}</strong>
          </div>
        </div>
      </section>

      <section className="board">
        <article className="composer card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Capture</p>
              <h2>Add a task</h2>
            </div>
            <span className="pill">Limit {TASK_TITLE_LIMIT}</span>
          </div>

          <form onSubmit={handleCreateTask} className="composer-form">
            <label className="field-label" htmlFor="task-title">
              Task title
            </label>
            <div className="composer-row">
              <input
                id="task-title"
                name="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Buy milk, call dentist, submit invoice"
                maxLength={TASK_TITLE_LIMIT}
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? 'task-form-error' : undefined}
                disabled={viewState !== 'ready' || isSaving}
              />
              <button type="submit" disabled={viewState !== 'ready' || isSaving}>
                {isSaving ? 'Saving...' : 'Add task'}
              </button>
            </div>
            {formError ? (
              <p id="task-form-error" className="inline-error" role="alert">
                {formError}
              </p>
            ) : null}
          </form>
        </article>

        {viewState === 'loading' ? (
          <article className="card state-card" aria-live="polite">
            <p className="eyebrow">Loading</p>
            <h2>Checking your session and task list...</h2>
          </article>
        ) : null}

        {viewState === 'session-required' ? (
          <article className="card state-card" aria-live="polite">
            <p className="eyebrow">Session required</p>
            <h2>Sign in before loading tasks.</h2>
            <p>
              `GET /api/v1/session` returned an unauthenticated state, so task
              requests stay blocked until a valid session cookie exists.
            </p>
            <button type="button" onClick={() => void hydrate()}>
              Retry session check
            </button>
          </article>
        ) : null}

        {viewState === 'error' ? (
          <article className="card state-card" aria-live="assertive">
            <p className="eyebrow">Load failed</p>
            <h2>{screenError ?? 'We could not load the dashboard.'}</h2>
            <button type="button" onClick={() => void hydrate()}>
              Retry
            </button>
          </article>
        ) : null}

        {viewState === 'ready' ? (
          <section className="lists">
            <article className="card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Focus</p>
                  <h2>Active tasks</h2>
                </div>
                <span className="pill">{activeTasks.length}</span>
              </div>

              {screenError ? (
                <p className="banner-error" role="alert">
                  {screenError}
                </p>
              ) : null}

              {activeTasks.length === 0 ? (
                <div className="empty-state">
                  <h3>Nothing open.</h3>
                  <p>Add a task above to start the list.</p>
                </div>
              ) : (
                <ul className="task-list" aria-label="Active tasks">
                  {activeTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      busy={activeTaskId === task.id}
                      onToggle={() => void handleToggleTask(task)}
                      onDelete={() => void handleDeleteTask(task)}
                    />
                  ))}
                </ul>
              )}
            </article>

            <article className="card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Archive</p>
                  <h2>Completed tasks</h2>
                </div>
                <span className="pill">{completedTasks.length}</span>
              </div>

              {completedTasks.length === 0 ? (
                <div className="empty-state">
                  <h3>No completed tasks yet.</h3>
                  <p>Finished items land here so the active list stays clean.</p>
                </div>
              ) : (
                <ul className="task-list" aria-label="Completed tasks">
                  {completedTasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      busy={activeTaskId === task.id}
                      onToggle={() => void handleToggleTask(task)}
                      onDelete={() => void handleDeleteTask(task)}
                    />
                  ))}
                </ul>
              )}
            </article>
          </section>
        ) : null}
      </section>
    </main>
  )
}

type TaskRowProps = {
  busy: boolean
  onDelete: () => void
  onToggle: () => void
  task: Task
}

function TaskRow({ busy, onDelete, onToggle, task }: TaskRowProps) {
  return (
    <li className={`task-row${task.completed ? ' is-complete' : ''}`}>
      <div className="task-copy">
        <p>{task.title}</p>
        <span>
          Created {new Date(task.createdAt).toLocaleDateString()} | Updated{' '}
          {new Date(task.updatedAt).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })}
        </span>
      </div>
      <div className="task-actions">
        <button type="button" onClick={onToggle} disabled={busy}>
          {task.completed ? 'Restore' : 'Complete'}
        </button>
        <button type="button" className="ghost-button" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </li>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
