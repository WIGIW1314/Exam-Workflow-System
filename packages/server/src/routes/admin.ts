import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { DEFAULT_PASSWORD } from '@exam-workflow/shared';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middlewares/auth.js';
import { requirePermission, requireRole } from '../middlewares/rbac.js';
import { recordAudit } from '../utils/audit.js';
import { notFound } from '../utils/errors.js';
import { mapCourseSummary, mapUserSummary } from '../utils/mappers.js';
import { getPagination } from '../utils/pagination.js';
import { ok, paginated } from '../utils/response.js';

const router = Router();

router.use(requireAuth);

router.get('/lookups', async (_req, res, next) => {
  try {
    const [roles, users, departments, semesters] = await Promise.all([
      prisma.role.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.user.findMany({
        include: { roles: { include: { role: true } } },
        orderBy: { realName: 'asc' },
      }),
      prisma.department.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.semester.findMany({ orderBy: { startDate: 'desc' } }),
    ]);
    ok(res, {
      roles,
      users: users.map((user) => ({ id: user.id, realName: user.realName, username: user.username })),
      departments,
      semesters,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', requireRole('admin'), requirePermission('user:view'), async (req, res, next) => {
  try {
    const { page, pageSize, skip } = getPagination(req.query);
    const keyword = String(req.query.keyword ?? '');
    const where = keyword
      ? {
          OR: [
            { username: { contains: keyword } },
            { realName: { contains: keyword } },
            { email: { contains: keyword } },
          ],
        }
      : {};
    const [list, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        include: { department: true, roles: { include: { role: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);
    paginated(res, list.map(mapUserSummary), total, page, pageSize);
  } catch (error) {
    next(error);
  }
});

router.post('/users', requireRole('admin'), requirePermission('user:create'), async (req, res, next) => {
  try {
    const body = z
      .object({
        username: z.string().min(3),
        realName: z.string().min(2),
        email: z.string().email().optional().nullable(),
        phone: z.string().optional().nullable(),
        departmentId: z.string().optional().nullable(),
        status: z.boolean().default(true),
        roleCodes: z.array(z.string()).min(1),
      })
      .parse(req.body);
    const roles = await prisma.role.findMany({ where: { code: { in: body.roleCodes } } });
    const user = await prisma.user.create({
      data: {
        username: body.username,
        realName: body.realName,
        email: body.email,
        phone: body.phone,
        departmentId: body.departmentId,
        status: body.status,
        password: await bcrypt.hash(DEFAULT_PASSWORD, 12),
        roles: {
          create: roles.map((role) => ({ roleId: role.id })),
        },
      },
      include: { department: true, roles: { include: { role: true } } },
    });
    await recordAudit(req, 'user:create', 'users', { targetName: user.realName });
    ok(res, mapUserSummary(user), '用户创建成功');
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', requireRole('admin'), requirePermission('user:update'), async (req, res, next) => {
  try {
    const userId = String(req.params.id);
    const body = z
      .object({
        realName: z.string().min(2),
        email: z.string().email().optional().nullable(),
        phone: z.string().optional().nullable(),
        departmentId: z.string().optional().nullable(),
        status: z.boolean().default(true),
      })
      .parse(req.body);
    const user = await prisma.user.update({
      where: { id: userId },
      data: body,
      include: { department: true, roles: { include: { role: true } } },
    });
    await recordAudit(req, 'user:update', 'users', { targetName: user.realName });
    ok(res, mapUserSummary(user), '用户更新成功');
  } catch (error) {
    next(error);
  }
});

router.delete('/users/:id', requireRole('admin'), requirePermission('user:delete'), async (req, res, next) => {
  try {
    const userId = String(req.params.id);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw notFound('用户不存在');
    }
    await prisma.user.delete({ where: { id: userId } });
    await recordAudit(req, 'user:delete', 'users', { targetName: user.realName });
    ok(res, null, '用户删除成功');
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/roles', requireRole('admin'), async (req, res, next) => {
  try {
    const userId = String(req.params.id);
    const roleCodes = z.array(z.string()).parse(req.body.roleCodes ?? []);
    const roles = await prisma.role.findMany({ where: { code: { in: roleCodes } } });
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.userRole.createMany({
      data: roles.map((role) => ({ userId, roleId: role.id })),
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await recordAudit(req, 'role:assign', 'users', {
      targetName: user.realName,
      roleName: roleCodes.join(','),
    });
    ok(res, null, '角色分配成功');
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/reset-password', requireRole('admin'), async (req, res, next) => {
  try {
    const userId = String(req.params.id);
    await prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(DEFAULT_PASSWORD, 12) },
    });
    ok(res, null, '密码已重置为 123456');
  } catch (error) {
    next(error);
  }
});

router.post('/users/batch-import', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = z
      .array(
        z.object({
          username: z.string(),
          realName: z.string(),
          roleCodes: z.array(z.string()).min(1),
          departmentId: z.string().optional().nullable(),
        }),
      )
      .parse(req.body.rows ?? []);
    for (const row of rows) {
      const roles = await prisma.role.findMany({ where: { code: { in: row.roleCodes } } });
      const user = await prisma.user.upsert({
        where: { username: row.username },
        update: {
          realName: row.realName,
          departmentId: row.departmentId,
        },
        create: {
          username: row.username,
          realName: row.realName,
          departmentId: row.departmentId,
          password: await bcrypt.hash(DEFAULT_PASSWORD, 12),
        },
      });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.createMany({
        data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
      });
    }
    ok(res, null, `成功导入 ${rows.length} 个用户`);
  } catch (error) {
    next(error);
  }
});

router.get('/roles', requireRole('admin'), async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: { permission: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    ok(
      res,
      roles.map((role) => ({
        ...role,
        permissions: role.permissions.map((entry) => entry.permission),
      })),
    );
  } catch (error) {
    next(error);
  }
});

router.put('/roles/:id/permissions', requireRole('admin'), async (req, res, next) => {
  try {
    const roleId = String(req.params.id);
    const permissionCodes = z.array(z.string()).parse(req.body.permissionCodes ?? []);
    const permissions = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    await prisma.rolePermission.deleteMany({ where: { roleId } });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
    });
    ok(res, null, '角色权限更新成功');
  } catch (error) {
    next(error);
  }
});

router.get('/permissions', requireRole('admin'), async (_req, res, next) => {
  try {
    ok(res, await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] }));
  } catch (error) {
    next(error);
  }
});

