import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized());
    }

    if (!roles.includes(req.user.currentRole)) {
      return next(forbidden());
    }

    next();
  };
}

export function requirePermission(...permissions: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized());
    }

    const role = await prisma.role.findUnique({
      where: { code: req.user.currentRole },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    const allowed = role?.permissions.map((item) => item.permission.code) ?? [];
    if (!permissions.some((permission) => allowed.includes(permission))) {
      return next(forbidden());
    }

    next();
  };
}
