import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/errors.js';

export function validate(schema: ZodTypeAny): RequestHandler {
  return async (req, _res, next) => {
    const result = await schema.safeParseAsync({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      return next(new AppError('请求参数校验失败', 422, result.error.flatten()));
    }

    req.body = result.data.body;
    req.query = result.data.query;
    req.params = result.data.params;
    next();
  };
}