router.get('/semesters', requireRole('admin'), async (_req, res, next) => {
  try {
    ok(res, await prisma.semester.findMany({ orderBy: { startDate: 'desc' } }));
  } catch (error) {
    next(error);
  }
});

router.post('/semesters', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string(),
        code: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        isCurrent: z.boolean().default(false),
        status: z.boolean().default(true),
      })
      .parse(req.body);
    if (body.isCurrent) {
      await prisma.semester.updateMany({ data: { isCurrent: false } });
    }
    const semester = await prisma.semester.create({
      data: { ...body, startDate: new Date(body.startDate), endDate: new Date(body.endDate) },
    });
    ok(res, semester, '学期创建成功');
  } catch (error) {
    next(error);
  }
});

router.put('/semesters/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const semesterId = String(req.params.id);
    const body = z
      .object({
        name: z.string(),
        code: z.string(),
        startDate: z.string(),
        endDate: z.string(),
        isCurrent: z.boolean().default(false),
        status: z.boolean().default(true),
      })
      .parse(req.body);
    if (body.isCurrent) {
      await prisma.semester.updateMany({ data: { isCurrent: false } });
    }
    const semester = await prisma.semester.update({
      where: { id: semesterId },
      data: { ...body, startDate: new Date(body.startDate), endDate: new Date(body.endDate) },
    });
    ok(res, semester, '学期更新成功');
  } catch (error) {
    next(error);
  }
});

router.delete('/semesters/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await prisma.semester.delete({ where: { id: String(req.params.id) } });
    ok(res, null, '学期删除成功');
  } catch (error) {
    next(error);
  }
});

router.put('/semesters/:id/set-current', requireRole('admin'), async (req, res, next) => {
  try {
    const semesterId = String(req.params.id);
    await prisma.semester.updateMany({ data: { isCurrent: false } });
    await prisma.semester.update({ where: { id: semesterId }, data: { isCurrent: true } });
    ok(res, null, '当前学期已更新');
  } catch (error) {
    next(error);
  }
});

router.get('/departments', requireRole('admin'), async (_req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      include: { director: true, members: true },
      orderBy: { sortOrder: 'asc' },
    });
    ok(
      res,
      departments.map((item) => ({
        ...item,
        directorName: item.director?.realName ?? null,
        memberCount: item.members.length,
      })),
    );
  } catch (error) {
    next(error);
  }
});

