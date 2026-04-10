class AppError extends Error {
  constructor(statusCode, code, message, details = []) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(details) {
    super(400, 'validation_error', 'Request validation failed.', details);
  }
}

class UnauthorizedError extends AppError {
  constructor() {
    super(401, 'unauthorized', 'Authentication is required.', []);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Task not found.') {
    super(404, 'not_found', message, []);
  }
}

module.exports = {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
};
