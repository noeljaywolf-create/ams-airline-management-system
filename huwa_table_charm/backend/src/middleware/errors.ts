// Central application error type used across services and routes.
export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notFound = (message = 'Resource not found') =>
  new AppError(404, 'NOT_FOUND', message);

export const badRequest = (message = 'Bad request', code = 'BAD_REQUEST') =>
  new AppError(400, code, message);

export const unauthorized = (message = 'Unauthorized') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message);

export const conflict = (message = 'Conflict') => new AppError(409, 'CONFLICT', message);

export const validationError = (message = 'Validation failed') =>
  new AppError(422, 'VALIDATION_ERROR', message);