router.post('/departments', requireRole('admin'), async (req, res, next) => {
  try {
    const department = await prisma.department.create({
      data: z
        .object({
          name: z.string(),
          code: z.string(),
          description: z.string().optional().nullable(),
          directorId: z.string().optional().nullable(),
          sortOrder: z.number().default(0),
          status: z.boolean().default(true),
        })
        .parse(req.body),
    });
    ok(res, department, '教研室创建成功');
  } catch (error) {
    next(error);
  }
});

router.put('/departments/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const departmentId = String(req.params.id);
    const department = await prisma.department.update({
      where: { id: departmentId },
      data: z
        .object({
          name: z.string(),
          code: z.string(),
          description: z.string().optional().nullable(),
          directorId: z.string().optional().nullable(),
          sortOrder: z.number().default(0),
          status: z.boolean().default(true),
        })
        .parse(req.body),
    });
    ok(res, department, '教研室更新成功');
  } catch (error) {
    next(error);
  }
});

router.delete('/departments/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await prisma.department.delete({ where: { id: String(req.params.id) } });
    ok(res, null, '教研室删除成功');
  } catch (error) {
    next(error);
  }
});

router.get('/courses', requireRole('admin'), async (req, res, next) => {
  try {
    const { page, pageSize, skip } = getPagination(req.query);
    const keyword = String(req.query.keyword ?? '');
    const where = keyword
      ? {
          OR: [
            { courseName: { contains: keyword } },
            { courseCode: { contains: keyword } },
            { teacher: { realName: { contains: keyword } } },
          ],
        }
      : {};
    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: pageSize,
        include: { semester: true, teacher: true, department: true, classes: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.course.count({ where }),
    ]);
    paginated(res, courses.map(mapCourseSummary), total, page, pageSize);
  } catch (error) {
    next(error);
  }
});

router.post('/courses', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z
      .object({
        semesterId: z.string(),
        courseCode: z.string(),
        courseName: z.string(),
        teacherId: z.string(),
        departmentId: z.string(),
        creditHours: z.number().optional().nullable(),
        courseType: z.string().optional().nullable(),
        classNames: z.array(z.string()).default([]),
      })
      .parse(req.body);
    const course = await prisma.course.create({
      data: {
        semesterId: body.semesterId,
        courseCode: body.courseCode,
        courseName: body.courseName,
        teacherId: body.teacherId,
        departmentId: body.departmentId,
        creditHours: body.creditHours,
        courseType: body.courseType,
        classes: { create: body.classNames.map((className) => ({ className })) },
      },
      include: { semester: true, teacher: true, department: true, classes: true },
    });
    ok(res, mapCourseSummary(course), '课程创建成功');
  } catch (error) {
    next(error);
  }
});

router.put('/courses/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const courseId = String(req.params.id);
    const body = z
      .object({
        semesterId: z.string(),
        courseCode: z.string(),
        courseName: z.string(),
        teacherId: z.string(),
        departmentId: z.string(),
        creditHours: z.number().optional().nullable(),
        courseType: z.string().optional().nullable(),
        classNames: z.array(z.string()).default([]),
      })
      .parse(req.body);
    await prisma.courseClass.deleteMany({ where: { courseId } });
    const course = await prisma.course.update({
      where: { id: courseId },
      data: {
        semesterId: body.semesterId,
        courseCode: body.courseCode,
        courseName: body.courseName,
        teacherId: body.teacherId,
        departmentId: body.departmentId,
        creditHours: body.creditHours,
        courseType: body.courseType,
        classes: { create: body.classNames.map((className) => ({ className })) },
      },
      include: { semester: true, teacher: true, department: true, classes: true },
    });
    ok(res, mapCourseSummary(course), '课程更新成功');
  } catch (error) {
    next(error);
  }
});

router.delete('/courses/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await prisma.course.delete({ where: { id: String(req.params.id) } });
    ok(res, null, '课程删除成功');
  } catch (error) {
    next(error);
  }
});

