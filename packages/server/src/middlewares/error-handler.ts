import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      code: error.statusCode,
      message: error.message,
      details: error.details,
      timestamp: Date.now(),
    });
  }

  if (error instanceof ZodError) {
    return res.status(422).json({
      code: 422,
      message: '请求参数校验失败',
      details: error.flatten(),
      timestamp: Date.now(),
    });
  }

  logger.error(String(error));
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    timestamp: Date.now(),
  });
}
