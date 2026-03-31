import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { getPagination } from '../utils/pagination.js';
import { ok, paginated } from '../utils/response.js';

const router = Router();

router.get('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { page, pageSize, skip } = getPagination(req.query);
    const keyword = String(req.query.keyword ?? '');
    const where = keyword
      ? {
          OR: [
            { userName: { contains: keyword } },
            { detail: { contains: keyword } },
            { action: { contains: keyword } },
          ],
        }
      : {};
    const [list, total] = await Promise.all([
      prisma.auditLog.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);
    paginated(
      res,
      list.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      total,
      page,
      pageSize,
    );
  } catch (error) {
    next(error);
  }
});

router.post('/import', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const rows = z
      .array(
        z.object({
          userName: z.string(),
          action: z.string(),
          module: z.string(),
          detail: z.string(),
          ipAddress: z.string().optional().nullable(),
          statusCode: z.number().optional().nullable(),
          createdAt: z.string().optional().nullable(),
        }),
      )
      .parse(req.body.rows ?? []);
    await prisma.auditLog.createMany({
      data: rows.map((row) => ({
        userName: row.userName,
        action: row.action,
        module: row.module,
        detail: row.detail,
        ipAddress: row.ipAddress,
        statusCode: row.statusCode,
        createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      })),
    });
    ok(res, null, `成功导入 ${rows.length} 条审计日志`);
  } catch (error) {
    next(error);
  }
});

router.post('/batch-delete', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const ids = z.array(z.string()).min(1).parse(req.body.ids ?? []);
    await prisma.auditLog.deleteMany({ where: { id: { in: ids } } });
    ok(res, null, `成功删除 ${ids.length} 条审计日志`);
  } catch (error) {
    next(error);
  }
});

export default router;
