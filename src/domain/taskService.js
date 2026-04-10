const { NotFoundError, ValidationError } = require('../lib/errors');
const { createTaskId, isTaskId } = require('../lib/ids');

const TITLE_MAX_LENGTH = 200;

function assertPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertOnlyFields(payload, allowedFields) {
  const unknownFields = Object.keys(payload).filter((field) => !allowedFields.includes(field));
  if (unknownFields.length > 0) {
    throw new ValidationError(
      unknownFields.map((field) => ({
        field,
        issue: 'unknown',
      })),
    );
  }
}

function validateCreatePayload(payload) {
  if (!assertPlainObject(payload)) {
    throw new ValidationError([{ field: 'body', issue: 'required' }]);
  }

  assertOnlyFields(payload, ['title']);

  if (!Object.prototype.hasOwnProperty.call(payload, 'title')) {
    throw new ValidationError([{ field: 'title', issue: 'required' }]);
  }

  if (typeof payload.title !== 'string') {
    throw new ValidationError([{ field: 'title', issue: 'invalid_type' }]);
  }

  const title = payload.title.trim();
  if (!title) {
    throw new ValidationError([{ field: 'title', issue: 'blank' }]);
  }

  if (title.length > TITLE_MAX_LENGTH) {
    throw new ValidationError([{ field: 'title', issue: 'too_long' }]);
  }

  return { title };
}

function validateUpdatePayload(payload) {
  if (!assertPlainObject(payload)) {
    throw new ValidationError([{ field: 'body', issue: 'required' }]);
  }

  assertOnlyFields(payload, ['completed']);

  if (!Object.prototype.hasOwnProperty.call(payload, 'completed')) {
    throw new ValidationError([{ field: 'completed', issue: 'required' }]);
  }

  if (typeof payload.completed !== 'boolean') {
    throw new ValidationError([{ field: 'completed', issue: 'invalid_type' }]);
  }

  return payload;
}

function sanitizeTask(task) {
  return {
    id: task.id,
    title: task.title,
    completed: task.completed,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

class TaskService {
  constructor({ taskRepository, now = () => new Date().toISOString() }) {
    this.taskRepository = taskRepository;
    this.now = now;
  }

  listTasks(userId) {
    return this.taskRepository.listByUserId(userId).map(sanitizeTask);
  }

  createTask(userId, payload) {
    const { title } = validateCreatePayload(payload);
    const timestamp = this.now();
    const task = this.taskRepository.create({
      id: createTaskId(),
      userId,
      title,
      completed: false,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    return sanitizeTask(task);
  }

  updateTask(userId, taskId, payload) {
    if (!isTaskId(taskId)) {
      throw new ValidationError([{ field: 'taskId', issue: 'invalid' }]);
    }

    const { completed } = validateUpdatePayload(payload);
    const task = this.taskRepository.findById(taskId);
    if (!task || task.userId !== userId) {
      throw new NotFoundError();
    }

    const timestamp = this.now();
    const updatedTask = this.taskRepository.update({
      ...task,
      completed,
      completedAt: completed ? timestamp : null,
      updatedAt: timestamp,
    });

    return sanitizeTask(updatedTask);
  }

  deleteTask(userId, taskId) {
    if (!isTaskId(taskId)) {
      throw new ValidationError([{ field: 'taskId', issue: 'invalid' }]);
    }

    const task = this.taskRepository.findById(taskId);
    if (!task || task.userId !== userId) {
      throw new NotFoundError();
    }

    this.taskRepository.delete(taskId);
  }
}

module.exports = {
  TaskService,
};
