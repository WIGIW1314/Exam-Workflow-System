import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { getAdminStats, getDirectorStats } from '../services/stats-service.js';
import { ok } from '../utils/response.js';

const router = Router();

router.use(requireAuth);

router.get('/admin', requireRole('admin'), async (_req, res, next) => {
  try {
    ok(res, await getAdminStats());
  } catch (error) {
    next(error);
  }
});

router.get('/director', requireRole('director'), async (req, res, next) => {
  try {
    ok(res, await getDirectorStats(req.user!.userId, req.user!.departmentId));
  } catch (error) {
    next(error);
  }
});

export default router;