router.post('/courses/import', requireRole('admin'), async (req, res, next) => {
  try {
    const rows = z
      .array(
        z.object({
          semesterId: z.string(),
          courseCode: z.string(),
          courseName: z.string(),
          teacherId: z.string(),
          departmentId: z.string(),
          classNames: z.array(z.string()),
          creditHours: z.number().optional(),
          courseType: z.string().optional(),
        }),
      )
      .parse(req.body.rows ?? []);
    for (const row of rows) {
      await prisma.course.create({
        data: {
          semesterId: row.semesterId,
          courseCode: row.courseCode,
          courseName: row.courseName,
          teacherId: row.teacherId,
          departmentId: row.departmentId,
          creditHours: row.creditHours,
          courseType: row.courseType,
          classes: { create: row.classNames.map((className) => ({ className })) },
        },
      });
    }
    await recordAudit(req, 'course:import', 'course', {
      count: rows.length,
      semesterName: '批量导入',
    });
    ok(res, null, `成功导入 ${rows.length} 条课程数据`);
  } catch (error) {
    next(error);
  }
});

router.get('/courses/my', async (req, res, next) => {
  try {
    const currentSemester = await prisma.semester.findFirst({ where: { isCurrent: true } });
    const semesterId = String(req.query.semesterId ?? currentSemester?.id ?? '');
    const courses = await prisma.course.findMany({
      where: { teacherId: req.user!.userId, semesterId: semesterId || undefined },
      include: { semester: true, teacher: true, department: true, classes: true },
      orderBy: { courseCode: 'asc' },
    });
    ok(res, courses.map(mapCourseSummary));
  } catch (error) {
    next(error);
  }
});

router.get('/number-rules', requireRole('admin'), async (_req, res, next) => {
  try {
    const rules = await prisma.numberRule.findMany({
      include: { semester: true },
      orderBy: { createdAt: 'desc' },
    });
    ok(
      res,
      rules.map((rule) => ({
        ...rule,
        semesterName: rule.semester.name,
      })),
    );
  } catch (error) {
    next(error);
  }
});

router.post('/number-rules', requireRole('admin'), async (req, res, next) => {
  try {
    const body = z
      .object({
        semesterId: z.string(),
        prefix: z.string(),
        separator: z.string(),
        dateFormat: z.string(),
        seqLength: z.number().min(2).max(8),
        description: z.string().optional().nullable(),
      })
      .parse(req.body);
    const rule = await prisma.numberRule.create({
      data: {
        ...body,
        example: `${body.prefix}${body.separator}202603${body.separator}${String(1).padStart(body.seqLength, '0')}`,
      },
      include: { semester: true },
    });
    await recordAudit(req, 'number-rule:set', 'workflow', { semesterName: rule.semester.name });
    ok(res, rule, '编号规则创建成功');
  } catch (error) {
    next(error);
  }
});

router.put('/number-rules/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const ruleId = String(req.params.id);
    const body = z
      .object({
        prefix: z.string(),
        separator: z.string(),
        dateFormat: z.string(),
        seqLength: z.number().min(2).max(8),
        currentSeq: z.number().min(0).default(0),
        description: z.string().optional().nullable(),
      })
      .parse(req.body);
    const rule = await prisma.numberRule.update({
      where: { id: ruleId },
      data: {
        ...body,
        example: `${body.prefix}${body.separator}202603${body.separator}${String(1).padStart(body.seqLength, '0')}`,
      },
      include: { semester: true },
    });
    await recordAudit(req, 'number-rule:set', 'workflow', { semesterName: rule.semester.name });
    ok(res, rule, '编号规则更新成功');
  } catch (error) {
    next(error);
  }
});

router.get('/settings', requireRole('admin'), async (_req, res, next) => {
  try {
    ok(res, await prisma.systemConfig.findMany({ orderBy: { key: 'asc' } }));
  } catch (error) {
    next(error);
  }
});

router.put('/settings', requireRole('admin'), async (req, res, next) => {
  try {
    const entries = z.array(z.object({ key: z.string(), value: z.string(), description: z.string().optional() })).parse(req.body);
    for (const entry of entries) {
      await prisma.systemConfig.upsert({
        where: { key: entry.key },
        update: { value: entry.value, description: entry.description },
        create: entry,
      });
    }
    ok(res, null, '系统配置已保存');
  } catch (error) {
    next(error);
  }
});

router.post('/uploads/temp-file', requireRole('admin'), async (req, res, next) => {
  try {
    const fileName = `${randomUUID()}.${String(req.body.ext ?? 'bin')}`;
    const targetPath = path.join(process.cwd(), 'uploads', fileName);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, Buffer.from(String(req.body.content ?? ''), 'base64'));
    ok(res, { filePath: targetPath });
  } catch (error) {
    next(error);
  }
});

export default router;
