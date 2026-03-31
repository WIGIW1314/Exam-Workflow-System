import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { getPagination } from '../utils/pagination.js';
import { paginated } from '../utils/response.js';

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

export default router;
