export type ErrorDetail = {
  field: string
  issue: string
}

export type ApiErrorEnvelope = {
  error: {
    code: string
    details?: ErrorDetail[]
    message: string
    requestId?: string
  }
}

export type SessionResponse = {
  session: {
    authenticated: boolean
    user: {
      id: string
    } | null
  }
}

export type Task = {
  id: string
  title: string
  completed: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export type TaskResponse = {
  task: Task
}

export type TaskListResponse = {
  tasks: Task[]
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  code: string
  details: ErrorDetail[]
  requestId?: string
  status: number

  constructor({
    code,
    details = [],
    message,
    requestId,
    status,
  }: {
    code: string
    details?: ErrorDetail[]
    message: string
    requestId?: string
    status: number
  }) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.details = details
    this.requestId = requestId
    this.status = status
  }
}

function buildUrl(pathname: string) {
  return `${apiBaseUrl}${pathname}`
}

async function request<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(pathname), {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    ...init,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json() : null

  if (!response.ok) {
    const envelope = payload as ApiErrorEnvelope | null

    throw new ApiError({
      code: envelope?.error.code ?? 'internal_error',
      details: envelope?.error.details ?? [],
      message: envelope?.error.message ?? 'Request failed.',
      requestId: envelope?.error.requestId,
      status: response.status,
    })
  }

  return payload as T
}

export function getSession() {
  return request<SessionResponse>('/api/v1/session')
}

export function listTasks() {
  return request<TaskListResponse>('/api/v1/tasks')
}

export function createTask(title: string) {
  return request<TaskResponse>('/api/v1/tasks', {
    body: JSON.stringify({ title }),
    method: 'POST',
  })
}

export function updateTask(taskId: string, completed: boolean) {
  return request<TaskResponse>(`/api/v1/tasks/${taskId}`, {
    body: JSON.stringify({ completed }),
    method: 'PATCH',
  })
}

export async function deleteTask(taskId: string) {
  await request<void>(`/api/v1/tasks/${taskId}`, {
    method: 'DELETE',
  })
}
