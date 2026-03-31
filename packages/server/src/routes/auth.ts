import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { DEFAULT_PASSWORD } from '@exam-workflow/shared';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validator.js';
import { getIo } from '../socket/context.js';
import { recordAudit } from '../utils/audit.js';
import { signToken } from '../utils/auth.js';
import { AppError, unauthorized } from '../utils/errors.js';
import { mapUserSummary } from '../utils/mappers.js';
import { ok } from '../utils/response.js';

const router = Router();

router.post(
  '/login',
  validate(
    z.object({
      body: z.object({
        username: z.string().min(1),
        password: z.string().min(1),
      }),
      params: z.object({}),
      query: z.object({}),
    }),
  ),
  async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const user = await prisma.user.findUnique({
        where: { username },
        include: {
          department: true,
          roles: {
            include: {
              role: true,
            },
          },
        },
      });

      if (!user || !user.status) {
        throw unauthorized('用户名或密码错误');
      }

      const matched = await bcrypt.compare(password, user.password);
      if (!matched) {
        throw unauthorized('用户名或密码错误');
      }

      const roleCodes = user.roles.map((item) => item.role.code);
      if (!roleCodes.length) {
        throw new AppError('当前账号未分配角色', 400);
      }

      if (!roleCodes.includes('admin')) {
        const oldSessions = await prisma.session.findMany({ where: { userId: user.id } });
        try {
          const io = getIo();
          for (const session of oldSessions) {
            if (session.socketId) {
              io.to(session.socketId).emit('session:force-logout', {
                reason: '账号已在其他位置登录',
              });
            }
          }
        } catch {
          // ignore before socket init
        }
        await prisma.session.deleteMany({ where: { userId: user.id } });
      }

      const session = await prisma.session.create({
        data: {
          userId: user.id,
          token: 'pending',
          currentRole: roleCodes[0],
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        },
      });

      const token = signToken({
        userId: user.id,
        sessionId: session.id,
        roles: roleCodes,
        currentRole: session.currentRole,
        departmentId: user.departmentId,
      });

      await prisma.session.update({
        where: { id: session.id },
        data: { token },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: req.ip,
        },
      });

      req.user = {
        userId: user.id,
        sessionId: session.id,
        roles: roleCodes,
        currentRole: session.currentRole,
        departmentId: user.departmentId,
      };
      await recordAudit(req, 'user:login', 'auth', {});

      ok(
        res,
        {
          user: mapUserSummary(user),
          token,
          sessionId: session.id,
          currentRole: session.currentRole,
          availableRoles: roleCodes,
          defaultPassword: DEFAULT_PASSWORD,
        },
        '登录成功',
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await prisma.session.delete({ where: { id: req.user!.sessionId } });
    await recordAudit(req, 'user:logout', 'auth', {});
    ok(res, null, '退出成功');
  } catch (error) {
    next(error);
  }
});

router.post(
  '/switch-role',
  requireAuth,
  validate(
    z.object({
      body: z.object({ roleCode: z.string() }),
      params: z.object({}),
      query: z.object({}),
    }),
  ),
  async (req, res, next) => {
    try {
      const { roleCode } = req.body;
      if (!req.user!.roles.includes(roleCode)) {
        throw unauthorized('当前账号不具备该角色');
      }

      const token = signToken({
        ...req.user!,
        currentRole: roleCode,
      });

      await prisma.session.update({
        where: { id: req.user!.sessionId },
        data: { currentRole: roleCode, token },
      });

      await recordAudit(req, 'role:switch', 'auth', {
        roleName: roleCode,
      });

      ok(res, { token, currentRole: roleCode }, '角色切换成功');
    } catch (error) {
      next(error);
    }
  },
);

router.get('/profile', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      include: {
        department: true,
        roles: { include: { role: true } },
      },
    });

    ok(res, {
      user: mapUserSummary(user),
      sessionId: req.user!.sessionId,
      currentRole: req.user!.currentRole,
      availableRoles: req.user!.roles,
    });
  } catch (error) {
    next(error);
  }
});

router.put(
  '/password',
  requireAuth,
  validate(
    z.object({
      body: z.object({
        oldPassword: z.string().min(6),
        newPassword: z.string().min(6),
      }),
      params: z.object({}),
      query: z.object({}),
    }),
  ),
  async (req, res, next) => {
    try {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
      const matched = await bcrypt.compare(req.body.oldPassword, user.password);
      if (!matched) {
        throw new AppError('原密码不正确', 400);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { password: await bcrypt.hash(req.body.newPassword, 12) },
      });
      ok(res, null, '密码修改成功');
    } catch (error) {
      next(error);
    }
  },
);

export default router;
