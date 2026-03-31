import type { Response } from 'express';

export function ok<T>(res: Response, data?: T, message = '操作成功') {
  res.json({
    code: 0,
    message,
    data,
    timestamp: Date.now(),
  });
}

export function paginated<T>(
  res: Response,
  list: T[],
  total: number,
  page: number,
  pageSize: number,
  message = '操作成功',
) {
  ok(res, { list, total, page, pageSize }, message);
}
