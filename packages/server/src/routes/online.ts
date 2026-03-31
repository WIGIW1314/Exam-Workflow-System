import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/rbac.js';
import { onlineManager } from '../services/online-manager.js';
import { ok } from '../utils/response.js';

const router = Router();

router.get('/users', requireAuth, requireRole('admin', 'director'), async (req, res) => {
  const onlineUsers =
    req.user!.currentRole === 'admin'
      ? onlineManager.listAll()
      : onlineManager.listByDepartment(req.user!.departmentId ?? '');
  ok(res, {
    onlineUsers,
    count: onlineUsers.length,
  });
});

export default router;
