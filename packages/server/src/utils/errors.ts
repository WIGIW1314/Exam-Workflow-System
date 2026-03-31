export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const notFound = (message = '资源不存在') => new AppError(message, 404);
export const forbidden = (message = '无权执行此操作') => new AppError(message, 403);
export const unauthorized = (message = '登录状态已失效') => new AppError(message, 401);
